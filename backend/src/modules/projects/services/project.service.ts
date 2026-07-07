import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Project, ProjectSetupStatus } from '../entities/project.entity';
import { TimeEntry, TimeEntryStatus } from '../entities/time-entry.entity';
import { ProjectAssignment } from '../entities/project-assignment.entity';
import {
  CreateProjectDto,
  UpdateProjectDto,
  CreateTimeEntryDto,
  UpdateTimeEntryDto,
  ApproveTimeEntryDto,
  CreateProjectAssignmentDto,
  UpdateProjectSetupDto,
} from '../dto/project.dto';
import { AuthService } from '../../auth/auth.service';
import { UserNotificationType } from '../../auth/entities/user-notification.entity';

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(TimeEntry)
    private timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(ProjectAssignment)
    private assignmentRepository: Repository<ProjectAssignment>,
    private authService: AuthService,
  ) {}

  private generateCode(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PROJ-${year}-${random}`;
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepository.create({
      ...dto,
      code: this.generateCode(),
    });
    return this.projectRepository.save(project);
  }

  async findAll(): Promise<Project[]> {
    return this.projectRepository.find({
      relations: ['client', 'coordinator'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: ['client', 'coordinator', 'timeEntries', 'assignments'],
    });
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    await this.findOne(id);
    await this.projectRepository.update(id, dto);
    return this.findOne(id);
  }

  async updateSetup(id: string, dto: UpdateProjectSetupDto): Promise<Project> {
    await this.findOne(id);

    const updateData: Partial<Project> = {
      setupStatus: ProjectSetupStatus.IN_PROGRESS,
    };

    if (dto.coordinatorId !== undefined) {
      updateData.coordinatorId = dto.coordinatorId || null;
    }

    if (dto.dailyLimitHours !== undefined) {
      updateData.dailyLimitHours = dto.dailyLimitHours;
    }

    if (dto.requiresApproval !== undefined) {
      updateData.requiresApproval = dto.requiresApproval;
    }

    await this.projectRepository.update(id, updateData);
    return this.findOne(id);
  }

  async completeSetup(id: string, userId?: string): Promise<Project> {
    const project = await this.findOne(id);

    if (!project.coordinatorId) {
      throw new BadRequestException('Defina um coordenador antes de concluir o setup');
    }

    if (project.setupStatus === ProjectSetupStatus.COMPLETED) {
      return project;
    }

    await this.projectRepository.update(id, {
      setupStatus: ProjectSetupStatus.COMPLETED,
      setupCompletedAt: new Date(),
      setupCompletedById: userId || null,
    });

    const updatedProject = await this.findOne(id);

    await this.authService.createNotification({
      userId: project.coordinatorId,
      type: UserNotificationType.PROJECT_SETUP_COMPLETED,
      title: 'Projeto configurado',
      message: `O projeto ${project.code} · ${project.name} foi configurado e aguarda a alocação dos colaboradores.`,
      link: `/projects?projectId=${project.id}`,
      metadata: {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        action: 'allocate_project_members',
      },
    });

    return updatedProject;
  }

  async remove(id: string): Promise<void> {
    const result = await this.projectRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
  }

  async getProjectStats(id: string): Promise<any> {
    const project = await this.findOne(id);
    
    const totalHours = await this.timeEntryRepository
      .createQueryBuilder('entry')
      .select('SUM(entry.hours)', 'total')
      .where('entry.projectId = :id', { id })
      .andWhere('entry.status = :status', { status: TimeEntryStatus.APPROVED })
      .getRawOne();

    const pendingHours = await this.timeEntryRepository
      .createQueryBuilder('entry')
      .select('SUM(entry.hours)', 'total')
      .where('entry.projectId = :id', { id })
      .andWhere('entry.status = :status', { status: TimeEntryStatus.PENDING })
      .getRawOne();

    return {
      project,
      budgetHours: project.budgetHours,
      consumedHours: parseFloat(totalHours?.total) || 0,
      pendingHours: parseFloat(pendingHours?.total) || 0,
      remainingHours: project.budgetHours - (parseFloat(totalHours?.total) || 0),
    };
  }

  async createTimeEntry(dto: CreateTimeEntryDto, userId?: string): Promise<TimeEntry> {
    const project = await this.findOne(dto.projectId);
    
    const entryDate = new Date(dto.entryDate);
    const startOfDay = new Date(entryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(entryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const dailyEntries = await this.timeEntryRepository.find({
      where: {
        collaboratorId: dto.collaboratorId,
        entryDate: Between(startOfDay, endOfDay),
      },
    });

    const totalDailyHours = dailyEntries.reduce((sum, entry) => sum + parseFloat(String(entry.hours)), 0);

    if (totalDailyHours + dto.hours > project.dailyLimitHours) {
      throw new BadRequestException(
        `Daily limit exceeded. Current: ${totalDailyHours}h, Limit: ${project.dailyLimitHours}h`
      );
    }

    const status = project.requiresApproval ? TimeEntryStatus.PENDING : TimeEntryStatus.APPROVED;

    const timeEntry = this.timeEntryRepository.create({
      ...dto,
      status,
    });

    return this.timeEntryRepository.save(timeEntry);
  }

  async getTimeEntries(projectId: string): Promise<TimeEntry[]> {
    return this.timeEntryRepository.find({
      where: { projectId },
      relations: ['collaborator', 'approvedBy'],
      order: { entryDate: 'DESC' },
    });
  }

  async updateTimeEntry(id: string, dto: UpdateTimeEntryDto): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Time entry with ID ${id} not found`);
    }

    if (entry.status === TimeEntryStatus.APPROVED) {
      throw new BadRequestException('Cannot modify approved time entries');
    }

    await this.timeEntryRepository.update(id, dto);
    return this.timeEntryRepository.findOne({ where: { id }, relations: ['collaborator'] });
  }

  async approveTimeEntry(id: string, dto: ApproveTimeEntryDto, userId: string): Promise<TimeEntry> {
    const entry = await this.timeEntryRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Time entry with ID ${id} not found`);
    }

    await this.timeEntryRepository.update(id, {
      status: dto.status,
      approvedById: userId,
      approvedAt: new Date(),
      rejectionReason: dto.rejectionReason,
    });

    return this.timeEntryRepository.findOne({ where: { id }, relations: ['collaborator', 'approvedBy'] });
  }

  async deleteTimeEntry(id: string): Promise<void> {
    const entry = await this.timeEntryRepository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Time entry with ID ${id} not found`);
    }

    if (entry.status === TimeEntryStatus.APPROVED) {
      throw new BadRequestException('Cannot delete approved time entries');
    }

    await this.timeEntryRepository.delete(id);
  }

  async createAssignment(dto: CreateProjectAssignmentDto): Promise<ProjectAssignment> {
    const assignment = this.assignmentRepository.create(dto);
    return this.assignmentRepository.save(assignment);
  }

  async getAssignments(projectId: string): Promise<ProjectAssignment[]> {
    return this.assignmentRepository.find({
      where: { projectId },
      relations: ['collaborator'],
    });
  }

  async deleteAssignment(id: string): Promise<void> {
    const result = await this.assignmentRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
  }
}
