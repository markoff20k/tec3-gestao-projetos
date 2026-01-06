import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Project, ProjectStatus } from '../projects/entities/project.entity';
import { TimeEntry, TimeEntryStatus } from '../projects/entities/time-entry.entity';
import { Proposal, ProposalStatus } from '../commercial/entities/proposal.entity';
import { Client } from '../commercial/entities/client.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(TimeEntry)
    private timeEntryRepository: Repository<TimeEntry>,
    @InjectRepository(Proposal)
    private proposalRepository: Repository<Proposal>,
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
  ) {}

  async getDashboardMetrics(): Promise<any> {
    const totalProposals = await this.proposalRepository.count();
    const proposalsByStatus = await this.proposalRepository
      .createQueryBuilder('proposal')
      .select('proposal.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('proposal.status')
      .getRawMany();

    const totalProjects = await this.projectRepository.count();
    const projectsByStatus = await this.projectRepository
      .createQueryBuilder('project')
      .select('project.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('project.status')
      .getRawMany();

    const activeProjects = await this.projectRepository.count({
      where: { status: ProjectStatus.IN_PROGRESS },
    });

    const totalClients = await this.clientRepository.count();
    const activeClients = await this.clientRepository.count({ where: { isActive: true } });

    const currentMonth = new Date();
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const monthlyHours = await this.timeEntryRepository
      .createQueryBuilder('entry')
      .select('SUM(entry.hours)', 'total')
      .where('entry.entryDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .andWhere('entry.status = :status', { status: TimeEntryStatus.APPROVED })
      .getRawOne();

    const pendingApprovals = await this.timeEntryRepository.count({
      where: { status: TimeEntryStatus.PENDING },
    });

    const proposalValue = await this.proposalRepository
      .createQueryBuilder('proposal')
      .select('SUM(proposal.totalValue)', 'total')
      .where('proposal.status IN (:...statuses)', {
        statuses: [ProposalStatus.APPROVED, ProposalStatus.CONVERTED],
      })
      .getRawOne();

    return {
      proposals: {
        total: totalProposals,
        byStatus: proposalsByStatus,
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
        byStatus: projectsByStatus,
      },
      clients: {
        total: totalClients,
        active: activeClients,
      },
      hours: {
        monthlyTotal: parseFloat(monthlyHours?.total) || 0,
        pendingApprovals,
      },
      financial: {
        approvedProposalsValue: parseFloat(proposalValue?.total) || 0,
      },
    };
  }

  async getHoursReport(startDate: string, endDate: string): Promise<any> {
    const entries = await this.timeEntryRepository.find({
      where: {
        entryDate: Between(new Date(startDate), new Date(endDate)),
      },
      relations: ['project', 'collaborator'],
      order: { entryDate: 'DESC' },
    });

    const byProject = entries.reduce((acc, entry) => {
      const projectId = entry.projectId;
      if (!acc[projectId]) {
        acc[projectId] = {
          project: entry.project,
          totalHours: 0,
          entries: [],
        };
      }
      acc[projectId].totalHours += parseFloat(String(entry.hours));
      acc[projectId].entries.push(entry);
      return acc;
    }, {});

    const byCollaborator = entries.reduce((acc, entry) => {
      const collabId = entry.collaboratorId;
      if (!acc[collabId]) {
        acc[collabId] = {
          collaborator: entry.collaborator,
          totalHours: 0,
        };
      }
      acc[collabId].totalHours += parseFloat(String(entry.hours));
      return acc;
    }, {});

    return {
      period: { startDate, endDate },
      totalEntries: entries.length,
      totalHours: entries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0),
      byProject: Object.values(byProject),
      byCollaborator: Object.values(byCollaborator),
    };
  }

  async getProposalsReport(): Promise<any> {
    const proposals = await this.proposalRepository.find({
      relations: ['client', 'coordinator'],
      order: { createdAt: 'DESC' },
    });

    const byStatus = proposals.reduce((acc, p) => {
      if (!acc[p.status]) {
        acc[p.status] = { count: 0, totalValue: 0 };
      }
      acc[p.status].count++;
      acc[p.status].totalValue += parseFloat(String(p.totalValue));
      return acc;
    }, {});

    const byType = proposals.reduce((acc, p) => {
      if (!acc[p.type]) {
        acc[p.type] = { count: 0, totalValue: 0 };
      }
      acc[p.type].count++;
      acc[p.type].totalValue += parseFloat(String(p.totalValue));
      return acc;
    }, {});

    return {
      total: proposals.length,
      totalValue: proposals.reduce((sum, p) => sum + parseFloat(String(p.totalValue)), 0),
      byStatus,
      byType,
      proposals,
    };
  }

  async getProjectsReport(): Promise<any> {
    const projects = await this.projectRepository.find({
      relations: ['client', 'coordinator', 'timeEntries'],
      order: { createdAt: 'DESC' },
    });

    const projectsWithStats = projects.map(project => {
      const consumedHours = project.timeEntries
        ?.filter(e => e.status === TimeEntryStatus.APPROVED)
        .reduce((sum, e) => sum + parseFloat(String(e.hours)), 0) || 0;

      return {
        ...project,
        consumedHours,
        remainingHours: project.budgetHours - consumedHours,
        percentComplete: project.budgetHours > 0 
          ? Math.round((consumedHours / project.budgetHours) * 100) 
          : 0,
      };
    });

    const byStatus = projects.reduce((acc, p) => {
      if (!acc[p.status]) {
        acc[p.status] = { count: 0, totalBudget: 0 };
      }
      acc[p.status].count++;
      acc[p.status].totalBudget += parseFloat(String(p.budgetValue));
      return acc;
    }, {});

    return {
      total: projects.length,
      totalBudget: projects.reduce((sum, p) => sum + parseFloat(String(p.budgetValue)), 0),
      byStatus,
      projects: projectsWithStats,
    };
  }

  async getClientsReport(): Promise<any> {
    const clients = await this.clientRepository.find({
      relations: ['proposals'],
      order: { name: 'ASC' },
    });

    const clientsWithStats = clients.map(client => {
      const totalProposals = client.proposals?.length || 0;
      const approvedProposals = client.proposals?.filter(
        p => [ProposalStatus.APPROVED, ProposalStatus.CONVERTED].includes(p.status)
      ).length || 0;
      const totalValue = client.proposals
        ?.filter(p => [ProposalStatus.APPROVED, ProposalStatus.CONVERTED].includes(p.status))
        .reduce((sum, p) => sum + parseFloat(String(p.totalValue)), 0) || 0;

      return {
        ...client,
        totalProposals,
        approvedProposals,
        totalValue,
        conversionRate: totalProposals > 0 
          ? Math.round((approvedProposals / totalProposals) * 100) 
          : 0,
      };
    });

    return {
      total: clients.length,
      active: clients.filter(c => c.isActive).length,
      clients: clientsWithStats,
    };
  }
}
