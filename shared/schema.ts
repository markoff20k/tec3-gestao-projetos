import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  COORDINATOR: 'coordinator',
  COMMERCIAL: 'commercial',
  USER: 'user',
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

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

export type ProposalStatusType = typeof ProposalStatus[keyof typeof ProposalStatus];

export const ProposalType = {
  FIXED_PRICE: 'fixed_price',
  APPROPRIATION: 'appropriation',
  UMBRELLA: 'umbrella',
  SERVICE_ORDER: 'service_order',
  ADDITIVE: 'additive',
} as const;

export type ProposalTypeType = typeof ProposalType[keyof typeof ProposalType];

export const ProjectStatus = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type ProjectStatusType = typeof ProjectStatus[keyof typeof ProjectStatus];

export const TimeEntryStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type TimeEntryStatusType = typeof TimeEntryStatus[keyof typeof TimeEntryStatus];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default('user'),
  isActive: boolean("is_active").notNull().default(true),
});

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tradeName: text("trade_name"),
  document: text("document"),
  email: text("email"),
  phone: text("phone"),
  segment: text("segment"),
  isActive: boolean("is_active").notNull().default(true),
});

export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  clientId: varchar("client_id").notNull(),
  coordinatorId: varchar("coordinator_id"),
  type: text("type").notNull().default('fixed_price'),
  status: text("status").notNull().default('draft'),
  totalValue: decimal("total_value", { precision: 12, scale: 2 }).notNull().default('0'),
  estimatedHours: integer("estimated_hours").notNull().default(0),
  expectedStartDate: date("expected_start_date"),
  expectedEndDate: date("expected_end_date"),
  projectId: varchar("project_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id").notNull(),
  coordinatorId: varchar("coordinator_id"),
  status: text("status").notNull().default('planning'),
  startDate: date("start_date"),
  endDate: date("end_date"),
  budgetHours: integer("budget_hours").notNull().default(0),
  budgetValue: decimal("budget_value", { precision: 12, scale: 2 }).notNull().default('0'),
  dailyLimitHours: integer("daily_limit_hours").notNull().default(8),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  collaboratorId: varchar("collaborator_id").notNull(),
  entryDate: date("entry_date").notNull(),
  hours: decimal("hours", { precision: 4, scale: 2 }).notNull(),
  description: text("description"),
  status: text("status").notNull().default('pending'),
  approvedById: varchar("approved_by_id"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertClientSchema = createInsertSchema(clients).omit({ id: true });
export const insertProposalSchema = createInsertSchema(proposals).omit({ id: true, code: true, createdAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, code: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true, status: true, approvedById: true, approvedAt: true, rejectionReason: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
