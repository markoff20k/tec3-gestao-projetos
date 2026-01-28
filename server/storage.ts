import { 
  type User, type InsertUser, 
  type Client, type InsertClient,
  type Proposal, type InsertProposal,
  type Project, type InsertProject,
  type TimeEntry, type InsertTimeEntry,
  ProposalStatus, ProjectStatus, TimeEntryStatus,
  users, clients, proposals, projects, timeEntries
} from "@shared/schema";
import { db } from "./db";
import { eq, and, count, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  
  getAllClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<Client>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;
  
  getAllProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, proposal: Partial<Proposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string): Promise<boolean>;
  
  getAllProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]>;
  getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<TimeEntry>): Promise<TimeEntry | undefined>;
  deleteTimeEntry(id: string): Promise<boolean>;

  seedAdminUser(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  
  async seedAdminUser(): Promise<void> {
    const existingAdmin = await this.getUserByEmail('admin@empresa.com');
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await db.insert(users).values({
        email: 'admin@empresa.com',
        password: hashedPassword,
        name: 'Administrador',
        role: 'owner',
        isActive: true,
      });
      console.log('Admin user created: admin@empresa.com / admin123');
    }
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const result = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
      role: insertUser.role || 'user',
      isActive: insertUser.isActive ?? true,
    }).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getAllClients(): Promise<Client[]> {
    return db.select().from(clients);
  }

  async getClient(id: string): Promise<Client | undefined> {
    const result = await db.select().from(clients).where(eq(clients.id, id));
    return result[0];
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const result = await db.insert(clients).values({
      ...insertClient,
      isActive: insertClient.isActive ?? true,
    }).returning();
    return result[0];
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<Client | undefined> {
    const result = await db.update(clients).set(updates).where(eq(clients.id, id)).returning();
    return result[0];
  }

  async deleteClient(id: string): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id)).returning();
    return result.length > 0;
  }

  private async generateProposalCode(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await db.select({ count: count() }).from(proposals);
    const num = String((result[0]?.count || 0) + 1).padStart(4, '0');
    return `PROP-${year}-${num}`;
  }

  private async generateProjectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await db.select({ count: count() }).from(projects);
    const num = String((result[0]?.count || 0) + 1).padStart(4, '0');
    return `PROJ-${year}-${num}`;
  }

  async getAllProposals(): Promise<Proposal[]> {
    return db.select().from(proposals);
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const result = await db.select().from(proposals).where(eq(proposals.id, id));
    return result[0];
  }

  async createProposal(insertProposal: InsertProposal): Promise<Proposal> {
    const code = await this.generateProposalCode();
    const result = await db.insert(proposals).values({
      ...insertProposal,
      code,
      status: ProposalStatus.DRAFT,
      type: insertProposal.type || 'fixed_price',
      totalValue: insertProposal.totalValue ?? '0',
      estimatedHours: insertProposal.estimatedHours ?? 0,
    }).returning();
    return result[0];
  }

  async updateProposal(id: string, updates: Partial<Proposal>): Promise<Proposal | undefined> {
    const result = await db.update(proposals).set(updates).where(eq(proposals.id, id)).returning();
    return result[0];
  }

  async deleteProposal(id: string): Promise<boolean> {
    const result = await db.delete(proposals).where(eq(proposals.id, id)).returning();
    return result.length > 0;
  }

  async getAllProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id));
    return result[0];
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const code = await this.generateProjectCode();
    const result = await db.insert(projects).values({
      ...insertProject,
      code,
      status: ProjectStatus.PLANNING,
      budgetHours: insertProject.budgetHours ?? 0,
      budgetValue: insertProject.budgetValue ?? '0',
      dailyLimitHours: insertProject.dailyLimitHours ?? 8,
      requiresApproval: insertProject.requiresApproval ?? true,
    }).returning();
    return result[0];
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const result = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<boolean> {
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  async getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]> {
    return db.select().from(timeEntries).where(eq(timeEntries.projectId, projectId));
  }

  async getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]> {
    return db.select().from(timeEntries).where(
      and(
        eq(timeEntries.collaboratorId, collaboratorId),
        eq(timeEntries.entryDate, date)
      )
    );
  }

  async createTimeEntry(insertEntry: InsertTimeEntry): Promise<TimeEntry> {
    const result = await db.insert(timeEntries).values({
      ...insertEntry,
      status: TimeEntryStatus.PENDING,
    }).returning();
    return result[0];
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | undefined> {
    const result = await db.update(timeEntries).set(updates).where(eq(timeEntries.id, id)).returning();
    return result[0];
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    const result = await db.delete(timeEntries).where(eq(timeEntries.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
