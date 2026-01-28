import { prisma } from "./db";
import bcrypt from "bcryptjs";
import type { User, Client, Proposal, Project, TimeEntry, Prisma } from "../generated/prisma/client";

export const ProposalStatus = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  SENT: 'sent',
  NEGOTIATING: 'negotiating',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  CONVERTED: 'converted',
} as const;

export const ProjectStatus = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const TimeEntryStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type InsertUser = Omit<Prisma.UserCreateInput, 'id'>;
export type InsertClient = Omit<Prisma.ClientCreateInput, 'id' | 'proposals' | 'projects'>;
export type InsertProposal = Omit<Prisma.ProposalCreateInput, 'id' | 'code' | 'createdAt' | 'client'> & { clientId: string };
export type InsertProject = Omit<Prisma.ProjectCreateInput, 'id' | 'code' | 'createdAt' | 'client' | 'timeEntries'> & { clientId: string };
export type InsertTimeEntry = Omit<Prisma.TimeEntryCreateInput, 'id' | 'status' | 'approvedById' | 'approvedAt' | 'rejectionReason' | 'createdAt' | 'project'> & { projectId: string };

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | null>;
  getAllUsers(): Promise<User[]>;
  
  getAllClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<Client>): Promise<Client | null>;
  deleteClient(id: string): Promise<boolean>;
  
  getAllProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | null>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, proposal: Partial<Proposal>): Promise<Proposal | null>;
  deleteProposal(id: string): Promise<boolean>;
  
  getAllProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  
  getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]>;
  getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<TimeEntry>): Promise<TimeEntry | null>;
  deleteTimeEntry(id: string): Promise<boolean>;

  seedAdminUser(): Promise<void>;
}

export class PrismaStorage implements IStorage {
  
  async seedAdminUser(): Promise<void> {
    const existingAdmin = await this.getUserByEmail('admin@empresa.com');
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          email: 'admin@empresa.com',
          password: hashedPassword,
          name: 'Administrador',
          role: 'owner',
          isActive: true,
        }
      });
      console.log('Admin user created: admin@empresa.com / admin123');
    }
  }

  async getUser(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    return prisma.user.create({
      data: {
        ...insertUser,
        password: hashedPassword,
        role: insertUser.role || 'user',
        isActive: insertUser.isActive ?? true,
      }
    });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    return prisma.user.update({ where: { id }, data: updates });
  }

  async getAllUsers(): Promise<User[]> {
    return prisma.user.findMany();
  }

  async getAllClients(): Promise<Client[]> {
    return prisma.client.findMany();
  }

  async getClient(id: string): Promise<Client | null> {
    return prisma.client.findUnique({ where: { id } });
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    return prisma.client.create({
      data: {
        ...insertClient,
        isActive: insertClient.isActive ?? true,
      }
    });
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<Client | null> {
    return prisma.client.update({ where: { id }, data: updates });
  }

  async deleteClient(id: string): Promise<boolean> {
    try {
      await prisma.client.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  private async generateProposalCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.proposal.count();
    const num = String(count + 1).padStart(4, '0');
    return `PROP-${year}-${num}`;
  }

  private async generateProjectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await prisma.project.count();
    const num = String(count + 1).padStart(4, '0');
    return `PROJ-${year}-${num}`;
  }

  async getAllProposals(): Promise<Proposal[]> {
    return prisma.proposal.findMany();
  }

  async getProposal(id: string): Promise<Proposal | null> {
    return prisma.proposal.findUnique({ where: { id } });
  }

  async createProposal(insertProposal: InsertProposal): Promise<Proposal> {
    const code = await this.generateProposalCode();
    return prisma.proposal.create({
      data: {
        code,
        title: insertProposal.title,
        description: insertProposal.description,
        clientId: insertProposal.clientId,
        coordinatorId: insertProposal.coordinatorId,
        type: insertProposal.type || 'fixed_price',
        status: ProposalStatus.DRAFT,
        totalValue: insertProposal.totalValue ?? 0,
        estimatedHours: insertProposal.estimatedHours ?? 0,
        expectedStartDate: insertProposal.expectedStartDate,
        expectedEndDate: insertProposal.expectedEndDate,
        projectId: insertProposal.projectId,
      }
    });
  }

  async updateProposal(id: string, updates: Partial<Proposal>): Promise<Proposal | null> {
    return prisma.proposal.update({ where: { id }, data: updates });
  }

  async deleteProposal(id: string): Promise<boolean> {
    try {
      await prisma.proposal.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getAllProjects(): Promise<Project[]> {
    return prisma.project.findMany();
  }

  async getProject(id: string): Promise<Project | null> {
    return prisma.project.findUnique({ where: { id } });
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const code = await this.generateProjectCode();
    return prisma.project.create({
      data: {
        code,
        name: insertProject.name,
        description: insertProject.description,
        clientId: insertProject.clientId,
        coordinatorId: insertProject.coordinatorId,
        status: ProjectStatus.PLANNING,
        startDate: insertProject.startDate,
        endDate: insertProject.endDate,
        budgetHours: insertProject.budgetHours ?? 0,
        budgetValue: insertProject.budgetValue ?? 0,
        dailyLimitHours: insertProject.dailyLimitHours ?? 8,
        requiresApproval: insertProject.requiresApproval ?? true,
      }
    });
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    return prisma.project.update({ where: { id }, data: updates });
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      await prisma.project.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]> {
    return prisma.timeEntry.findMany({ where: { projectId } });
  }

  async getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]> {
    return prisma.timeEntry.findMany({
      where: {
        collaboratorId,
        entryDate: new Date(date),
      }
    });
  }

  async createTimeEntry(insertEntry: InsertTimeEntry): Promise<TimeEntry> {
    return prisma.timeEntry.create({
      data: {
        projectId: insertEntry.projectId,
        collaboratorId: insertEntry.collaboratorId,
        entryDate: new Date(insertEntry.entryDate as any),
        hours: insertEntry.hours,
        description: insertEntry.description,
        status: TimeEntryStatus.PENDING,
      }
    });
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    return prisma.timeEntry.update({ where: { id }, data: updates });
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    try {
      await prisma.timeEntry.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new PrismaStorage();

export type { User, Client, Proposal, Project, TimeEntry };
