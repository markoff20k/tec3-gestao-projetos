import { prisma } from "./db";
import bcrypt from "bcryptjs";
import type { User, Client, Proposal, Project, TimeEntry, ProposalCategory, ProposalCategoryValue, ProposalFavorite, UserActivity, Prisma } from "../generated/prisma/client.ts";

export type UserActivityCategory = 'security' | 'profile' | 'preferences' | 'system';

export interface CreateUserActivityInput {
  category: UserActivityCategory;
  action: string;
  title: string;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const ProposalStatus = {
  EM_ELABORACAO: 'em_elaboracao',
  EM_ANALISE: 'em_analise',
  COM_SUCESSO: 'com_sucesso',
  SUCESSO_ADITIVO: 'sucesso_aditivo',
  NAO_SUCESSO: 'nao_sucesso',
  CANCELADA: 'cancelada',
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
export type InsertProposalCategory = { code?: string; name: string; isActive?: boolean };
export type InsertProposalCategoryValue = { proposalId: string; categoryId?: string; customName?: string; value: number; hours: number };

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | null>;
  updateUserPhoto(id: string, photoData: Buffer, photoMimeType: string, photoUrl: string): Promise<User | null>;
  getUserPhoto(id: string): Promise<{ data: Buffer | null; mimeType: string | null } | null>;
  getAllUsers(): Promise<User[]>;

  createUserActivity(userId: string, activity: CreateUserActivityInput): Promise<UserActivity>;
  getUserActivities(
    userId: string,
    options?: { category?: UserActivityCategory; limit?: number; cursor?: string }
  ): Promise<{ items: UserActivity[]; nextCursor: string | null }>;
  
  getAllClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<Client>): Promise<Client | null>;
  deleteClient(id: string): Promise<boolean>;
  
