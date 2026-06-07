import { prisma } from "./db";
import bcrypt from "bcryptjs";
import type { User, Client, Proposal, Project, TimeEntry, ProposalCategory, ProposalCategoryValue, ProposalFavorite, ProposalExpense, ProposalAdditive, UserActivity, Notification, ProjectTap, EmailOutbox, CostCenter } from "../generated/prisma/client.ts";
import { Prisma } from "../generated/prisma/client.ts";

export type UserActivityCategory = 'security' | 'profile' | 'preferences' | 'system';
export type NotificationType = 'proposal_due_soon' | 'project_tap_email_failed';

export interface CreateUserActivityInput {
  category: UserActivityCategory;
  action: string;
  title: string;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface UserNotificationListResult {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

export const ProposalStatus = {
  EM_ELABORACAO: 'em_elaboracao',
  EM_ANALISE: 'em_analise',
  COM_SUCESSO: 'com_sucesso',
  SUCESSO_ADITIVO: 'sucesso_aditivo',
  NAO_SUCESSO: 'nao_sucesso',
  CANCELADA: 'cancelada',
  DECLINIO: 'declinio',
} as const;

export const ProjectStatus = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const ProjectSetupStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export const ProjectTapStatus = {
  NOT_GENERATED: 'not_generated',
  GENERATED: 'generated',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export const EmailOutboxStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export const TimeEntryStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type InsertUser = Omit<Prisma.UserCreateInput, 'id'>;
export type InsertClient = Omit<Prisma.ClientCreateInput, 'id' | 'proposals' | 'projects'>;
export type InsertProposal = Omit<Prisma.ProposalCreateInput, 'id' | 'code' | 'client'> & { clientId: string };
export type InsertProject = Omit<Prisma.ProjectCreateInput, 'id' | 'code' | 'createdAt' | 'client' | 'timeEntries'> & { clientId: string };
export type InsertTimeEntry = Omit<Prisma.TimeEntryCreateInput, 'id' | 'createdAt' | 'project' | 'costCenter'> & {
  projectId: string;
  costCenterId?: string | null;
};
export type TimeEntryWithCostCenter = TimeEntry & { costCenter: CostCenter | null };
export type InsertCostCenter = { code: string; name: string; isActive?: boolean };
export type InsertProposalCategory = { code?: string; name: string; isActive?: boolean };
export type InsertProposalCategoryValue = { proposalId: string; categoryId?: string; customName?: string; value: number; hours: number };

export interface CreateProjectTapInput {
  projectId: string;
  title: string;
  payload: Prisma.InputJsonValue;
  htmlContent?: string | null;
  generatedById?: string | null;
}

export interface QueueEmailOutboxInput {
  type: string;
  referenceType?: string | null;
  referenceId?: string | null;
  payload: Prisma.InputJsonValue;
  status?: string;
  attemptCount?: number;
  lastError?: string | null;
  sentAt?: Date | null;
}

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserProfileSummary(userId: string): Promise<{ hoursThisMonth: number; approvedHoursThisMonth: number; memberSince: Date | null; lastLoginAt: Date | null }>;
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
  syncProposalDueNotifications(): Promise<void>;
  getUserNotifications(
    userId: string,
    options?: { limit?: number; cursor?: string; unreadOnly?: boolean }
  ): Promise<UserNotificationListResult>;
  markNotificationRead(userId: string, notificationId: string): Promise<Notification | null>;
  markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }>;
  createNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    sourceKey: string;
    metadata?: Prisma.InputJsonValue | null;
    isActive?: boolean;
  }): Promise<Notification>;
  
  getAllClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<Client>): Promise<Client | null>;
  deleteClient(id: string): Promise<boolean>;
  
  getAllProposals(): Promise<(Proposal & { categoryValuesTotal?: number })[]>;
  getProposal(id: string): Promise<Proposal | null>;
  getLatestProposalByCode(code: string): Promise<Proposal | null>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  createProposalRevision(proposalId: string): Promise<Proposal | null>;
  updateProposal(id: string, proposal: Partial<Proposal>): Promise<Proposal | null>;
  deleteProposal(id: string): Promise<boolean>;

  getProposalExpenses(proposalId: string): Promise<ProposalExpense[]>;
  createProposalExpense(
    proposalId: string,
    input: { description: string; value: number; reimbursable: boolean }
  ): Promise<{ item: ProposalExpense; total: number }>;
  updateProposalExpense(
    proposalId: string,
    expenseId: string,
    updates: Partial<Pick<ProposalExpense, 'description' | 'value' | 'reimbursable'>>
  ): Promise<{ item: ProposalExpense; total: number } | null>;
  deleteProposalExpense(proposalId: string, expenseId: string): Promise<{ total: number } | null>;

  getProposalAdditives(proposalId: string): Promise<ProposalAdditive[]>;
  createProposalAdditive(
    proposalId: string,
    input: { termMonths?: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }
  ): Promise<{ item: ProposalAdditive; total: number }>;
  updateProposalAdditive(
    proposalId: string,
    additiveId: string,
    updates: Partial<Pick<ProposalAdditive, 'termMonths' | 'subcontractValue' | 'mobilizationValue' | 'readjustValue'>>
  ): Promise<{ item: ProposalAdditive; total: number } | null>;
  deleteProposalAdditive(proposalId: string, additiveId: string): Promise<{ total: number } | null>;
  
  getAllProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<Project>): Promise<Project | null>;
  deleteProject(id: string): Promise<boolean>;
  getLatestProjectTap(projectId: string): Promise<ProjectTap | null>;
  createProjectTap(input: CreateProjectTapInput): Promise<ProjectTap>;
  queueEmailOutbox(input: QueueEmailOutboxInput): Promise<EmailOutbox>;
  updateEmailOutbox(id: string, updates: Partial<EmailOutbox>): Promise<EmailOutbox | null>;

  getAllCostCenters(options?: { includeInactive?: boolean }): Promise<CostCenter[]>;
  getCostCenter(id: string): Promise<CostCenter | null>;
  createCostCenter(input: InsertCostCenter): Promise<CostCenter>;
  updateCostCenter(id: string, input: Partial<CostCenter>): Promise<CostCenter | null>;
  deleteCostCenter(id: string): Promise<boolean>;
  
  getTimeEntriesByProject(projectId: string): Promise<TimeEntryWithCostCenter[]>;
  getTimeEntry(id: string): Promise<TimeEntry | null>;
  getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]>;
  getAllTimeEntries(): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntryWithCostCenter>;
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
  private normalizeProposalCode(code: string | null | undefined): string {
    const normalized = String(code || '').trim();
    if (!normalized) return '';
    return normalized.replace(/-R\d+$/i, '');
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private normalizeDateTimeInput(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    const normalized = String(value).trim();
    if (!normalized) return null;

    const candidate = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? new Date(`${normalized}T00:00:00.000Z`)
      : new Date(normalized);

    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  private normalizeReferenceCode(value: string, fallback: string): string {
    const base = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 24);
    return base.length > 0 ? base : fallback;
  }

  private getDaysUntilDue(dueDate: Date, today = new Date()): number {
    const due = this.startOfUtcDay(dueDate).getTime();
    const current = this.startOfUtcDay(today).getTime();
    return Math.round((due - current) / (24 * 60 * 60 * 1000));
  }

  private buildProposalDueNotificationContent(proposal: Proposal, daysUntilDue: number): {
    title: string;
    message: string;
    link: string;
  } {
    const displayCode = proposal.revision > 0 ? `${proposal.code}-R${proposal.revision}` : proposal.code;
    const proposalTitle = proposal.title?.trim() || 'Sem titulo';
    const dueDateText = proposal.dueDate ? this.startOfUtcDay(proposal.dueDate).toISOString().slice(0, 10) : null;

    if (daysUntilDue < 0) {
      const overdueDays = Math.abs(daysUntilDue);
      return {
        title: `Proposta ${displayCode} vencida`,
        message: `${proposalTitle} venceu ha ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}${dueDateText ? ` (${dueDateText})` : ''}.`,
        link: `/proposals?search=${encodeURIComponent(displayCode)}`,
      };
    }

    if (daysUntilDue === 0) {
      return {
        title: `Proposta ${displayCode} vence hoje`,
        message: `${proposalTitle} vence hoje${dueDateText ? ` (${dueDateText})` : ''}.`,
        link: `/proposals?search=${encodeURIComponent(displayCode)}`,
      };
    }

    return {
      title: `Proposta ${displayCode} vence em ${daysUntilDue} dias`,
      message: `${proposalTitle} vence em ${daysUntilDue} dias${dueDateText ? ` (${dueDateText})` : ''}.`,
      link: `/proposals?search=${encodeURIComponent(displayCode)}`,
    };
  }

  private getNotificationSourceKey(proposal: Proposal, userId: string): string {
    const dueDateKey = proposal.dueDate ? this.startOfUtcDay(proposal.dueDate).toISOString().slice(0, 10) : 'sem-data';
    return `proposal_due_soon:${proposal.id}:${userId}:${dueDateKey}`;
  }
  
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

  async getUserProfileSummary(userId: string): Promise<{ hoursThisMonth: number; approvedHoursThisMonth: number; memberSince: Date | null; lastLoginAt: Date | null }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [hoursAggregate, approvedHoursAggregate, loginActivities] = await Promise.all([
      prisma.timeEntry.aggregate({
        where: {
          collaboratorId: userId,
          entryDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        _sum: {
          hours: true,
        },
      }),
      prisma.timeEntry.aggregate({
        where: {
          collaboratorId: userId,
          status: TimeEntryStatus.APPROVED,
          entryDate: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        _sum: {
          hours: true,
        },
      }),
      prisma.userActivity.findMany({
        where: {
          userId,
          category: 'security',
          action: 'SECURITY_LOGIN_SUCCESS',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        select: { metadata: true, createdAt: true },
      }),
    ]);

    const rawHours = hoursAggregate._sum.hours;
    const hoursThisMonth = rawHours == null ? 0 : Number(rawHours.toString());
    const rawApprovedHours = approvedHoursAggregate._sum.hours;
    const approvedHoursThisMonth = rawApprovedHours == null ? 0 : Number(rawApprovedHours.toString());

    let memberSince: Date | null = null;
    for (const activity of loginActivities) {
      const metadata = (activity.metadata ?? null) as { directoryWhenCreated?: unknown } | null;
      const rawDate = metadata?.directoryWhenCreated;
      if (typeof rawDate !== 'string' || !rawDate.trim()) continue;
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) continue;
      memberSince = parsed;
      break;
    }

    const lastLoginAt = loginActivities[0]?.createdAt ?? null;

    return {
      hoursThisMonth: Number.isFinite(hoursThisMonth) ? hoursThisMonth : 0,
      approvedHoursThisMonth: Number.isFinite(approvedHoursThisMonth) ? approvedHoursThisMonth : 0,
      memberSince,
      lastLoginAt,
    };
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

  async syncProposalDueNotifications(): Promise<void> {
    const today = this.startOfUtcDay(new Date());
    const threshold = new Date(today);
    threshold.setUTCDate(threshold.getUTCDate() + 30);

    const activeStatuses = new Set([
      ProposalStatus.EM_ELABORACAO,
      ProposalStatus.EM_ANALISE,
      'draft',
      'in_review',
      'sent',
      'negotiating',
    ]);

    const [proposals, users, admins] = await Promise.all([
      prisma.proposal.findMany({
        where: {
          dueDate: { not: null, lte: threshold },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
      }),
      prisma.user.findMany({
        where: { role: 'admin', isActive: true },
        select: { id: true },
      }),
    ]);

    const latestProposalByBaseCode = new Map<string, Proposal>();
    for (const proposal of proposals) {
      const baseCode = this.normalizeProposalCode(proposal.code) || proposal.code;
      const existing = latestProposalByBaseCode.get(baseCode);
      if (!existing) {
        latestProposalByBaseCode.set(baseCode, proposal);
        continue;
      }

      const existingRevision = existing.revision ?? 0;
      const nextRevision = proposal.revision ?? 0;
      const shouldReplace =
        nextRevision > existingRevision ||
        (nextRevision === existingRevision && (proposal.createdAt?.getTime?.() ?? 0) > (existing.createdAt?.getTime?.() ?? 0));

      if (shouldReplace) {
        latestProposalByBaseCode.set(baseCode, proposal);
      }
    }

    const userIdByNormalizedName = new Map<string, string>();
    for (const user of users) {
      const normalizedName = user.name.trim().toLowerCase();
      if (!normalizedName || userIdByNormalizedName.has(normalizedName)) continue;
      userIdByNormalizedName.set(normalizedName, user.id);
    }

    const adminIds = admins.map((admin) => admin.id);
    const expectedSourceKeys = new Set<string>();

    for (const proposal of Array.from(latestProposalByBaseCode.values())) {
      if (!proposal.dueDate) continue;
      const normalizedStatus = String(proposal.status ?? '').trim().toLowerCase();
      if (!activeStatuses.has(normalizedStatus)) continue;

      const daysUntilDue = this.getDaysUntilDue(proposal.dueDate, today);
      if (daysUntilDue < 0 || daysUntilDue > 30) continue;

      const recipientIds = new Set<string>(adminIds);
      if (proposal.coordinatorId) {
        recipientIds.add(proposal.coordinatorId);
      } else if (proposal.coordinatorName?.trim()) {
        const matchedByName = userIdByNormalizedName.get(proposal.coordinatorName.trim().toLowerCase());
        if (matchedByName) {
          recipientIds.add(matchedByName);
        }
      }

      if (recipientIds.size === 0) continue;

      const content = this.buildProposalDueNotificationContent(proposal, daysUntilDue);
      const dueDateText = this.startOfUtcDay(proposal.dueDate).toISOString().slice(0, 10);

      for (const recipientId of Array.from(recipientIds)) {
        const sourceKey = this.getNotificationSourceKey(proposal, recipientId);
        expectedSourceKeys.add(sourceKey);

        await prisma.notification.upsert({
          where: { sourceKey },
          create: {
            userId: recipientId,
            type: 'proposal_due_soon',
            title: content.title,
            message: content.message,
            link: content.link,
            sourceKey,
            metadata: {
              proposalId: proposal.id,
              code: proposal.code,
              revision: proposal.revision,
              dueDate: dueDateText,
              daysUntilDue,
              coordinatorId: proposal.coordinatorId,
              coordinatorName: proposal.coordinatorName,
            },
            isActive: true,
          },
          update: {
            title: content.title,
            message: content.message,
            link: content.link,
            metadata: {
              proposalId: proposal.id,
              code: proposal.code,
              revision: proposal.revision,
              dueDate: dueDateText,
              daysUntilDue,
              coordinatorId: proposal.coordinatorId,
              coordinatorName: proposal.coordinatorName,
            },
            isActive: true,
          },
        });
      }
    }

    const activeDueNotifications = await prisma.notification.findMany({
      where: { type: 'proposal_due_soon', isActive: true },
      select: { id: true, sourceKey: true },
    });

    const staleNotificationIds = activeDueNotifications
      .filter((notification) => !expectedSourceKeys.has(notification.sourceKey))
      .map((notification) => notification.id);

    if (staleNotificationIds.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: staleNotificationIds } },
        data: { isActive: false },
      });
    }
  }

  async getUserNotifications(
    userId: string,
    options?: { limit?: number; cursor?: string; unreadOnly?: boolean }
  ): Promise<UserNotificationListResult> {
    const limit = Math.min(Math.max(options?.limit ?? 12, 1), 50);
    const where: Prisma.NotificationWhereInput = {
      userId,
      isActive: true,
      ...(options?.unreadOnly ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ readAt: 'asc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      }),
      prisma.notification.count({
        where: {
          userId,
          isActive: true,
          readAt: null,
        },
      }),
    ]);

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    return {
      items: sliced,
      nextCursor,
      unreadCount,
    };
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<Notification | null> {
    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, userId, isActive: true },
    });
    if (!existing) return null;
    if (existing.readAt) return existing;

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isActive: true,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { updatedCount: result.count };
  }

  async createNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string | null;
    sourceKey: string;
    metadata?: Prisma.InputJsonValue | null;
    isActive?: boolean;
  }): Promise<Notification> {
    return prisma.notification.upsert({
      where: { sourceKey: input.sourceKey },
      create: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        sourceKey: input.sourceKey,
        metadata: input.metadata ?? Prisma.JsonNull,
        isActive: input.isActive ?? true,
      },
      update: {
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        isActive: input.isActive ?? true,
        readAt: null,
      },
    });
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
    const yearTwoDigits = String(new Date().getFullYear() % 100).padStart(2, '0');
    const prefix = `P${yearTwoDigits}`;

    const sameYearCodes = await prisma.proposal.findMany({
      where: {
        code: {
          startsWith: prefix,
        },
      },
      select: { code: true },
    });

    const maxSequence = sameYearCodes.reduce((max, row) => {
      const match = String(row.code).match(new RegExp(`^P${yearTwoDigits}(\\d{3})$`));
      if (!match) return max;
      const seq = Number.parseInt(match[1], 10);
      if (!Number.isFinite(seq)) return max;
      return Math.max(max, seq);
    }, 0);

    const nextSequence = String(maxSequence + 1).padStart(3, '0');
    return `P${yearTwoDigits}${nextSequence}`;
  }

  private async generateProjectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const yearTwoDigits = String(year).slice(-2);
    const sameYearCodes = await prisma.project.findMany({
      where: { code: { startsWith: `T${yearTwoDigits}` } },
      select: { code: true },
    });

    const maxSequence = sameYearCodes.reduce((max, row) => {
      const match = String(row.code).match(new RegExp(`^T${yearTwoDigits}(\\d{3})$`));
      if (!match) return max;
      const seq = Number.parseInt(match[1], 10);
      if (!Number.isFinite(seq)) return max;
      return Math.max(max, seq);
    }, 0);

    const nextSequence = String(maxSequence + 1).padStart(3, '0');
    return `T${yearTwoDigits}${nextSequence}`;
  }

  async getAllProposals(): Promise<(Proposal & { categoryValuesTotal?: number })[]> {
    const proposals = await prisma.proposal.findMany({
      include: {
        categoryValues: true,
      },
    });

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });

    const userNameById = new Map(users.map((user) => [user.id, user.name] as const));
    const userNameByAlias = new Map<string, string>();
    const normalize = (value: string | null | undefined): string => String(value ?? '').trim().toLocaleLowerCase('pt-BR');
    const pushAlias = (alias: string | null | undefined, userName: string) => {
      const key = normalize(alias);
      if (!key || userNameByAlias.has(key)) return;
      userNameByAlias.set(key, userName);
    };

    for (const user of users) {
      pushAlias(user.name, user.name);
      pushAlias(user.email, user.name);
      const emailLocal = user.email.includes('@') ? user.email.split('@')[0] : user.email;
      pushAlias(emailLocal, user.name);
    }

    return proposals.map(p => ({
      ...p,
      coordinatorName: (() => {
        const byId = p.coordinatorId ? userNameById.get(p.coordinatorId) : null;
        if (byId) return byId;

        const raw = String(p.coordinatorName ?? '').trim();
        if (!raw) return p.coordinatorName;

        const withoutDomain = raw.includes('\\') ? raw.split('\\').pop() || raw : raw;
        const emailLocal = withoutDomain.includes('@') ? withoutDomain.split('@')[0] : withoutDomain;
        return (
          userNameByAlias.get(normalize(raw)) ||
          userNameByAlias.get(normalize(withoutDomain)) ||
          userNameByAlias.get(normalize(emailLocal)) ||
          p.coordinatorName
        );
      })(),
      categoryValuesTotal: p.categoryValues?.reduce((sum, cv) => {
        const value = Number((cv as any).value) || 0;
        const hours = Number((cv as any).hours) || 0;
        return sum + value * hours;
      }, 0) || 0,
    }));
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) return null;

    if (!proposal.coordinatorId) {
      return proposal;
    }

    const coordinator = await prisma.user.findUnique({
      where: { id: proposal.coordinatorId },
      select: { name: true },
    });

    return {
      ...proposal,
      coordinatorName: coordinator?.name ?? proposal.coordinatorName,
    };
  }

  async getLatestProposalByCode(code: string): Promise<Proposal | null> {
    const normalized = this.normalizeProposalCode(code);
    if (!normalized) return null;

    const revisionPrefix = `${normalized}-R`;
    return prisma.proposal.findFirst({
      where: {
        OR: [
          { code: normalized },
          { code: { startsWith: revisionPrefix } },
        ],
      },
      orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getProposalExpenses(proposalId: string): Promise<ProposalExpense[]> {
    return prisma.proposalExpense.findMany({
      where: { proposalId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createProposalExpense(
    proposalId: string,
    input: { description: string; value: number; reimbursable: boolean }
  ): Promise<{ item: ProposalExpense; total: number }> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.proposalExpense.create({
        data: {
          proposalId,
          description: input.description,
          value: input.value as any,
          reimbursable: input.reimbursable,
        },
      });

      const agg = await tx.proposalExpense.aggregate({
        where: { proposalId },
        _sum: { value: true },
      });
      const total = Number((agg._sum.value as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { expense: total as any },
      });

      return { item, total };
    });
  }

  async updateProposalExpense(
    proposalId: string,
    expenseId: string,
    updates: Partial<Pick<ProposalExpense, 'description' | 'value' | 'reimbursable'>>
  ): Promise<{ item: ProposalExpense; total: number } | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.proposalExpense.findFirst({
        where: { id: expenseId, proposalId },
      });
      if (!existing) return null;

      const item = await tx.proposalExpense.update({
        where: { id: expenseId },
        data: {
          ...(typeof updates.description === 'string' ? { description: updates.description } : {}),
          ...(typeof (updates as any).value === 'number' ? { value: (updates as any).value as any } : {}),
          ...(typeof updates.reimbursable === 'boolean' ? { reimbursable: updates.reimbursable } : {}),
        },
      });

      const agg = await tx.proposalExpense.aggregate({
        where: { proposalId },
        _sum: { value: true },
      });
      const total = Number((agg._sum.value as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { expense: total as any },
      });

      return { item, total };
    });
  }

  async deleteProposalExpense(proposalId: string, expenseId: string): Promise<{ total: number } | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.proposalExpense.findFirst({
        where: { id: expenseId, proposalId },
        select: { id: true },
      });
      if (!existing) return null;

      await tx.proposalExpense.delete({ where: { id: expenseId } });

      const agg = await tx.proposalExpense.aggregate({
        where: { proposalId },
        _sum: { value: true },
      });
      const total = Number((agg._sum.value as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { expense: total as any },
      });

      return { total };
    });
  }

  async getProposalAdditives(proposalId: string): Promise<ProposalAdditive[]> {
    return prisma.proposalAdditive.findMany({
      where: { proposalId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createProposalAdditive(
    proposalId: string,
    input: { termMonths?: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }
  ): Promise<{ item: ProposalAdditive; total: number }> {
    return prisma.$transaction(async (tx) => {
      const item = await tx.proposalAdditive.create({
        data: {
          proposalId,
          termMonths: typeof input.termMonths === 'number' ? input.termMonths : null,
          subcontractValue: input.subcontractValue as any,
          mobilizationValue: input.mobilizationValue as any,
          readjustValue: input.readjustValue as any,
        },
      });

      const agg = await tx.proposalAdditive.aggregate({
        where: { proposalId },
        _sum: {
          subcontractValue: true,
          mobilizationValue: true,
          readjustValue: true,
        },
      });

      const total =
        Number((agg._sum.subcontractValue as any) ?? 0) +
        Number((agg._sum.mobilizationValue as any) ?? 0) +
        Number((agg._sum.readjustValue as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { additiveValue: total as any },
      });

      return { item, total };
    });
  }

  async updateProposalAdditive(
    proposalId: string,
    additiveId: string,
    updates: Partial<Pick<ProposalAdditive, 'termMonths' | 'subcontractValue' | 'mobilizationValue' | 'readjustValue'>>
  ): Promise<{ item: ProposalAdditive; total: number } | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.proposalAdditive.findFirst({
        where: { id: additiveId, proposalId },
        select: { id: true },
      });
      if (!existing) return null;

      const item = await tx.proposalAdditive.update({
        where: { id: additiveId },
        data: {
          ...(typeof (updates as any).termMonths === 'number' || (updates as any).termMonths === null
            ? { termMonths: (updates as any).termMonths }
            : {}),
          ...(typeof (updates as any).subcontractValue === 'number' ? { subcontractValue: (updates as any).subcontractValue as any } : {}),
          ...(typeof (updates as any).mobilizationValue === 'number' ? { mobilizationValue: (updates as any).mobilizationValue as any } : {}),
          ...(typeof (updates as any).readjustValue === 'number' ? { readjustValue: (updates as any).readjustValue as any } : {}),
        },
      });

      const agg = await tx.proposalAdditive.aggregate({
        where: { proposalId },
        _sum: {
          subcontractValue: true,
          mobilizationValue: true,
          readjustValue: true,
        },
      });

      const total =
        Number((agg._sum.subcontractValue as any) ?? 0) +
        Number((agg._sum.mobilizationValue as any) ?? 0) +
        Number((agg._sum.readjustValue as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { additiveValue: total as any },
      });

      return { item, total };
    });
  }

  async deleteProposalAdditive(proposalId: string, additiveId: string): Promise<{ total: number } | null> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.proposalAdditive.findFirst({
        where: { id: additiveId, proposalId },
        select: { id: true },
      });
      if (!existing) return null;

      await tx.proposalAdditive.delete({ where: { id: additiveId } });

      const agg = await tx.proposalAdditive.aggregate({
        where: { proposalId },
        _sum: {
          subcontractValue: true,
          mobilizationValue: true,
          readjustValue: true,
        },
      });

      const total =
        Number((agg._sum.subcontractValue as any) ?? 0) +
        Number((agg._sum.mobilizationValue as any) ?? 0) +
        Number((agg._sum.readjustValue as any) ?? 0);

      await tx.proposal.update({
        where: { id: proposalId },
        data: { additiveValue: total as any },
      });

      return { total };
    });
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
        coordinatorName: insertProposal.coordinatorName,
        type: insertProposal.type || 'fixed_price',
        status: insertProposal.status || ProposalStatus.EM_ELABORACAO,
        totalValue: insertProposal.totalValue ?? 0,
        estimatedHours: insertProposal.estimatedHours ?? 0,
        expectedStartDate: insertProposal.expectedStartDate,
        expectedEndDate: insertProposal.expectedEndDate,
        sentDate: insertProposal.sentDate,
        dueDate: insertProposal.dueDate,
        projectId: insertProposal.projectId,
        umbrellaRef: insertProposal.umbrellaRef,
        expectation: insertProposal.expectation,
        mainType: insertProposal.mainType,
        termMonths: insertProposal.termMonths,
        riskAssessment: insertProposal.riskAssessment,
        hourJustification: insertProposal.hourJustification as any,
        subcontracted: insertProposal.subcontracted as any,
        discount: insertProposal.discount,
        proposalOrigin: insertProposal.proposalOrigin,
        ...(insertProposal.createdAt ? { createdAt: insertProposal.createdAt } : {}),
      }
    });
  }

  async createProposalRevision(proposalId: string): Promise<Proposal | null> {
    return prisma.$transaction(async (tx) => {
      const base = await tx.proposal.findUnique({ where: { id: proposalId } });
      if (!base) return null;

      const baseCode = this.normalizeProposalCode(base.code);
      if (!baseCode) return null;

      const revisionPrefix = `${baseCode}-R`;

      const latest = await tx.proposal.findFirst({
        where: {
          OR: [
            { code: baseCode },
            { code: { startsWith: revisionPrefix } },
          ],
        },
        orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!latest) return null;

      const nextRevision = (latest.revision ?? 0) + 1;
      const latestStatusNormalized = String(latest.status ?? '').trim().toLowerCase();
      const successStatuses = new Set([
        ProposalStatus.COM_SUCESSO,
        ProposalStatus.SUCESSO_ADITIVO,
        'approved',
        'converted',
        'aprovada',
        'convertida',
        'sucesso',
      ]);
      const revisionStatus = successStatuses.has(latestStatusNormalized)
        ? ProposalStatus.EM_ELABORACAO
        : latest.status;

      const created = await tx.proposal.create({
        data: {
          code: baseCode,
          revision: nextRevision,

          title: latest.title,
          description: latest.description,
          clientId: latest.clientId,
          coordinatorId: latest.coordinatorId,
          coordinatorName: latest.coordinatorName,
          type: latest.type,
          status: revisionStatus,
          totalValue: (latest as any).totalValue,
          estimatedHours: latest.estimatedHours,
          expectedStartDate: latest.expectedStartDate,
          expectedEndDate: latest.expectedEndDate,
          projectId: latest.projectId,
          sentDate: latest.sentDate,

          activityType: latest.activityType,
          umbrellaRef: latest.umbrellaRef,
          utility: latest.utility,
          sentByName: latest.sentByName,
          specialist: latest.specialist,
          mainType: latest.mainType,
          quantity: latest.quantity,
          hourJustification: (latest as any).hourJustification,
          rehabilitation: (latest as any).rehabilitation,
          subcontracted: (latest as any).subcontracted,
          paymentBook: (latest as any).paymentBook,
          expense: (latest as any).expense,
          additiveValue: (latest as any).additiveValue,
          resource: (latest as any).resource,
          workOrders: latest.workOrders,

          contractCode: latest.contractCode,
          deliveryDate: latest.deliveryDate,
          dueDate: latest.dueDate,
          duration: latest.duration,
          expectation: latest.expectation,
          termMonths: latest.termMonths,
          hours: latest.hours,
          riskAssessment: latest.riskAssessment,
          maintenanceNum: latest.maintenanceNum,
          acquisitionMargin: latest.acquisitionMargin,
          anfibex: latest.anfibex,
          discount: latest.discount,
          proposalOrigin: latest.proposalOrigin,
        },
      });

      const [categoryValues, expenses, additives] = await Promise.all([
        tx.proposalCategoryValue.findMany({ where: { proposalId: latest.id } }),
        tx.proposalExpense.findMany({ where: { proposalId: latest.id } }),
        tx.proposalAdditive.findMany({ where: { proposalId: latest.id } }),
      ]);

      if (categoryValues.length > 0) {
        await tx.proposalCategoryValue.createMany({
          data: categoryValues.map((cv) => ({
            proposalId: created.id,
            categoryId: cv.categoryId ?? null,
            customName: cv.customName ?? null,
            value: (cv as any).value,
            hours: cv.hours,
          })),
        });
      }

      if (expenses.length > 0) {
        await tx.proposalExpense.createMany({
          data: expenses.map((ex) => ({
            proposalId: created.id,
            description: ex.description,
            value: (ex as any).value,
            reimbursable: ex.reimbursable,
          })),
        });
      }

      if (additives.length > 0) {
        await tx.proposalAdditive.createMany({
          data: additives.map((ad) => ({
            proposalId: created.id,
            termMonths: ad.termMonths ?? null,
            subcontractValue: (ad as any).subcontractValue,
            mobilizationValue: (ad as any).mobilizationValue,
            readjustValue: (ad as any).readjustValue,
          })),
        });
      }

      return created;
    });
  }

  async updateProposal(id: string, updates: Partial<Proposal>): Promise<Proposal | null> {
    return prisma.proposal.update({ where: { id }, data: updates as Prisma.ProposalUpdateInput });
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
        startDate: this.normalizeDateTimeInput(insertProject.startDate),
        endDate: this.normalizeDateTimeInput(insertProject.endDate),
        budgetHours: insertProject.budgetHours ?? 0,
        budgetValue: insertProject.budgetValue ?? 0,
        dailyLimitHours: insertProject.dailyLimitHours ?? 8,
        requiresApproval: insertProject.requiresApproval ?? true,
        setupStatus: ProjectSetupStatus.PENDING,
        tapStatus: ProjectTapStatus.NOT_GENERATED,
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

  async getLatestProjectTap(projectId: string): Promise<ProjectTap | null> {
    return prisma.projectTap.findFirst({
      where: { projectId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createProjectTap(input: CreateProjectTapInput): Promise<ProjectTap> {
    const latestTap = await prisma.projectTap.findFirst({
      where: { projectId: input.projectId },
      orderBy: [{ version: 'desc' }],
      select: { version: true },
    });

    return prisma.projectTap.create({
      data: {
        projectId: input.projectId,
        version: (latestTap?.version ?? 0) + 1,
        title: input.title,
        payload: input.payload,
        htmlContent: input.htmlContent ?? null,
        generatedById: input.generatedById ?? null,
      },
    });
  }

  async queueEmailOutbox(input: QueueEmailOutboxInput): Promise<EmailOutbox> {
    return prisma.emailOutbox.create({
      data: {
        type: input.type,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        payload: input.payload,
        status: input.status ?? EmailOutboxStatus.PENDING,
        attemptCount: input.attemptCount ?? 0,
        lastError: input.lastError ?? null,
        sentAt: input.sentAt ?? null,
      },
    });
  }

  async updateEmailOutbox(id: string, updates: Partial<EmailOutbox>): Promise<EmailOutbox | null> {
    const { id: _ignoredId, payload, ...rest } = updates as Partial<EmailOutbox> & {
      payload?: Prisma.JsonValue | null;
    };

    return prisma.emailOutbox.update({
      where: { id },
      data: {
        ...rest,
        ...(payload !== undefined
          ? { payload: payload === null ? Prisma.JsonNull : (payload as Prisma.InputJsonValue) }
          : {}),
      },
    });
  }

  async getAllCostCenters(options?: { includeInactive?: boolean }): Promise<CostCenter[]> {
    const includeInactive = options?.includeInactive ?? false;

    return prisma.costCenter.findMany({
      ...(includeInactive ? {} : { where: { isActive: true } }),
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
  }

  async getCostCenter(id: string): Promise<CostCenter | null> {
    return prisma.costCenter.findUnique({ where: { id } });
  }

  async createCostCenter(input: InsertCostCenter): Promise<CostCenter> {
    const code = this.normalizeReferenceCode(input.code, 'CC');

    return prisma.costCenter.create({
      data: {
        code,
        name: input.name.trim(),
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateCostCenter(id: string, input: Partial<CostCenter>): Promise<CostCenter | null> {
    const data: Prisma.CostCenterUpdateInput = {};

    if (input.code !== undefined) {
      data.code = this.normalizeReferenceCode(String(input.code), 'CC');
    }

    if (input.name !== undefined) {
      data.name = String(input.name).trim();
    }

    if (input.isActive !== undefined) {
      data.isActive = Boolean(input.isActive);
    }

    return prisma.costCenter.update({ where: { id }, data });
  }

  async deleteCostCenter(id: string): Promise<boolean> {
    try {
      await prisma.costCenter.update({ where: { id }, data: { isActive: false } });
      return true;
    } catch {
      return false;
    }
  }

  async getTimeEntriesByProject(projectId: string): Promise<TimeEntryWithCostCenter[]> {
    return prisma.timeEntry.findMany({
      where: { projectId },
      include: { costCenter: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getTimeEntry(id: string): Promise<TimeEntry | null> {
    return prisma.timeEntry.findUnique({ where: { id } });
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

  async createTimeEntry(insertEntry: InsertTimeEntry): Promise<TimeEntryWithCostCenter> {
    return prisma.timeEntry.create({
      data: {
        projectId: insertEntry.projectId,
        collaboratorId: insertEntry.collaboratorId,
        costCenterId: insertEntry.costCenterId ?? null,
        entryDate: new Date(insertEntry.entryDate as any),
        hours: insertEntry.hours,
        description: insertEntry.description,
        ...(insertEntry.attachments !== undefined
          ? { attachments: insertEntry.attachments as Prisma.InputJsonValue }
          : {}),
        status: insertEntry.status ?? TimeEntryStatus.PENDING,
        approvedById: insertEntry.approvedById ?? null,
        approvedAt: insertEntry.approvedAt ?? null,
        rejectionReason: insertEntry.rejectionReason ?? null,
      },
      include: { costCenter: true },
    });
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | null> {
    const { id: _ignoredId, attachments, ...rest } = updates as Partial<TimeEntry> & { attachments?: Prisma.JsonValue | null };

    return prisma.timeEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(attachments !== undefined
          ? { attachments: attachments === null ? Prisma.JsonNull : (attachments as Prisma.InputJsonValue) }
          : {}),
      },
    });
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
    let code = (category.code || '').trim();
    if (!code) {
      const base = this.normalizeReferenceCode(category.name, 'CAT');
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

export type { User, Client, Proposal, Project, TimeEntry, ProposalCategory, ProposalCategoryValue, ProposalFavorite, CostCenter };
