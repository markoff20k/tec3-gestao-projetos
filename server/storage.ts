import { 
  type User, type InsertUser, 
  type Client, type InsertClient,
  type Proposal, type InsertProposal,
  type Project, type InsertProject,
  type TimeEntry, type InsertTimeEntry,
  ProposalStatus, ProjectStatus, TimeEntryStatus
} from "@shared/schema";
import { randomUUID } from "crypto";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private clients: Map<string, Client>;
  private proposals: Map<string, Proposal>;
  private projects: Map<string, Project>;
  private timeEntries: Map<string, TimeEntry>;
  private proposalCounter: number = 1;
  private projectCounter: number = 1;

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.proposals = new Map();
    this.projects = new Map();
    this.timeEntries = new Map();
    this.seedData();
  }

  private async seedData() {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminUser: User = {
      id: 'admin-user-fixed-id-001',
      email: 'admin@empresa.com',
      password: hashedPassword,
      name: 'Administrador',
      role: 'owner',
      isActive: true,
      photoUrl: null,
    };
    this.users.set(adminUser.id, adminUser);

    const client1: Client = {
      id: 'client-fixed-id-001',
      name: 'Empresa ABC Ltda',
      tradeName: 'ABC Tech',
      document: '12.345.678/0001-90',
      email: 'contato@abctech.com',
      phone: '(11) 99999-0000',
      segment: 'Tecnologia',
      isActive: true,
    };
    this.clients.set(client1.id, client1);

    const client2: Client = {
      id: 'client-fixed-id-002',
      name: 'XYZ Industrias S/A',
      tradeName: 'XYZ',
      document: '98.765.432/0001-10',
      email: 'contato@xyz.com.br',
      phone: '(11) 88888-0000',
      segment: 'Industria',
      isActive: true,
    };
    this.clients.set(client2.id, client2);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const user: User = { 
      ...insertUser, 
      id, 
      password: hashedPassword,
      role: insertUser.role || 'user',
      isActive: insertUser.isActive ?? true,
      photoUrl: insertUser.photoUrl ?? null,
    };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async getAllClients(): Promise<Client[]> {
    return Array.from(this.clients.values());
  }

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.get(id);
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const id = randomUUID();
    const client: Client = { 
      ...insertClient, 
      id,
      email: insertClient.email ?? null,
      tradeName: insertClient.tradeName ?? null,
      document: insertClient.document ?? null,
      phone: insertClient.phone ?? null,
      segment: insertClient.segment ?? null,
      isActive: insertClient.isActive ?? true,
    };
    this.clients.set(id, client);
    return client;
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<Client | undefined> {
    const client = this.clients.get(id);
    if (!client) return undefined;
    const updated = { ...client, ...updates };
    this.clients.set(id, updated);
    return updated;
  }

  async deleteClient(id: string): Promise<boolean> {
    return this.clients.delete(id);
  }

  private generateProposalCode(): string {
    const year = new Date().getFullYear();
    const num = String(this.proposalCounter++).padStart(4, '0');
    return `PROP-${year}-${num}`;
  }

  private generateProjectCode(): string {
    const year = new Date().getFullYear();
    const num = String(this.projectCounter++).padStart(4, '0');
    return `PROJ-${year}-${num}`;
  }

  async getAllProposals(): Promise<Proposal[]> {
    return Array.from(this.proposals.values());
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    return this.proposals.get(id);
  }

  async createProposal(insertProposal: InsertProposal): Promise<Proposal> {
    const id = randomUUID();
    const proposal: Proposal = {
      ...insertProposal,
      id,
      code: this.generateProposalCode(),
      status: ProposalStatus.DRAFT,
      type: insertProposal.type || 'fixed_price',
      description: insertProposal.description ?? null,
      coordinatorId: insertProposal.coordinatorId ?? null,
      totalValue: insertProposal.totalValue ?? '0',
      estimatedHours: insertProposal.estimatedHours ?? 0,
      expectedStartDate: insertProposal.expectedStartDate ?? null,
      expectedEndDate: insertProposal.expectedEndDate ?? null,
      projectId: insertProposal.projectId ?? null,
      createdAt: new Date(),
    };
    this.proposals.set(id, proposal);
    return proposal;
  }

  async updateProposal(id: string, updates: Partial<Proposal>): Promise<Proposal | undefined> {
    const proposal = this.proposals.get(id);
    if (!proposal) return undefined;
    const updated = { ...proposal, ...updates };
    this.proposals.set(id, updated);
    return updated;
  }

  async deleteProposal(id: string): Promise<boolean> {
    return this.proposals.delete(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values());
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = {
      ...insertProject,
      id,
      code: this.generateProjectCode(),
      status: ProjectStatus.PLANNING,
      description: insertProject.description ?? null,
      coordinatorId: insertProject.coordinatorId ?? null,
      startDate: insertProject.startDate ?? null,
      endDate: insertProject.endDate ?? null,
      budgetHours: insertProject.budgetHours ?? 0,
      budgetValue: insertProject.budgetValue ?? '0',
      dailyLimitHours: insertProject.dailyLimitHours ?? 8,
      requiresApproval: insertProject.requiresApproval ?? true,
      createdAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const project = this.projects.get(id);
    if (!project) return undefined;
    const updated = { ...project, ...updates };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getTimeEntriesByProject(projectId: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter(e => e.projectId === projectId);
  }

  async getTimeEntriesByCollaboratorAndDate(collaboratorId: string, date: string): Promise<TimeEntry[]> {
    return Array.from(this.timeEntries.values()).filter(
      e => e.collaboratorId === collaboratorId && e.entryDate === date
    );
  }

  async createTimeEntry(insertEntry: InsertTimeEntry): Promise<TimeEntry> {
    const id = randomUUID();
    const entry: TimeEntry = {
      ...insertEntry,
      id,
      description: insertEntry.description ?? null,
      status: TimeEntryStatus.PENDING,
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      createdAt: new Date(),
    };
    this.timeEntries.set(id, entry);
    return entry;
  }

  async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry | undefined> {
    const entry = this.timeEntries.get(id);
    if (!entry) return undefined;
    const updated = { ...entry, ...updates };
    this.timeEntries.set(id, updated);
    return updated;
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    return this.timeEntries.delete(id);
  }
}

export const storage = new MemStorage();