  getAllProposals(): Promise<(Proposal & { categoryValuesTotal?: number })[]>;
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
  getAllTimeEntries(): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<TimeEntry>): Promise<TimeEntry | null>;
  deleteTimeEntry(id: string): Promise<boolean>;

  getAllProposalCategories(options?: { includeInactive?: boolean }): Promise<ProposalCategory[]>;
  createProposalCategory(category: InsertProposalCategory): Promise<ProposalCategory>;
  updateProposalCategory(id: string, category: Partial<ProposalCategory>): Promise<ProposalCategory | null>;
  deleteProposalCategory(id: string): Promise<boolean>;

  getProposalCategoryValues(proposalId: string): Promise<ProposalCategoryValue[]>;
  saveProposalCategoryValues(proposalId: string, values: InsertProposalCategoryValue[]): Promise<ProposalCategoryValue[]>;
  deleteProposalCategoryValue(id: string): Promise<boolean>;

  getUserFavoriteProposals(userId: string): Promise<string[]>;
  addFavoriteProposal(userId: string, proposalId: string): Promise<ProposalFavorite>;
  removeFavoriteProposal(userId: string, proposalId: string): Promise<boolean>;

  seedAdminUser(): Promise<void>;
  seedProposalCategories(): Promise<void>;
  seedUserActivities(): Promise<void>;
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
          role: 'admin',
          isActive: true,
        }
      });
      console.log('Admin user created: admin@empresa.com / admin123');
    }

    // Create additional test users only outside production.
    if (process.env.NODE_ENV === 'production') return;

    const testUsers = [
      {
        email: 'comercial@empresa.com',
        password: 'comercial123',
        name: 'Comercial (Teste)',
        role: 'commercial' as const,
      },
      {
        email: 'projetos@empresa.com',
        password: 'projetos123',
        name: 'Projetos (Teste)',
        role: 'projects' as const,
      },
    ];

    for (const u of testUsers) {
      const existing = await this.getUserByEmail(u.email);
      if (existing) continue;
      const hashedPassword = await bcrypt.hash(u.password, 10);
      await prisma.user.create({
        data: {
          email: u.email,
          password: hashedPassword,
          name: u.name,
          role: u.role,
          isActive: true,
        },
      });
      console.log(`Test user created: ${u.email} / ${u.password} (${u.role})`);
    }
  }

  async seedUserActivities(): Promise<void> {
    const users = await prisma.user.findMany({ select: { id: true } });
    if (users.length === 0) return;

    const existing = await prisma.userActivity.groupBy({
      by: ['userId'],
      _count: { _all: true },
    });
    const hasActivity = new Set(existing.map(e => e.userId));

    const data = users
      .filter(u => !hasActivity.has(u.id))
      .map(u => ({
        userId: u.id,
        category: 'system',
        action: 'ACTIVITIES_ENABLED',
        title: 'Atividades da conta habilitadas',
        metadata: { seeded: true, version: 1 },
      }));

    if (data.length === 0) return;
    await prisma.userActivity.createMany({ data });
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
        role: (insertUser as any).role || 'projects',
        isActive: insertUser.isActive ?? true,
      }
    });
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    return prisma.user.update({ where: { id }, data: updates as any });
  }

  async updateUserPhoto(id: string, photoData: Buffer, photoMimeType: string, photoUrl: string): Promise<User | null> {
    return prisma.user.update({
      where: { id },
      data: { photoData, photoMimeType, photoUrl }
    });
  }

  async getUserPhoto(id: string): Promise<{ data: Buffer | null; mimeType: string | null } | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { photoData: true, photoMimeType: true }
    });
    if (!user) return null;
    return { 
      data: user.photoData ? Buffer.from(user.photoData) : null, 
      mimeType: user.photoMimeType 
    };
  }

  async getAllUsers(): Promise<User[]> {
    return prisma.user.findMany({
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
  }

  async createUserActivity(userId: string, activity: CreateUserActivityInput): Promise<UserActivity> {
    return prisma.userActivity.create({
      data: {
        userId,
        category: activity.category,
        action: activity.action,
        title: activity.title,
        metadata: activity.metadata ?? undefined,
        ip: activity.ip ?? null,
        userAgent: activity.userAgent ?? null,
      },
    });
  }

  async getUserActivities(
    userId: string,
    options?: { category?: UserActivityCategory; limit?: number; cursor?: string }
  ): Promise<{ items: UserActivity[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options?.limit ?? 12, 1), 50);
    const where: Prisma.UserActivityWhereInput = {
      userId,
      ...(options?.category ? { category: options.category } : {}),
    };

    const items = await prisma.userActivity.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;
    return { items: sliced, nextCursor };
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

  async getAllProposals(): Promise<(Proposal & { categoryValuesTotal?: number })[]> {
    const proposals = await prisma.proposal.findMany({
      include: {
        categoryValues: true,
      },
    });
    return proposals.map(p => ({
      ...p,
      categoryValuesTotal: p.categoryValues?.reduce((sum, cv) => sum + (Number(cv.value) || 0), 0) || 0,
    }));
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
        status: ProposalStatus.EM_ELABORACAO,
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

  async getAllTimeEntries(): Promise<TimeEntry[]> {
    return prisma.timeEntry.findMany();
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

  async getAllProposalCategories(options?: { includeInactive?: boolean }): Promise<ProposalCategory[]> {
    const includeInactive = options?.includeInactive ?? false;

    return prisma.proposalCategory.findMany({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: { name: 'asc' },
    });
  }

  async createProposalCategory(category: InsertProposalCategory): Promise<ProposalCategory> {
    const normalizeCode = (value: string) => {
      const base = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_+/g, '_')
        .slice(0, 24);
      return base.length > 0 ? base : 'CAT';
    };

    let code = (category.code || '').trim();
    if (!code) {
      const base = normalizeCode(category.name);
      code = base;
      for (let i = 2; i < 50; i++) {
        const existing = await prisma.proposalCategory.findUnique({ where: { code } });
        if (!existing) break;
        code = `${base}_${i}`.slice(0, 24);
      }
    }

    return prisma.proposalCategory.create({
      data: {
        code,
        name: category.name,
        isActive: category.isActive ?? true
      }
    });
  }

  async updateProposalCategory(id: string, updates: Partial<ProposalCategory>): Promise<ProposalCategory | null> {
    return prisma.proposalCategory.update({ where: { id }, data: updates });
  }

  async deleteProposalCategory(id: string): Promise<boolean> {
    try {
      await prisma.proposalCategory.update({ where: { id }, data: { isActive: false } });
      return true;
    } catch {
      return false;
    }
  }

  async getProposalCategoryValues(proposalId: string): Promise<ProposalCategoryValue[]> {
    return prisma.proposalCategoryValue.findMany({
      where: { proposalId },
      include: { category: true },
      orderBy: { createdAt: 'asc' }
    });
  }

  async saveProposalCategoryValues(proposalId: string, values: InsertProposalCategoryValue[]): Promise<ProposalCategoryValue[]> {
    await prisma.proposalCategoryValue.deleteMany({ where: { proposalId } });
    
    const created = await Promise.all(
      values.map(v => 
        prisma.proposalCategoryValue.create({
          data: {
            proposalId: v.proposalId,
            categoryId: v.categoryId || null,
            customName: v.customName || null,
            value: v.value,
            hours: v.hours
          }
        })
      )
    );
    return created;
  }

  async deleteProposalCategoryValue(id: string): Promise<boolean> {
    try {
      await prisma.proposalCategoryValue.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getUserFavoriteProposals(userId: string): Promise<string[]> {
    const favorites = await prisma.proposalFavorite.findMany({
      where: { userId },
      select: { proposalId: true }
    });
    return favorites.map(f => f.proposalId);
  }

  async addFavoriteProposal(userId: string, proposalId: string): Promise<ProposalFavorite> {
    return prisma.proposalFavorite.upsert({
      where: { userId_proposalId: { userId, proposalId } },
      create: { userId, proposalId },
      update: {}
    });
  }

  async removeFavoriteProposal(userId: string, proposalId: string): Promise<boolean> {
    try {
      await prisma.proposalFavorite.delete({
        where: { userId_proposalId: { userId, proposalId } }
      });
      return true;
    } catch {
      return false;
    }
  }

  async seedProposalCategories(): Promise<void> {
    const existingCategories = await prisma.proposalCategory.count();
    if (existingCategories > 0) return;

    const categories = [
      { code: 'ADM', name: 'Administrativo' },
      { code: 'CONS', name: 'Consultor' },
      { code: 'CONS_INT', name: 'Consultor Internacional' },
      { code: 'CONS_NAC', name: 'Consultor nacional' },
      { code: 'COORD', name: 'Coordenador' },
      { code: 'DES', name: 'Desenhista' },
      { code: 'DES_JR', name: 'Desenhista Júnior' },
      { code: 'DES_SR', name: 'Desenhista Sênior' },
      { code: 'ENG_CIV', name: 'Engenheiro Civil' },
      { code: 'ENG_CIV_JR', name: 'Engenheiro Civil Júnior' },
      { code: 'ENG_CIV_MD', name: 'Engenheiro Civil Médio' },
      { code: 'ENG_CIV_SR', name: 'Engenheiro Civil Sênior' },
      { code: 'ENG_MAST', name: 'Engenheiro Master' },
      { code: 'ENG_MAST_CAMP', name: 'Engenheiro Master CAMPO' },
      { code: 'GEO_JR', name: 'Geólogo Júnior' },
      { code: 'GEO_MD', name: 'Geólogo Médio' },
      { code: 'GEO_SR', name: 'Geólogo Sênior' },
      { code: 'GEOTEC_JR', name: 'Geotécnico Júnior' },
      { code: 'GEOTEC_MD', name: 'Geotécnico Médio' },
      { code: 'GEOTEC_SR', name: 'Geotécnico Sênior' },
      { code: 'HIDROGEO_JR', name: 'Hidrogeólogo Júnior' },
      { code: 'HIDROGEO_MD', name: 'Hidrogeólogo Médio' },
      { code: 'HIDROGEO_SR', name: 'Hidrogeólogo Sênior' },
      { code: 'HIDRO_JR', name: 'Hidrólogo Júnior' },
      { code: 'HIDRO_MD', name: 'Hidrólogo Médio' },
      { code: 'HIDRO_SR', name: 'Hidrólogo Sênior' },
      { code: 'PLAN', name: 'Planejamento' },
      { code: 'PROF_JR', name: 'Profissional Júnior' },
      { code: 'PROF_JR_CAMP', name: 'Profissional Júnior CAMPO' },
      { code: 'PROF_MD', name: 'Profissional Médio' },
      { code: 'PROF_MD_CAMP', name: 'Profissional Médio CAMPO' },
      { code: 'PROF_SR', name: 'Profissional Sênior' },
      { code: 'PROF_SR_CAMP', name: 'Profissional Sênior CAMPO' },
      { code: 'PROJ_JR', name: 'Projetista Júnior' },
      { code: 'PROJ_MD', name: 'Projetista Médio' },
      { code: 'PROJ_SR', name: 'Projetista Sênior' },
      { code: 'TEC_SEG', name: 'Técnico de Segurança' },
      { code: 'TEC_NM', name: 'Técnico Nível Médio' },
      { code: 'TEC_SR', name: 'Técnico Sênior' },
    ];

    for (const cat of categories) {
      await prisma.proposalCategory.create({ data: cat });
    }
  }
}

export const storage = new PrismaStorage();

export type { User, Client, Proposal, Project, TimeEntry, ProposalCategory, ProposalCategoryValue, ProposalFavorite };
