export { 
  ProposalStatus, 
  ProjectStatus, 
  TimeEntryStatus,
  type InsertUser,
  type InsertClient,
  type InsertProposal,
  type InsertProject,
  type InsertTimeEntry,
  type User,
  type Client,
  type Proposal,
  type Project,
  type TimeEntry,
} from "../server/storage";

export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  COORDINATOR: 'coordinator',
  COMMERCIAL: 'commercial',
  USER: 'user',
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];
export type ProposalStatusType = string;
export type ProposalTypeType = string;
export type ProjectStatusType = string;
export type TimeEntryStatusType = string;

export const ProposalType = {
  FIXED_PRICE: 'fixed_price',
  APPROPRIATION: 'appropriation',
  UMBRELLA: 'umbrella',
  SERVICE_ORDER: 'service_order',
  ADDITIVE: 'additive',
} as const;
