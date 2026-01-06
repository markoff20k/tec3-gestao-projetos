import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proposal, ProposalStatus } from '../entities/proposal.entity';
import { ProposalRevision } from '../entities/proposal-revision.entity';
import { ProposalExpense } from '../entities/proposal-expense.entity';
import { ProposalAdditive } from '../entities/proposal-additive.entity';
import { Project, ProjectStatus } from '../../projects/entities/project.entity';
import {
  CreateProposalDto,
  UpdateProposalDto,
  CreateProposalRevisionDto,
  CreateProposalExpenseDto,
  CreateProposalAdditiveDto,
  ConvertToProjectDto,
} from '../dto/proposal.dto';

const ALLOWED_STATUS_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  [ProposalStatus.DRAFT]: [ProposalStatus.IN_REVIEW, ProposalStatus.CANCELLED],
  [ProposalStatus.IN_REVIEW]: [ProposalStatus.DRAFT, ProposalStatus.SENT, ProposalStatus.CANCELLED],
  [ProposalStatus.SENT]: [ProposalStatus.NEGOTIATING, ProposalStatus.APPROVED, ProposalStatus.REJECTED, ProposalStatus.CANCELLED],
  [ProposalStatus.NEGOTIATING]: [ProposalStatus.SENT, ProposalStatus.APPROVED, ProposalStatus.REJECTED, ProposalStatus.CANCELLED],
  [ProposalStatus.APPROVED]: [ProposalStatus.CONVERTED],
  [ProposalStatus.REJECTED]: [ProposalStatus.DRAFT],
  [ProposalStatus.CANCELLED]: [],
  [ProposalStatus.CONVERTED]: [],
};

@Injectable()
export class ProposalService {
  constructor(
    @InjectRepository(Proposal)
    private proposalRepository: Repository<Proposal>,
    @InjectRepository(ProposalRevision)
    private revisionRepository: Repository<ProposalRevision>,
    @InjectRepository(ProposalExpense)
    private expenseRepository: Repository<ProposalExpense>,
    @InjectRepository(ProposalAdditive)
    private additiveRepository: Repository<ProposalAdditive>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  private validateStatusTransition(currentStatus: ProposalStatus, newStatus: ProposalStatus): void {
    if (currentStatus === newStatus) return;
    
    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowedTransitions.join(', ') || 'none'}`
      );
    }
  }

  private generateCode(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PROP-${year}-${random}`;
  }

  async create(dto: CreateProposalDto): Promise<Proposal> {
    const proposal = this.proposalRepository.create({
      ...dto,
      code: this.generateCode(),
    });
    return this.proposalRepository.save(proposal);
  }

  async findAll(): Promise<Proposal[]> {
    return this.proposalRepository.find({
      relations: ['client', 'coordinator'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Proposal> {
    const proposal = await this.proposalRepository.findOne({
      where: { id },
      relations: ['client', 'coordinator', 'revisions', 'umbrellaProposal', 'project'],
    });
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID ${id} not found`);
    }
    return proposal;
  }

  async update(id: string, dto: UpdateProposalDto): Promise<Proposal> {
    const proposal = await this.findOne(id);
    
    if (dto.status) {
      this.validateStatusTransition(proposal.status, dto.status);
    }
    
    await this.proposalRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.proposalRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Proposal with ID ${id} not found`);
    }
  }

  async createRevision(dto: CreateProposalRevisionDto): Promise<ProposalRevision> {
    const proposal = await this.findOne(dto.proposalId);
    
    const lastRevision = await this.revisionRepository.findOne({
      where: { proposalId: dto.proposalId },
      order: { revisionNumber: 'DESC' },
    });

    const revisionNumber = lastRevision ? lastRevision.revisionNumber + 1 : 1;

    const revision = this.revisionRepository.create({
      ...dto,
      revisionNumber,
    });

    return this.revisionRepository.save(revision);
  }

  async getRevisions(proposalId: string): Promise<ProposalRevision[]> {
    return this.revisionRepository.find({
      where: { proposalId },
      relations: ['expenses', 'additives'],
      order: { revisionNumber: 'DESC' },
    });
  }

  async getRevision(id: string): Promise<ProposalRevision> {
    const revision = await this.revisionRepository.findOne({
      where: { id },
      relations: ['expenses', 'additives', 'proposal'],
    });
    if (!revision) {
      throw new NotFoundException(`Revision with ID ${id} not found`);
    }
    return revision;
  }

  async createExpense(dto: CreateProposalExpenseDto): Promise<ProposalExpense> {
    await this.getRevision(dto.revisionId);
    const expense = this.expenseRepository.create(dto);
    return this.expenseRepository.save(expense);
  }

  async removeExpense(id: string): Promise<void> {
    const result = await this.expenseRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }
  }

  async createAdditive(dto: CreateProposalAdditiveDto): Promise<ProposalAdditive> {
    await this.getRevision(dto.revisionId);
    const additive = this.additiveRepository.create(dto);
    return this.additiveRepository.save(additive);
  }

  async removeAdditive(id: string): Promise<void> {
    const result = await this.additiveRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Additive with ID ${id} not found`);
    }
  }

  async convertToProject(dto: ConvertToProjectDto): Promise<Project> {
    const proposal = await this.findOne(dto.proposalId);

    if (proposal.status === ProposalStatus.CONVERTED) {
      throw new BadRequestException('Proposal already converted to project');
    }

    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new BadRequestException('Only approved proposals can be converted to projects');
    }

    const projectCode = proposal.code.replace('PROP', 'PROJ');

    const project = this.projectRepository.create({
      code: projectCode,
      name: dto.projectName || proposal.title,
      description: proposal.description,
      clientId: proposal.clientId,
      coordinatorId: proposal.coordinatorId,
      startDate: dto.startDate ? new Date(dto.startDate) : proposal.expectedStartDate,
      endDate: proposal.expectedEndDate,
      budgetHours: proposal.estimatedHours,
      budgetValue: proposal.totalValue,
      status: ProjectStatus.PLANNING,
    });

    const savedProject = await this.projectRepository.save(project);

    await this.proposalRepository.update(proposal.id, {
      status: ProposalStatus.CONVERTED,
      projectId: savedProject.id,
    });

    return savedProject;
  }
}
