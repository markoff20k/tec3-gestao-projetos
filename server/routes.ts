import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { type Server } from "http";
import { prisma } from "./db";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ProposalStatus, TimeEntryStatus } from "@shared/schema";
import { authenticateViaLdap, listAdDirectoryUsers } from "./ldap";

const PROJECT_SETUP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

const PROJECT_TAP_STATUS = {
  NOT_GENERATED: 'not_generated',
  GENERATED: 'generated',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

const PROPOSAL_TAP_STATUS = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  GENERATED: 'generated',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

const EMAIL_OUTBOX_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

const PROJECT_READY_TAP_STATUSES = new Set<string>([
  PROJECT_TAP_STATUS.GENERATED,
  PROJECT_TAP_STATUS.SENT,
  PROJECT_TAP_STATUS.FAILED,
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG, GIF ou WebP.'));
    }
  }
});

const JWT_SECRET = process.env.SESSION_SECRET || 'dev-secret-key';
const DEFAULT_JWT_EXPIRES_MINUTES = 24 * 60;
const parsedJwtExpiresMinutes = Number.parseInt(String(process.env.JWT_EXPIRES_MINUTES ?? '').trim(), 10);
const JWT_EXPIRES_MINUTES = Number.isFinite(parsedJwtExpiresMinutes) && parsedJwtExpiresMinutes > 0
  ? parsedJwtExpiresMinutes
  : DEFAULT_JWT_EXPIRES_MINUTES;
const JWT_EXPIRES_SECONDS = JWT_EXPIRES_MINUTES * 60;

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  // New (legacy) statuses - aligned with the screenshot
  em_elaboracao: ['em_analise', 'com_sucesso', 'cancelada'],
  em_analise: ['em_elaboracao', 'com_sucesso', 'sucesso_aditivo', 'nao_sucesso', 'cancelada', 'declinio'],
  com_sucesso: [],
  sucesso_aditivo: [],
  nao_sucesso: ['em_elaboracao'],
  cancelada: [],
  declinio: ['em_elaboracao'],

  // Backward-compatibility for old statuses while deployments/migrations roll out
  draft: ['em_analise', 'com_sucesso', 'cancelada'],
  in_review: ['em_elaboracao', 'em_analise', 'cancelada'],
  sent: ['em_analise', 'com_sucesso', 'nao_sucesso', 'cancelada'],
  negotiating: ['em_analise', 'com_sucesso', 'nao_sucesso', 'cancelada'],
  approved: ['com_sucesso', 'sucesso_aditivo'],
  rejected: ['em_elaboracao'],
  cancelled: ['cancelada'],
  converted: ['com_sucesso'],
};

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

interface TokenPayload {
  sub: string;
  email?: string;
  role?: unknown;
}

const ROLES = ['admin', 'commercial', 'projects'] as const;
type Role = typeof ROLES[number];
const TEMP_FORCE_ALL_USERS_AS_ADMIN = true;

function resolveEffectiveRole(rawRole: unknown): Role | null {
  if (TEMP_FORCE_ALL_USERS_AS_ADMIN) return 'admin';

  const normalizedRole = String(rawRole ?? '').trim().toLowerCase();
  const mappedRole = normalizedRole === 'owner' ? 'admin' : normalizedRole;
  return isRole(mappedRole) ? mappedRole : null;
}

const APPROVED_PROPOSAL_STATUSES = new Set([
  'com_sucesso',
  'sucesso_aditivo',
  'approved',
  'converted',
  'aprovada',
  'convertida',
  'sucesso',
]);

const PROPOSAL_FUNNEL_STATUS = {
  elaboracao: new Set(['em_elaboracao', 'draft']),
  analise: new Set(['em_analise', 'in_review', 'sent', 'negotiating']),
  ganho: APPROVED_PROPOSAL_STATUSES,
  perdido: new Set(['nao_sucesso', 'rejected', 'cancelada', 'cancelled', 'declinio']),
};

function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProposalApprovedAmount(proposal: { totalValue?: unknown; categoryValuesTotal?: unknown }): number {
  const totalValue = parseNumericValue((proposal as any).totalValue);
  const categoryValuesTotal = parseNumericValue((proposal as any).categoryValuesTotal);
  return totalValue > 0 ? totalValue : categoryValuesTotal;
}

type DashboardPeriodDays = 7 | 30 | 90 | 180 | 365;

type TrendBucket = {
  label: string;
  start: Date;
  end: Date;
};

type DateRange = {
  start: Date;
  end: Date;
};

function parseDashboardPeriod(value: unknown): DashboardPeriodDays {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === '7d' || normalized === '7') return 7;
  if (normalized === '30d' || normalized === '30') return 30;
  if (normalized === '180d' || normalized === '180') return 180;
  if (normalized === '365d' || normalized === '365') return 365;
  return 90;
}

function toValidDate(value: unknown): Date | null {
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthYearLabel(date: Date): string {
  const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const year = date.getFullYear();
  return `${month}/${year}`;
}

function buildTrendBuckets(periodDays: DashboardPeriodDays, now = new Date()): TrendBucket[] {
  if (periodDays === 7) {
    return Array.from({ length: 7 }).map((_, index) => {
      const cursor = new Date(now);
      cursor.setDate(now.getDate() - (6 - index));
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 0, 0, 0, 0);
      const end = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 23, 59, 59, 999);

      return {
        label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        start,
        end,
      };
    });
  }

  if (periodDays === 30) {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return Array.from({ length: 4 }).map((_, index) => {
      const end = new Date(now.getTime() - weekMs * (3 - index));
      const start = new Date(end.getTime() - weekMs + 1);
      return {
        label: formatMonthYearLabel(end),
        start,
        end,
      };
    });
  }

  const monthCount = periodDays === 90 ? 3 : periodDays === 180 ? 6 : 12;
  return Array.from({ length: monthCount }).map((_, index) => {
    const cursor = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1);
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      label: formatMonthYearLabel(start),
      start,
      end,
    };
  });
}

function buildTrendPoints(values: number[], labels: string[]) {
  const safeValues = values.map((value) => Number(value || 0));

  const projectedSeries = (() => {
    if (safeValues.length < 2) return safeValues;

    const xs = safeValues.map((_, index) => index);
    const n = safeValues.length;
    const sumX = xs.reduce((sum, x) => sum + x, 0);
    const sumY = safeValues.reduce((sum, y) => sum + y, 0);
    const sumXY = safeValues.reduce((sum, y, index) => sum + y * index, 0);
    const sumXX = xs.reduce((sum, x) => sum + x * x, 0);
    const denominator = n * sumXX - sumX * sumX;

    if (denominator === 0) return safeValues;

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    return xs.map((x) => Math.max(0, intercept + slope * x));
  })();

  return values.map((value, index) => ({
    label: labels[index],
    atual: Number(value.toFixed(2)),
    meta: Number((projectedSeries[index] ?? value).toFixed(2)),
  }));
}

function buildPeriodRanges(periodDays: DashboardPeriodDays, now = new Date()): { current: DateRange; previous: DateRange } {
  const currentEnd = new Date(now);
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - periodDays + 1);

  const previousEnd = new Date(currentStart);
  previousEnd.setDate(previousEnd.getDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - periodDays + 1);

  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: previousStart, end: previousEnd },
  };
}

function isWithinRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

function calculateDeltaPercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function requireRoles(allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (!isRole(role)) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }
    if (role === 'admin') return next();
    if (!allowed.includes(role)) {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }
    next();
  };
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(',')[0]?.trim() || null;
  }
  return req.socket?.remoteAddress || null;
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

async function safeCreateUserActivity(
  req: Request,
  userId: string,
  activity: {
    category: 'security' | 'profile' | 'preferences' | 'system';
    action: string;
    title: string;
    metadata?: any;
  }
): Promise<void> {
  try {
    await storage.createUserActivity(userId, {
      category: activity.category,
      action: activity.action,
      title: activity.title,
      metadata: typeof activity.metadata === 'undefined' ? undefined : activity.metadata,
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });
  } catch (error) {
    console.warn('Failed to write user activity', {
      userId,
      action: activity.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function notifyAdminsAboutTapEmailFailure(params: {
  projectId: string;
  projectCode: string;
  projectName: string;
  tapId: string;
  errorMessage: string;
}) {
  const users = await storage.getAllUsers();
  const admins = users.filter((user) => user.isActive && String(user.role || '').trim().toLowerCase() === 'admin');

  await Promise.all(
    admins.map((admin) =>
      storage.createNotification({
        userId: admin.id,
        type: 'project_tap_email_failed',
        title: `Falha no envio do TAP — ${params.projectCode}`,
        message: `O e-mail do TAP do projeto ${params.projectCode} não foi enviado pelo Postmark. Clique para reenviar.`,
        link: `/projects/${params.projectId}`,
        sourceKey: `project_tap_email_failed:${params.projectId}:${admin.id}`,
        metadata: {
          projectId: params.projectId,
          projectCode: params.projectCode,
          projectName: params.projectName,
          tapId: params.tapId,
          errorMessage: params.errorMessage,
          action: 'resend_project_tap_email',
        },
        isActive: true,
      })
    )
  );
}

async function clearTapEmailFailureNotifications(projectId: string) {
  const notifications = await prisma.notification.findMany({
    where: {
      type: 'project_tap_email_failed',
      isActive: true,
      sourceKey: { startsWith: `project_tap_email_failed:${projectId}:` },
    },
    select: { id: true },
  });

  if (notifications.length === 0) return;

  await prisma.notification.updateMany({
    where: { id: { in: notifications.map((item) => item.id) } },
    data: { isActive: false },
  });
}

function parseRecipients(raw: string | undefined): string[] {
  return String(raw || '')
    .split(/[;,\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

type ProposalTapAttachment = {
  id: string;
  title: string;
  description: string | null;
  name: string;
  objectPath: string;
  contentType: string | null;
  size: number | null;
};

type ProposalTapDraft = {
  projectName: string;
  executiveSummary: string;
  scopeHtml: string;
  objectives: string;
  deliverables: string;
  premises: string;
  exclusions: string;
  stakeholders: string;
  notes: string;
  startDate?: string | null;
  endDate?: string | null;
  budgetHours: number;
  budgetValue: number;
  attachments: ProposalTapAttachment[];
};

function normalizeProposalTapAttachmentList(value: unknown): ProposalTapAttachment[] {
  if (!Array.isArray(value)) return [];

  const normalizedItems = value
    .map((item) => {
      const raw = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const title = String(raw.title ?? '').trim();
      const name = String(raw.name ?? '').trim();
      const objectPath = String(raw.objectPath ?? '').trim();

      if (!title || !name || !objectPath) return null;

      return {
        id: String(raw.id ?? crypto.randomUUID()).trim() || crypto.randomUUID(),
        title,
        description: String(raw.description ?? '').trim() || null,
        name,
        objectPath,
        contentType: String(raw.contentType ?? '').trim() || null,
        size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : null,
      };
    });

  return normalizedItems.filter((item): item is ProposalTapAttachment => item !== null);
}

function stripHtmlTags(value: string): string {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeProposalTapHtml(value: unknown): string {
  const source = String(value || '').trim();
  if (!source) return '';

  const normalized = source
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<div\b[^>]*>/gi, '<p>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, '')
    .replace(/\shref=("javascript:[^"]*"|'javascript:[^']*')/gi, '')
    .replace(/<(?!\/?(p|br|ul|ol|li|strong|b|em|i|u|h1|h2|h3)\b)[^>]+>/gi, '');

  return normalized.trim();
}

function formatProjectTapHtmlContent(value: string | null | undefined) {
  const sanitized = sanitizeProposalTapHtml(value);
  if (sanitized) return sanitized;
  return formatProjectTapEmailRichText(stripHtmlTags(String(value || '')) || '-');
}

function normalizeProposalTapDraft(proposal: any, input?: unknown): ProposalTapDraft {
  const existing = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const description = String(proposal?.description || '').trim();
  const defaultScope = description ? `<p>${escapeProjectTapEmailHtml(description)}</p>` : '';

  return {
    projectName: String(existing.projectName ?? proposal?.title ?? '').trim(),
    executiveSummary: String(existing.executiveSummary ?? description).trim(),
    scopeHtml: sanitizeProposalTapHtml(existing.scopeHtml ?? defaultScope),
    objectives: String(existing.objectives ?? '').trim(),
    deliverables: String(existing.deliverables ?? '').trim(),
    premises: String(existing.premises ?? '').trim(),
    exclusions: String(existing.exclusions ?? '').trim(),
    stakeholders: String(existing.stakeholders ?? '').trim(),
    notes: String(existing.notes ?? '').trim(),
    startDate: String(existing.startDate ?? proposal?.expectedStartDate ?? '').trim() || null,
    endDate: String(existing.endDate ?? proposal?.expectedEndDate ?? '').trim() || null,
    budgetHours: Number.isFinite(Number(existing.budgetHours)) ? Number(existing.budgetHours) : Number(proposal?.estimatedHours || 0),
    budgetValue: Number.isFinite(Number(existing.budgetValue)) ? Number(existing.budgetValue) : Number(proposal?.totalValue || 0),
    attachments: normalizeProposalTapAttachmentList(existing.attachments),
  };
}

function validateProposalTapDraft(draft: ProposalTapDraft) {
  if (!draft.projectName.trim()) {
    throw new Error('Informe o nome do projeto no TAP');
  }

  if (!draft.executiveSummary.trim()) {
    throw new Error('Informe o sumário executivo antes de gerar o TAP');
  }

  if (!stripHtmlTags(draft.scopeHtml)) {
    throw new Error('Informe o escopo antes de gerar o TAP');
  }
}

async function syncProposalTapStatusByProject(projectId: string, updates: Record<string, unknown>) {
  await prisma.proposal.updateMany({
    where: { projectId },
    data: updates,
  });
}

function buildProjectTapPayload(params: {
  proposal: any;
  project: any;
  client: any;
  tapDraft?: ProposalTapDraft | null;
}) {
  const { proposal, project, client } = params;
  const tapDraft = normalizeProposalTapDraft(proposal, params.tapDraft ?? proposal?.tapPayload ?? null);

  return {
    generatedAt: new Date().toISOString(),
    proposal: {
      id: proposal.id,
      code: proposal.code,
      revision: proposal.revision ?? 0,
      title: proposal.title,
      description: proposal.description ?? null,
      status: proposal.status,
      totalValue: Number(proposal.totalValue || 0),
      estimatedHours: Number(proposal.estimatedHours || 0),
      expectedStartDate: proposal.expectedStartDate ?? null,
      expectedEndDate: proposal.expectedEndDate ?? null,
      type: proposal.type ?? null,
      coordinatorName: proposal.coordinatorName ?? null,
      proposalOrigin: proposal.proposalOrigin ?? null,
      umbrellaRef: proposal.umbrellaRef ?? null,
      expectation: proposal.expectation ?? null,
      mainType: proposal.mainType ?? null,
      termMonths: proposal.termMonths ?? null,
      riskAssessment: proposal.riskAssessment ?? null,
      contractCode: proposal.contractCode ?? null,
      workOrders: proposal.workOrders ?? null,
    },
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description ?? null,
      status: project.status,
      budgetHours: Number(project.budgetHours || 0),
      budgetValue: Number(project.budgetValue || 0),
      dailyLimitHours: Number(project.dailyLimitHours || 0),
      requiresApproval: Boolean(project.requiresApproval),
    },
    tap: tapDraft,
    client: client
      ? {
          id: client.id,
          razaoSocial: client.razaoSocial,
          nomeFantasia: client.nomeFantasia ?? null,
          emailComercial: client.emailComercial ?? null,
          emailTecnico: client.emailTecnico ?? null,
        }
      : null,
  };
}

function formatProjectTapEmailCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatProjectTapEmailDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}

function buildProjectTapTemplateModel(params: {
  payload: ReturnType<typeof buildProjectTapPayload>;
  projectUrl: string | null;
}) {
  const { payload, projectUrl } = params;
  const tapStartDate = payload.tap?.startDate || payload.proposal.expectedStartDate;
  const tapEndDate = payload.tap?.endDate || payload.proposal.expectedEndDate;
  const tapAttachments = Array.isArray(payload.tap?.attachments) ? payload.tap.attachments : [];

  return {
    project_code: payload.project.code,
    project_name: payload.project.name,
    project_status: payload.project.status,
    project_status_label: formatProjectTapStatusLabel(payload.project.status),
    project_budget_hours: `${payload.project.budgetHours} h`,
    project_budget_value: formatProjectTapEmailCurrency(payload.project.budgetValue),
    proposal_code: payload.proposal.code,
    proposal_title: payload.proposal.title,
    proposal_description: payload.proposal.description || '-',
    proposal_estimated_hours: `${payload.proposal.estimatedHours} h`,
    proposal_total_value: formatProjectTapEmailCurrency(payload.proposal.totalValue),
    proposal_expected_start_date: formatProjectTapEmailDate(payload.proposal.expectedStartDate),
    proposal_expected_end_date: formatProjectTapEmailDate(payload.proposal.expectedEndDate),
    client_name: payload.client?.razaoSocial || payload.client?.nomeFantasia || '-',
    tap_executive_summary: payload.tap?.executiveSummary || '-',
    tap_generated_at: formatProjectTapEmailDate(payload.generatedAt),
    tap_start_date: formatProjectTapEmailDate(tapStartDate),
    tap_end_date: formatProjectTapEmailDate(tapEndDate),
    tap_budget_hours: `${payload.tap?.budgetHours ?? payload.project.budgetHours} h`,
    tap_budget_value: formatProjectTapEmailCurrency(payload.tap?.budgetValue ?? payload.project.budgetValue),
    tap_scope_html: formatProjectTapHtmlContent(payload.tap?.scopeHtml || ''),
    tap_scope_plain_text: stripHtmlTags(payload.tap?.scopeHtml || '') || '-',
    tap_objectives: payload.tap?.objectives || '-',
    tap_deliverables: payload.tap?.deliverables || '-',
    tap_premises: payload.tap?.premises || '-',
    tap_exclusions: payload.tap?.exclusions || '-',
    tap_stakeholders: payload.tap?.stakeholders || '-',
    tap_notes: payload.tap?.notes || '-',
    tap_attachments: tapAttachments.length > 0
      ? tapAttachments.map((attachment: ProposalTapAttachment) => `${attachment.title}${attachment.description ? ` — ${attachment.description}` : ''}`).join('\n')
      : '-',
    tap_attachments_list: tapAttachments.map((attachment: ProposalTapAttachment) => ({
      title: attachment.title,
      description: attachment.description || '',
      name: attachment.name,
    })),
    project_url: projectUrl,
  };
}

function escapeProjectTapEmailHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatProjectTapEmailRichText(value: string | null | undefined) {
  return escapeProjectTapEmailHtml(String(value || '-')).replace(/\r?\n/g, '<br />');
}

function formatProjectTapStatusLabel(value: string) {
  const labels: Record<string, string> = {
    planning: 'Planejamento',
    active: 'Em andamento',
    in_progress: 'Em andamento',
    on_hold: 'Pausado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };

  return labels[value] || value;
}

const PROJECT_TAP_PUBLIC_LOGO_URL = 'https://www.tec3engenharia.com.br/wp-content/uploads/2025/09/tec3-LogoTagline-Cor.svg';

const PROJECT_TAP_EMBEDDED_LOGO_URL = (() => {
  try {
    const logoPath = path.resolve(process.cwd(), 'attached_assets', 'tec3-LogoTagline-Cor-320.png');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${logoBuffer.toString('base64')}`;
  } catch {
    return PROJECT_TAP_PUBLIC_LOGO_URL;
  }
})();

function buildProjectTapEmailLinks(projectId: string) {
  const baseUrl = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  return {
    projectUrl: baseUrl ? `${baseUrl}/projects/${projectId}` : null,
    logoUrl: PROJECT_TAP_EMBEDDED_LOGO_URL,
  };
}

function renderProjectTapHtml(
  payload: ReturnType<typeof buildProjectTapPayload>,
  options?: { projectUrl?: string | null; logoUrl?: string | null; tapId?: string | null }
) {
  const projectCode = escapeProjectTapEmailHtml(payload.project.code);
  const projectName = escapeProjectTapEmailHtml(payload.project.name);
  const projectStatus = escapeProjectTapEmailHtml(formatProjectTapStatusLabel(payload.project.status));
  const projectDescription = formatProjectTapEmailRichText(
    payload.tap?.executiveSummary || payload.project.description || payload.proposal.description ||
      'Projeto estruturado a partir de proposta aprovada, pronto para setup operacional e início da execução.'
  );
  const proposalCode = escapeProjectTapEmailHtml(payload.proposal.code);
  const proposalTitle = escapeProjectTapEmailHtml(payload.proposal.title);
  const proposalDescription = formatProjectTapEmailRichText(payload.proposal.description || '-');
  const clientName = escapeProjectTapEmailHtml(payload.client?.razaoSocial || payload.client?.nomeFantasia || '-');
  const generatedAt = escapeProjectTapEmailHtml(formatProjectTapEmailDate(payload.generatedAt));
  const projectUrl = options?.projectUrl || null;
  const logoUrl = options?.logoUrl || null;
  const tapId = escapeProjectTapEmailHtml(options?.tapId || '-');
  const tapStartDate = escapeProjectTapEmailHtml(formatProjectTapEmailDate(payload.tap?.startDate || payload.proposal.expectedStartDate));
  const tapEndDate = escapeProjectTapEmailHtml(formatProjectTapEmailDate(payload.tap?.endDate || payload.proposal.expectedEndDate));
  const tapObjectives = formatProjectTapEmailRichText(payload.tap?.objectives || '-');
  const tapDeliverables = formatProjectTapEmailRichText(payload.tap?.deliverables || '-');
  const tapPremises = formatProjectTapEmailRichText(payload.tap?.premises || '-');
  const tapExclusions = formatProjectTapEmailRichText(payload.tap?.exclusions || '-');
  const tapStakeholders = formatProjectTapEmailRichText(payload.tap?.stakeholders || '-');
  const tapNotes = formatProjectTapEmailRichText(payload.tap?.notes || '-');
  const tapScope = formatProjectTapHtmlContent(payload.tap?.scopeHtml || '');
  const tapAttachments = Array.isArray(payload.tap?.attachments) ? payload.tap.attachments : [];
  const tapAttachmentsHtml = tapAttachments.length > 0
    ? `<ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.8;">${tapAttachments
        .map((attachment: ProposalTapAttachment) => `<li><strong>${escapeProjectTapEmailHtml(attachment.title)}</strong>${attachment.description ? ` — ${escapeProjectTapEmailHtml(attachment.description)}` : ''}</li>`)
        .join('')}</ul>`
    : '<div style="font-size:14px;line-height:1.8;color:#475569;">Nenhum anexo informado.</div>';

  const infoCard = (label: string, value: string) => `
    <td style="padding:0 6px 12px 6px;" valign="top">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#f8fbff;border:1px solid #d7e5f3;border-radius:18px;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#5b6f82;font-weight:700;">${escapeProjectTapEmailHtml(label)}</div>
            <div style="padding-top:8px;font-size:17px;line-height:1.45;color:#0f172a;font-weight:700;">${value}</div>
          </td>
        </tr>
      </table>
    </td>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TAP do Projeto ${projectCode}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#edf3f8;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:linear-gradient(180deg,#edf3f8 0%,#f8fbfe 100%);">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:760px;">
            <tr>
              <td style="padding-bottom:18px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#0d4f89;border-radius:28px 28px 0 0;overflow:hidden;">
                  <tr>
                    <td style="padding:28px 30px 18px 30px;background:linear-gradient(135deg,#0b4b82 0%,#1566aa 55%,#2f88cd 100%);">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <tr>
                          <td valign="top" style="padding-right:16px;">
                            ${logoUrl ? `<img src="${escapeProjectTapEmailHtml(logoUrl)}" alt="Tec3 Engenharia" style="display:block;height:52px;width:auto;border:0;" />` : `<div style="display:inline-block;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:15px;font-weight:800;letter-spacing:0.08em;color:#ffffff;">TEC3 ENGENHARIA</div>`}
                          </td>
                          <td align="right" valign="top">
                            <div style="display:inline-block;padding:10px 14px;border-radius:999px;background:rgba(255,255,255,0.14);font-size:11px;line-height:1.2;letter-spacing:0.14em;text-transform:uppercase;color:#d9ebfb;font-weight:700;">Termo de Abertura do Projeto</div>
                          </td>
                        </tr>
                      </table>

                      <div style="padding-top:28px;font-size:13px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;color:#cde4f9;font-weight:700;">Projeto aprovado e pronto para onboarding</div>
                      <div style="padding-top:12px;font-size:34px;line-height:1.16;color:#ffffff;font-weight:800;">${projectCode} · ${projectName}</div>
                      <div style="padding-top:14px;font-size:16px;line-height:1.7;color:#ecf5fd;max-width:620px;">
                        A Tec3 Engenharia confirma a geração do TAP deste projeto, consolidando as bases comerciais, operacionais e de planejamento para um início seguro, organizado e com excelente percepção junto ao cliente.
                      </div>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;padding-top:26px;">
                        <tr>
                          ${infoCard('Cliente', clientName)}
                          ${infoCard('Horas previstas', escapeProjectTapEmailHtml(`${payload.project.budgetHours} h`))}
                        </tr>
                        <tr>
                          ${infoCard('Valor aprovado', escapeProjectTapEmailHtml(formatProjectTapEmailCurrency(payload.project.budgetValue)))}
                          ${infoCard('Status inicial', projectStatus)}
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;border:1px solid #d7e5f3;border-top:0;border-radius:0 0 28px 28px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,0.08);">
                  <tr>
                    <td style="padding:28px 30px 12px 30px;">
                      <div style="font-size:22px;line-height:1.3;color:#0f172a;font-weight:800;">Resumo executivo</div>
                      <div style="padding-top:12px;font-size:15px;line-height:1.75;color:#475569;">
                        ${projectDescription}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:0 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="padding:6px;" width="50%" valign="top">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#f8fbff;border:1px solid #d7e5f3;border-radius:20px;">
                              <tr>
                                <td style="padding:20px;">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#0d4f89;font-weight:800;">Base comercial</div>
                                  <div style="padding-top:14px;font-size:13px;line-height:1.5;color:#5b6f82;font-weight:700;">Proposta de origem</div>
                                  <div style="padding-top:4px;font-size:18px;line-height:1.45;color:#0f172a;font-weight:800;">${proposalCode}</div>
                                  <div style="padding-top:14px;font-size:13px;line-height:1.5;color:#5b6f82;font-weight:700;">Título</div>
                                  <div style="padding-top:4px;font-size:15px;line-height:1.6;color:#0f172a;font-weight:700;">${proposalTitle}</div>
                                  <div style="padding-top:14px;font-size:13px;line-height:1.5;color:#5b6f82;font-weight:700;">Descrição</div>
                                  <div style="padding-top:4px;font-size:14px;line-height:1.7;color:#475569;">${proposalDescription}</div>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td style="padding:6px;" width="50%" valign="top">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#0f172a;border-radius:20px;">
                              <tr>
                                <td style="padding:20px;">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;font-weight:800;">Próximos passos</div>
                                  <div style="padding-top:14px;font-size:14px;line-height:1.8;color:#dbeafe;">
                                    1. Validar o setup operacional do projeto.<br />
                                    2. Confirmar responsáveis, limites de horas e regras de aprovação.<br />
                                    3. Iniciar a execução com rastreabilidade e governança desde o primeiro dia.
                                  </div>
                                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:20px;">
                                    <tr>
                                      <td style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.12);font-size:12px;line-height:1.5;color:#93c5fd;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">TAP ID</td>
                                    </tr>
                                    <tr>
                                      <td style="padding:0 0 10px 0;font-size:15px;line-height:1.6;color:#ffffff;font-weight:700;">${tapId}</td>
                                    </tr>
                                    <tr>
                                      <td style="padding:12px 0 0 0;border-top:1px solid rgba(255,255,255,0.12);font-size:12px;line-height:1.5;color:#93c5fd;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Gerado em</td>
                                    </tr>
                                    <tr>
                                      <td style="padding-top:4px;font-size:15px;line-height:1.6;color:#ffffff;font-weight:700;">${generatedAt}</td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 30px 8px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#f5f9fd;border:1px solid #d7e5f3;border-radius:22px;">
                        <tr>
                          <td style="padding:22px 24px;">
                            <div style="font-size:20px;line-height:1.3;color:#0f172a;font-weight:800;">Linha de base do projeto</div>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:16px;">
                              <tr>
                                <td style="padding:0 12px 14px 0;" width="50%" valign="top">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;color:#5b6f82;font-weight:700;">Início previsto</div>
                                  <div style="padding-top:6px;font-size:15px;line-height:1.5;color:#0f172a;font-weight:700;">${tapStartDate}</div>
                                </td>
                                <td style="padding:0 0 14px 12px;" width="50%" valign="top">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;color:#5b6f82;font-weight:700;">Término previsto</div>
                                  <div style="padding-top:6px;font-size:15px;line-height:1.5;color:#0f172a;font-weight:700;">${tapEndDate}</div>
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:0 12px 0 0;" width="50%" valign="top">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;color:#5b6f82;font-weight:700;">Horas previstas no TAP</div>
                                  <div style="padding-top:6px;font-size:15px;line-height:1.5;color:#0f172a;font-weight:700;">${escapeProjectTapEmailHtml(`${payload.project.budgetHours} h`)}</div>
                                </td>
                                <td style="padding:0 0 0 12px;" width="50%" valign="top">
                                  <div style="font-size:12px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;color:#5b6f82;font-weight:700;">Valor aprovado no TAP</div>
                                  <div style="padding-top:6px;font-size:15px;line-height:1.5;color:#0f172a;font-weight:700;">${escapeProjectTapEmailHtml(formatProjectTapEmailCurrency(payload.project.budgetValue))}</div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 30px 8px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#ffffff;border:1px solid #d7e5f3;border-radius:22px;">
                        <tr>
                          <td style="padding:22px 24px;">
                            <div style="font-size:20px;line-height:1.3;color:#0f172a;font-weight:800;">Escopo</div>
                            <div style="padding-top:14px;font-size:14px;line-height:1.8;color:#475569;">${tapScope}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 24px 8px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <tr>
                          ${infoCard('Objetivos', tapObjectives)}
                          ${infoCard('Entregáveis', tapDeliverables)}
                        </tr>
                        <tr>
                          ${infoCard('Premissas', tapPremises)}
                          ${infoCard('Exclusões', tapExclusions)}
                        </tr>
                        <tr>
                          ${infoCard('Stakeholders', tapStakeholders)}
                          ${infoCard('Observações', tapNotes)}
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:18px 30px 8px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#f8fbff;border:1px solid #d7e5f3;border-radius:22px;">
                        <tr>
                          <td style="padding:22px 24px;">
                            <div style="font-size:20px;line-height:1.3;color:#0f172a;font-weight:800;">Anexos vinculados ao TAP</div>
                            <div style="padding-top:14px;">${tapAttachmentsHtml}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  ${projectUrl ? `<tr>
                    <td style="padding:16px 30px 8px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" style="padding:10px 0 0 0;">
                            <a href="${escapeProjectTapEmailHtml(projectUrl)}" style="display:inline-block;padding:15px 26px;border-radius:999px;background:#0d4f89;color:#ffffff;font-size:14px;font-weight:800;line-height:1.2;text-decoration:none;letter-spacing:0.04em;">Abrir projeto no sistema</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>` : ''}

                  <tr>
                    <td style="padding:26px 30px 30px 30px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #d7e5f3;">
                        <tr>
                          <td style="padding-top:18px;font-size:12px;line-height:1.7;color:#64748b;">
                            Este e-mail foi gerado automaticamente pela Tec3 Engenharia para formalizar a abertura do projeto e apoiar um onboarding organizado, profissional e transparente.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendProjectTapEmail(params: {
  payload: ReturnType<typeof buildProjectTapPayload>;
  tapId: string;
}) {
  const serverToken = String(process.env.POSTMARK_SERVER_TOKEN || '').trim();
  const fromEmail = String(process.env.POSTMARK_FROM_EMAIL || '').trim();
  const recipients = parseRecipients(process.env.PROJECT_TAP_NOTIFICATION_TO);
  const ccRecipients = parseRecipients(process.env.PROJECT_TAP_NOTIFICATION_CC);
  const templateAlias = String(process.env.POSTMARK_PROJECT_TAP_TEMPLATE_ALIAS || 'project-tap-generated').trim();

  if (!serverToken || !fromEmail || recipients.length === 0) {
    return { ok: false, reason: 'postmark_not_configured' as const };
  }

  const { projectUrl, logoUrl } = buildProjectTapEmailLinks(params.payload.project.id);
  const subject = `TAP do Projeto ${params.payload.project.code} · ${params.payload.project.name}`;
  const textBody = [
    `O Termo de Abertura do Projeto ${params.payload.project.code} foi gerado com sucesso.`,
    '',
    `Projeto: ${params.payload.project.name}`,
    `Cliente: ${params.payload.client?.razaoSocial || params.payload.client?.nomeFantasia || '-'}`,
    `Proposta de origem: ${params.payload.proposal.code}`,
    `Horas previstas: ${params.payload.project.budgetHours} h`,
    `Valor aprovado: ${formatProjectTapEmailCurrency(params.payload.project.budgetValue)}`,
    `Status inicial: ${formatProjectTapStatusLabel(params.payload.project.status)}`,
    `Início previsto: ${formatProjectTapEmailDate(params.payload.tap?.startDate || params.payload.proposal.expectedStartDate)}`,
    `Término previsto: ${formatProjectTapEmailDate(params.payload.tap?.endDate || params.payload.proposal.expectedEndDate)}`,
    `Sumário executivo: ${params.payload.tap?.executiveSummary || '-'}`,
    `Escopo: ${stripHtmlTags(params.payload.tap?.scopeHtml || '') || '-'}`,
    `Objetivos: ${params.payload.tap?.objectives || '-'}`,
    `Entregáveis: ${params.payload.tap?.deliverables || '-'}`,
    `Premissas: ${params.payload.tap?.premises || '-'}`,
    `Exclusões: ${params.payload.tap?.exclusions || '-'}`,
    `Stakeholders: ${params.payload.tap?.stakeholders || '-'}`,
    `Observações: ${params.payload.tap?.notes || '-'}`,
    Array.isArray(params.payload.tap?.attachments) && params.payload.tap.attachments.length > 0
      ? `Anexos: ${params.payload.tap.attachments.map((attachment: ProposalTapAttachment) => `${attachment.title}${attachment.description ? ` (${attachment.description})` : ''}`).join('; ')}`
      : null,
    `Identificador do TAP: ${params.tapId}`,
    projectUrl ? `Acesse o projeto: ${projectUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const htmlBody = renderProjectTapHtml(params.payload, {
    projectUrl,
    logoUrl,
    tapId: params.tapId,
  });
  const templateModel = {
    ...buildProjectTapTemplateModel({
      payload: params.payload,
      projectUrl,
    }),
    tap_id: params.tapId,
  };

  const postmarkHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Postmark-Server-Token': serverToken,
  };

  const response = await fetch('https://api.postmarkapp.com/email/withTemplate', {
    method: 'POST',
    headers: postmarkHeaders,
    body: JSON.stringify({
      From: fromEmail,
      To: recipients.join(','),
      Cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
      TemplateAlias: templateAlias,
      TemplateModel: templateModel,
      MessageStream: 'outbound',
    }),
  });

  if (response.ok) {
    return { ok: true as const };
  }

  const templateErrorBody = await response.text();
  const shouldFallbackToHtml = response.status === 422 && templateErrorBody.includes('"ErrorCode":1101');
  if (!shouldFallbackToHtml) {
    throw new Error(templateErrorBody || `Postmark returned ${response.status}`);
  }

  const standardResponse = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: postmarkHeaders,
    body: JSON.stringify({
      From: fromEmail,
      To: recipients.join(','),
      Cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
      MessageStream: 'outbound',
    }),
  });

  if (!standardResponse.ok) {
    const body = await standardResponse.text();
    throw new Error(body || `Postmark returned ${standardResponse.status}`);
  }

  return { ok: true as const };
}

async function resendProjectTapEmail(params: {
  projectId: string;
  actorUserId: string;
  req: Request;
}) {
  const project = await storage.getProject(params.projectId);
  if (!project) {
    throw new Error('Projeto nao encontrado');
  }

  const latestTap = await storage.getLatestProjectTap(project.id);
  if (!latestTap) {
    throw new Error('TAP nao encontrada para o projeto');
  }

  const payload = latestTap.payload as ReturnType<typeof buildProjectTapPayload>;
  const outbox = await storage.queueEmailOutbox({
    type: 'project_tap_email',
    referenceType: 'project',
    referenceId: project.id,
    payload: {
      projectId: project.id,
      projectCode: project.code,
      tapId: latestTap.id,
      retry: true,
    } as any,
  });

  try {
    const emailResult = await sendProjectTapEmail({
      payload,
      tapId: latestTap.id,
    });

    if (!emailResult.ok) {
      throw new Error('Postmark não configurado para envio do TAP');
    }

    await storage.updateProject(project.id, {
      tapStatus: PROJECT_TAP_STATUS.SENT,
      tapSentAt: new Date(),
      tapLastEmailError: null,
    } as any);
    await syncProposalTapStatusByProject(project.id, {
      tapStatus: PROPOSAL_TAP_STATUS.SENT,
      tapSentAt: new Date(),
      tapLastEmailError: null,
    });
    await storage.updateEmailOutbox(outbox.id, {
      status: EMAIL_OUTBOX_STATUS.SENT,
      attemptCount: 1,
      sentAt: new Date(),
      lastError: null,
    } as any);
    await clearTapEmailFailureNotifications(project.id);
    await safeCreateUserActivity(params.req, params.actorUserId, {
      category: 'system',
      action: 'PROJECT_TAP_EMAIL_RESENT',
      title: `TAP reenviado — ${project.code}`,
      metadata: { projectId: project.id, tapId: latestTap.id },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await storage.updateProject(project.id, {
      tapStatus: PROJECT_TAP_STATUS.FAILED,
      tapLastEmailError: errorMessage,
    } as any);
    await syncProposalTapStatusByProject(project.id, {
      tapStatus: PROPOSAL_TAP_STATUS.FAILED,
      tapLastEmailError: errorMessage,
    });
    await storage.updateEmailOutbox(outbox.id, {
      status: EMAIL_OUTBOX_STATUS.FAILED,
      attemptCount: 1,
      lastError: errorMessage,
    } as any);
    await notifyAdminsAboutTapEmailFailure({
      projectId: project.id,
      projectCode: project.code,
      projectName: project.name,
      tapId: latestTap.id,
      errorMessage,
    });
    throw error;
  }

  return storage.getProject(project.id);
}

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token obrigatório' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (!decoded?.sub) {
      return res.status(403).json({ message: 'Token inválido' });
    }

    // Always load the current user from DB to avoid stale role claims
    // (e.g. tokens issued before RBAC migration with role=owner).
    const dbUser = await storage.getUser(decoded.sub);
    if (!dbUser || !dbUser.isActive) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }
    const effectiveRole = resolveEffectiveRole((dbUser as any).role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    (req as any).user = {
      sub: dbUser.id,
      email: dbUser.email,
      role: effectiveRole,
    } satisfies JwtPayload;

    next();
  } catch {
    return res.status(403).json({ message: 'Token inválido' });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const conversionAllowedStatuses = new Set<string>([
    'com_sucesso',
    'sucesso_aditivo',
    'approved',
  ]);

  const generateProposalTapFromProposal = async (params: {
    proposal: any;
    tapDraft?: ProposalTapDraft | null;
    actorUserId?: string | null;
    req: Request;
  }) => {
    const { proposal, actorUserId, req } = params;
    const tapDraft = normalizeProposalTapDraft(proposal, params.tapDraft ?? proposal.tapPayload ?? null);

    if (proposal.projectId) {
      throw new Error('Proposta ja convertida em projeto');
    }

    if (!conversionAllowedStatuses.has(proposal.status)) {
      throw new Error('Apenas propostas com sucesso podem ser convertidas');
    }

    validateProposalTapDraft(tapDraft);

    const project = await storage.createProject({
      name: tapDraft.projectName || proposal.title,
      description: tapDraft.executiveSummary || proposal.description,
      clientId: proposal.clientId,
      coordinatorId: proposal.coordinatorId,
      startDate: tapDraft.startDate || proposal.expectedStartDate,
      endDate: tapDraft.endDate || proposal.expectedEndDate,
      budgetHours: tapDraft.budgetHours,
      budgetValue: tapDraft.budgetValue,
    });

    const client = await storage.getClient(proposal.clientId);
    const tapPayload = buildProjectTapPayload({ proposal, project, client, tapDraft });
    const tapLinks = buildProjectTapEmailLinks(project.id);
    const tap = await storage.createProjectTap({
      projectId: project.id,
      title: `TAP ${project.code}`,
      payload: tapPayload as any,
      htmlContent: renderProjectTapHtml(tapPayload, {
        projectUrl: tapLinks.projectUrl,
        logoUrl: tapLinks.logoUrl,
      }),
      generatedById: actorUserId ?? null,
    });

    await storage.updateProject(project.id, {
      tapStatus: PROJECT_TAP_STATUS.GENERATED,
      tapGeneratedAt: new Date(),
      tapLastEmailError: null,
      setupStatus: PROJECT_SETUP_STATUS.PENDING,
    } as any);

    await storage.updateProposal(proposal.id, {
      ...(proposal.status === 'approved' ? { status: 'com_sucesso' } : {}),
      projectId: project.id,
      tapPayload: tapDraft as any,
      tapStatus: PROPOSAL_TAP_STATUS.GENERATED,
      tapGeneratedAt: new Date(),
      tapGeneratedById: actorUserId ?? null,
      tapSentAt: null,
      tapLastEmailError: null,
    } as any);

    const outbox = await storage.queueEmailOutbox({
      type: 'project_tap_generated',
      referenceType: 'project',
      referenceId: project.id,
      payload: {
        projectId: project.id,
        projectCode: project.code,
        proposalId: proposal.id,
        proposalCode: proposal.code,
        tapId: tap.id,
      } as any,
    });

    try {
      const emailResult = await sendProjectTapEmail({
        payload: tapPayload,
        tapId: tap.id,
      });

      if (!emailResult.ok) {
        throw new Error('Postmark não configurado para envio do TAP');
      }

      await storage.updateProject(project.id, {
        tapStatus: PROJECT_TAP_STATUS.SENT,
        tapSentAt: new Date(),
        tapLastEmailError: null,
      } as any);
      await storage.updateProposal(proposal.id, {
        tapStatus: PROPOSAL_TAP_STATUS.SENT,
        tapSentAt: new Date(),
        tapLastEmailError: null,
      } as any);
      await storage.updateEmailOutbox(outbox.id, {
        status: EMAIL_OUTBOX_STATUS.SENT,
        attemptCount: 1,
        sentAt: new Date(),
        lastError: null,
      } as any);
      await clearTapEmailFailureNotifications(project.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await storage.updateProject(project.id, {
        tapStatus: PROJECT_TAP_STATUS.FAILED,
        tapLastEmailError: errorMessage,
      } as any);
      await storage.updateProposal(proposal.id, {
        tapStatus: PROPOSAL_TAP_STATUS.FAILED,
        tapLastEmailError: errorMessage,
      } as any);
      await storage.updateEmailOutbox(outbox.id, {
        status: EMAIL_OUTBOX_STATUS.FAILED,
        attemptCount: 1,
        lastError: errorMessage,
      } as any);
      await notifyAdminsAboutTapEmailFailure({
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        tapId: tap.id,
        errorMessage,
      });
    }

    if (typeof actorUserId === 'string') {
      await safeCreateUserActivity(req, actorUserId, {
        category: 'system',
        action: 'PROPOSAL_TAP_GENERATED',
        title: `TAP gerado a partir da proposta — ${proposal.code}`,
        metadata: {
          proposalId: proposal.id,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          projectId: project.id,
          projectCode: (project as any).code ?? null,
        },
      });

      await safeCreateUserActivity(req, actorUserId, {
        category: 'system',
        action: 'PROJECT_TAP_GENERATED',
        title: `TAP gerado — ${project.code}`,
        metadata: {
          projectId: project.id,
          proposalId: proposal.id,
          tapId: tap.id,
        },
      });
    }

    const updatedProject = await storage.getProject(project.id);
    const updatedProposal = await storage.getProposal(proposal.id);

    return {
      project: updatedProject ?? project,
      proposal: updatedProposal,
    };
  };

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier: identifierRaw, email, password } = req.body;
      const identifier =
        typeof identifierRaw === 'string'
          ? identifierRaw.trim()
          : typeof email === 'string'
            ? email.trim()
            : '';
      const rawPassword = typeof password === 'string' ? password : '';

    if (!identifier || !rawPassword) {
      return res.status(400).json({ message: 'Credenciais inválidas' });
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();
    const isAdminFallback =
      normalizedIdentifier === 'admin@empresa.com' || normalizedIdentifier === 'admin';
    const forceLocalAuth = isAdminFallback;
    const localIdentifier = isAdminFallback ? 'admin@empresa.com' : identifier;

    // LDAP (AD -> OpenLDAP). If LDAP finds the user but password is wrong,
    // do NOT fall back to local auth.
    if (!forceLocalAuth) {
      const ldapAttempt = await authenticateViaLdap({ identifier, password: rawPassword });
      if (ldapAttempt?.status === 'invalid_password') {
        return res.status(401).json({
          message: 'Credenciais inválidas',
          ...(process.env.NODE_ENV !== 'production'
            ? { provider: ldapAttempt.provider, reason: 'ldap_invalid_password' }
            : {}),
        });
      }

      if (ldapAttempt?.status === 'error') {
        const errorDetails =
          ldapAttempt.error instanceof Error
            ? ldapAttempt.error.message
            : typeof ldapAttempt.error === 'string'
              ? ldapAttempt.error
              : JSON.stringify(ldapAttempt.error);

        console.error('LDAP authentication error:', {
          provider: ldapAttempt.provider,
          identifier,
          error: errorDetails,
        });

        return res.status(500).json({
          message: 'Erro ao autenticar via LDAP',
          ...(process.env.NODE_ENV !== 'production'
            ? { provider: ldapAttempt.provider, details: errorDetails }
            : {}),
        });
      }

      if (ldapAttempt?.status === 'success') {
        const {
          email: ldapEmail,
          name: ldapName,
          role: ldapRole,
          memberSince: ldapMemberSince,
        } = ldapAttempt.profile;

        let user = await storage.getUserByEmail(ldapEmail);
        if (!user) {
          user = await storage.createUser({
            email: ldapEmail,
            password: `ldap:${crypto.randomUUID()}`,
            name: ldapName,
            role: ldapRole,
            isActive: true,
          } as any);
        } else {
          user =
            (await storage.updateUser(user.id, {
              name: ldapName,
              role: ldapRole,
              isActive: true,
            } as any)) || user;
        }

        await storage.createUserActivity(user.id, {
          category: 'security',
          action: 'SECURITY_LOGIN_SUCCESS',
          title: 'Login realizado',
          metadata: {
            provider: `ldap:${ldapAttempt.provider}`,
            directoryWhenCreated: ldapMemberSince,
          },
          ip: getRequestIp(req),
          userAgent: getUserAgent(req),
        });

        const effectiveRole = resolveEffectiveRole(user.role);
        if (!effectiveRole) {
          return res.status(403).json({ message: 'Perfil inválido' });
        }

        const token = jwt.sign(
          { sub: user.id, email: user.email, role: effectiveRole },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_SECONDS }
        );

        return res.json({
          accessToken: token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: effectiveRole,
            photoUrl: user.photoUrl,
          },
        });
      }
    }
    
    const user = await storage.getUserByEmail(localIdentifier);
    if (!user || !user.isActive) {
      if (user) {
        await storage.createUserActivity(user.id, {
          category: 'security',
          action: 'SECURITY_LOGIN_FAILED',
          title: 'Falha no login',
          metadata: { reason: !user.isActive ? 'inactive' : 'invalid_credentials' },
          ip: getRequestIp(req),
          userAgent: getUserAgent(req),
        });
      }
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const isValid = await bcrypt.compare(rawPassword, user.password);
    if (!isValid) {
      await storage.createUserActivity(user.id, {
        category: 'security',
        action: 'SECURITY_LOGIN_FAILED',
        title: 'Falha no login',
        metadata: { reason: 'invalid_credentials' },
        ip: getRequestIp(req),
        userAgent: getUserAgent(req),
      });
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    await storage.createUserActivity(user.id, {
      category: 'security',
      action: 'SECURITY_LOGIN_SUCCESS',
      title: 'Login realizado',
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });

    const effectiveRole = resolveEffectiveRole(user.role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: effectiveRole },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_SECONDS }
    );

      res.json({
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: effectiveRole,
          photoUrl: user.photoUrl,
        },
      });
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);

      console.error('Login route unexpected error:', {
        identifier: typeof req.body?.identifier === 'string' ? req.body.identifier : undefined,
        details,
      });

      return res.status(500).json({
        message: 'Erro interno ao processar login',
        ...(process.env.NODE_ENV !== 'production' ? { details } : {}),
      });
    }
  });

  // User creation is admin-only
  app.post('/api/auth/register', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { email, password, name, role } = req.body;
    
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'E-mail já cadastrado' });
    }

    const requestedRole = role ?? 'projects';
    if (!isRole(requestedRole)) {
      return res.status(400).json({ message: 'Perfil inválido' });
    }

    const user = await storage.createUser({
      email,
      password,
      name,
      role: requestedRole,
      isActive: true,
    });

    await storage.createUserActivity(user.id, {
      category: 'system',
      action: 'ACCOUNT_CREATED',
      title: 'Conta criada',
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });

    const effectiveRole = resolveEffectiveRole(user.role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: effectiveRole },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_SECONDS }
    );

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: effectiveRole,
        photoUrl: user.photoUrl,
      },
    });
  });

  const allowedHeaderShortcutPaths = new Set(['/', '/clients', '/proposals', '/projects', '/time-entries', '/reports', '/categories', '/cost-centers', '/users', '/settings']);

  const normalizeHeaderShortcutPaths = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];

    return Array.from(
      new Set(
        value
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => Boolean(item) && allowedHeaderShortcutPaths.has(item))
      )
    ).slice(0, 4);
  };

  const getUserHeaderShortcutPaths = (user: any): string[] => {
    const fromJson = normalizeHeaderShortcutPaths(user?.headerShortcutPaths);
    if (fromJson.length > 0) return fromJson;

    const fallback = typeof user?.headerShortcutPath === 'string' ? user.headerShortcutPath.trim() : '';
    return fallback && allowedHeaderShortcutPaths.has(fallback) ? [fallback] : [];
  };

  app.get('/api/auth/me', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const [user, profileSummary] = await Promise.all([
      storage.getUser(userId),
      storage.getUserProfileSummary(userId),
    ]);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    const effectiveRole = resolveEffectiveRole(user.role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      isActive: user.isActive,
      photoUrl: user.photoUrl,
      accountSummary: {
        hoursThisMonth: profileSummary.hoursThisMonth,
        approvedHoursThisMonth: profileSummary.approvedHoursThisMonth,
        status: user.isActive ? 'active' : 'inactive',
        memberSince: profileSummary.memberSince,
        lastLoginAt: profileSummary.lastLoginAt,
      },
      preferences: {
        theme: user.theme || 'light',
        sidebarCollapsed: user.sidebarCollapsed || false,
        language: user.language || 'pt-BR',
        notificationsEnabled: user.receivesEmails,
        toastPosition: user.toastPosition || 'bottom-right',
        headerShortcutPath: user.headerShortcutPath || null,
        headerShortcutPaths: getUserHeaderShortcutPaths(user),
      },
    });
  });

  app.get('/api/auth/preferences', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    res.json({
      theme: user.theme || 'light',
      sidebarCollapsed: user.sidebarCollapsed || false,
      language: user.language || 'pt-BR',
      proposalColumns: user.proposalColumns || null,
      notificationsEnabled: user.receivesEmails,
      toastPosition: user.toastPosition || 'bottom-right',
      headerShortcutPath: user.headerShortcutPath || null,
      headerShortcutPaths: getUserHeaderShortcutPaths(user),
    });
  });

  app.put('/api/auth/preferences', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const { theme, sidebarCollapsed, language, proposalColumns, toastPosition, notificationsEnabled, headerShortcutPath, headerShortcutPaths } = req.body;
    
    const updateData: any = {};
    if (theme !== undefined) updateData.theme = theme;
    if (sidebarCollapsed !== undefined) updateData.sidebarCollapsed = sidebarCollapsed;
    if (language !== undefined) updateData.language = language;
    if (proposalColumns !== undefined) updateData.proposalColumns = proposalColumns;
    if (notificationsEnabled !== undefined) {
      if (typeof notificationsEnabled !== 'boolean') {
        return res.status(400).json({ message: 'Valor de notificações inválido' });
      }
      updateData.receivesEmails = notificationsEnabled;
    }
    if (toastPosition !== undefined) {
      const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
      if (typeof toastPosition !== 'string' || !allowed.has(toastPosition)) {
        return res.status(400).json({ message: 'Posição de toast inválida' });
      }
      updateData.toastPosition = toastPosition;
    }
    if (headerShortcutPath !== undefined) {
      if (headerShortcutPath !== null && (typeof headerShortcutPath !== 'string' || !allowedHeaderShortcutPaths.has(headerShortcutPath))) {
        return res.status(400).json({ message: 'Atalho do header inválido' });
      }
      updateData.headerShortcutPath = headerShortcutPath;
    }
    if (headerShortcutPaths !== undefined) {
      if (!Array.isArray(headerShortcutPaths)) {
        return res.status(400).json({ message: 'Lista de atalhos do header inválida' });
      }

      const normalizedPaths = normalizeHeaderShortcutPaths(headerShortcutPaths);
      const rawPaths = headerShortcutPaths
        .filter((item: unknown) => typeof item === 'string')
        .map((item: string) => item.trim())
        .filter(Boolean);

      if (normalizedPaths.length !== rawPaths.length) {
        return res.status(400).json({ message: 'Lista de atalhos do header inválida' });
      }

      updateData.headerShortcutPaths = normalizedPaths;
      updateData.headerShortcutPath = normalizedPaths[0] ?? null;
    }
    
    const user = await storage.updateUser(userId, updateData);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    await storage.createUserActivity(userId, {
      category: 'preferences',
      action: 'PREFERENCES_UPDATED',
      title: 'Preferências atualizadas',
      metadata: {
        themeChanged: theme !== undefined,
        sidebarCollapsedChanged: sidebarCollapsed !== undefined,
        languageChanged: language !== undefined,
        proposalColumnsChanged: proposalColumns !== undefined,
        notificationsChanged: notificationsEnabled !== undefined,
        toastPositionChanged: toastPosition !== undefined,
        headerShortcutChanged: headerShortcutPath !== undefined || headerShortcutPaths !== undefined,
      },
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });

    res.json({
      theme: user.theme || 'light',
      sidebarCollapsed: user.sidebarCollapsed || false,
      language: user.language || 'pt-BR',
      proposalColumns: user.proposalColumns || null,
      notificationsEnabled: user.receivesEmails,
      toastPosition: user.toastPosition || 'bottom-right',
      headerShortcutPath: user.headerShortcutPath || null,
      headerShortcutPaths: getUserHeaderShortcutPaths(user),
    });
  });

  app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const { name, email } = req.body;

    if (name !== undefined || email !== undefined) {
      return res.status(400).json({ message: 'Nome completo e email não podem ser alterados.' });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const effectiveRole = resolveEffectiveRole(user.role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      photoUrl: user.photoUrl,
    });
  });

  app.post('/api/auth/upload-photo', authenticateToken, upload.single('photo'), async (req, res) => {
    const userId = (req as any).user.sub;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    const photoData = req.file.buffer;
    const photoMimeType = req.file.mimetype;
    const photoUrl = `/api/auth/photo/${userId}`;

    const user = await storage.updateUserPhoto(userId, photoData, photoMimeType, photoUrl);
    
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    await storage.createUserActivity(userId, {
      category: 'profile',
      action: 'PROFILE_PHOTO_UPDATED',
      title: 'Foto de perfil atualizada',
      metadata: { mimeType: photoMimeType, sizeBytes: photoData?.length ?? null },
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
    });

    const effectiveRole = resolveEffectiveRole(user.role);
    if (!effectiveRole) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: effectiveRole,
      photoUrl: user.photoUrl,
    });
  });

  app.get('/api/auth/photo/:userId', async (req, res) => {
    const { userId } = req.params;
    const photoData = await storage.getUserPhoto(userId);
    
    if (!photoData || !photoData.data) {
      return res.status(404).json({ message: 'Foto nao encontrada' });
    }

    res.set('Content-Type', photoData.mimeType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(photoData.data);
  });

  app.get('/api/auth/users', authenticateToken, async (req, res) => {
    // Only admin can list users
    const role = (req as any).user?.role;
    if (role !== 'admin') return res.status(403).json({ message: 'Acesso não autorizado' });
    const hasAdDirectoryConfig = Boolean(process.env.LDAP_AD_URL && process.env.LDAP_AD_BASE_DN);
    const [localUsers, directoryUsers] = await Promise.all([
      storage.getAllUsers(),
      listAdDirectoryUsers(),
    ]);

    if (directoryUsers && directoryUsers.length > 0) {
      const localByEmail = new Map(localUsers.map((user) => [user.email.trim().toLowerCase(), user] as const));
      return res.json(directoryUsers.map((user) => {
        const local = localByEmail.get(user.email);
        return {
          id: local?.id ?? `ad:${encodeURIComponent(user.email)}`,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: local?.isActive ?? true,
          professionalCategoryId: (local as any)?.professionalCategoryId ?? null,
          emailGroup: (local as any)?.emailGroup ?? null,
          receivesEmails: (local as any)?.receivesEmails ?? false,
          photoUrl: local?.photoUrl,
        };
      }));
    }

    if (hasAdDirectoryConfig) {
      return res.status(503).json({
        message: 'Nao foi possivel carregar os usuarios do AD.',
      });
    }

    res.json(localUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      professionalCategoryId: (u as any).professionalCategoryId ?? null,
      emailGroup: (u as any).emailGroup ?? null,
      receivesEmails: (u as any).receivesEmails ?? false,
      photoUrl: u.photoUrl,
    })));
  });

  app.put('/api/auth/users/:userId/professional', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { userId } = req.params;
    const { professionalCategoryId, emailGroup, receivesEmails } = req.body ?? {};

    const updates: any = {};
    if (professionalCategoryId === null || typeof professionalCategoryId === 'string') {
      updates.professionalCategoryId = professionalCategoryId;
    }
    if (emailGroup === null || typeof emailGroup === 'string') {
      updates.emailGroup = emailGroup;
    }
    if (typeof receivesEmails === 'boolean') {
      updates.receivesEmails = receivesEmails;
    }

    let targetUserId = userId;

    if (userId.startsWith('ad:')) {
      const email = decodeURIComponent(userId.slice(3)).trim().toLowerCase();
      let localUser = await storage.getUserByEmail(email);

      if (!localUser) {
        const directoryUsers = await listAdDirectoryUsers();
        const directoryUser = directoryUsers?.find((user) => user.email === email);

        localUser = await storage.createUser({
          email,
          password: `ldap:${crypto.randomUUID()}`,
          name: directoryUser?.name ?? email,
          role: directoryUser?.role ?? 'projects',
          isActive: true,
        } as any);
      }

      targetUserId = localUser.id;
    }

    const updated = await storage.updateUser(targetUserId, updates);
    if (!updated) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.json({
      id: updated.id,
      professionalCategoryId: (updated as any).professionalCategoryId ?? null,
      emailGroup: (updated as any).emailGroup ?? null,
      receivesEmails: (updated as any).receivesEmails ?? false,
    });
  });

  // Public (authenticated) user list for internal dropdowns (legacy parity)
  app.get('/api/users', authenticateToken, requireRoles(['admin', 'commercial', 'projects']), async (_req, res) => {
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
    })));
  });

  app.get('/api/auth/activities', authenticateToken, async (req, res) => {
    const requester = (req as any).user as JwtPayload;
    const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const targetUserId = requestedUserId ?? requester.sub;
    const isAudit = targetUserId !== requester.sub;
    if (isAudit && requester.role !== 'admin') {
      return res.status(403).json({ message: 'Acesso não autorizado' });
    }

    const result = await storage.getUserActivities(targetUserId, {
      category: category as any,
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
    });

    res.json(result);
  });

  app.get('/api/auth/notifications', authenticateToken, async (req, res) => {
    const requester = (req as any).user as JwtPayload;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const unreadOnly = typeof req.query.unreadOnly === 'string'
      ? req.query.unreadOnly === 'true'
      : undefined;

    await storage.syncProposalDueNotifications();

    const result = await storage.getUserNotifications(requester.sub, {
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
      unreadOnly,
    });

    res.json({
      items: result.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        link: item.link,
        metadata: item.metadata,
        isRead: Boolean(item.readAt),
        readAt: item.readAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      nextCursor: result.nextCursor,
      unreadCount: result.unreadCount,
    });
  });

  app.put('/api/auth/notifications/read-all', authenticateToken, async (req, res) => {
    const requester = (req as any).user as JwtPayload;
    const result = await storage.markAllNotificationsRead(requester.sub);
    res.json(result);
  });

  app.put('/api/auth/notifications/:notificationId/read', authenticateToken, async (req, res) => {
    const requester = (req as any).user as JwtPayload;
    const { notificationId } = req.params;

    const notification = await storage.markNotificationRead(requester.sub, notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notificacao nao encontrada' });
    }

    res.json({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      metadata: notification.metadata,
      isRead: Boolean(notification.readAt),
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    });
  });

  app.get('/api/clients', authenticateToken, requireRoles(['commercial', 'projects']), async (_req, res) => {
    const clients = await storage.getAllClients();
    res.json(clients);
  });

  app.get('/api/clients/:id', authenticateToken, requireRoles(['commercial', 'projects']), async (req, res) => {
    const client = await storage.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.json(client);
  });

  app.post('/api/clients', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const client = await storage.createClient(req.body);
    res.status(201).json(client);
  });

  app.put('/api/clients/:id', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const client = await storage.updateClient(req.params.id, req.body);
    if (!client) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.json(client);
  });

  app.delete('/api/clients/:id', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const deleted = await storage.deleteClient(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.status(204).send();
  });

  app.get('/api/proposals', authenticateToken, requireRoles(['commercial']), async (_req, res) => {
    const proposals = await storage.getAllProposals();
    const clients = await storage.getAllClients();
    const clientMap = new Map(clients.map(c => [c.id, c]));
    
    const enriched = proposals.map(p => ({
      ...p,
      client: clientMap.get(p.clientId),
    }));
    res.json(enriched);
  });

  app.get('/api/proposals/:id', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const proposal = await storage.getProposal(req.params.id);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }
    const client = await storage.getClient(proposal.clientId);
    res.json({ ...proposal, client });
  });

  app.post('/api/proposals', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const clientId = String(body.clientId ?? '').trim();
    const type = String(body.type ?? '').trim();
    const coordinatorName = String(body.coordinatorName ?? '').trim();
    const riskAssessment = String(body.riskAssessment ?? '').trim();
    const umbrellaRef = String(body.umbrellaRef ?? '').trim();

    if (!title) {
      return res.status(400).json({ message: 'Título é obrigatório' });
    }
    if (!clientId) {
      return res.status(400).json({ message: 'Cliente é obrigatório' });
    }
    if (!type) {
      return res.status(400).json({ message: 'Tipo do contrato é obrigatório' });
    }
    if (!coordinatorName) {
      return res.status(400).json({ message: 'Responsável pela proposta é obrigatório' });
    }
    if (!riskAssessment) {
      return res.status(400).json({ message: 'Avaliação de risco é obrigatória' });
    }
    if (type === 'service_order' && !umbrellaRef) {
      return res.status(400).json({ message: 'Proposta original (guarda-chuva) é obrigatória' });
    }

    const proposal = await storage.createProposal(req.body);

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_CREATED',
        title: `Proposta criada — ${proposal.code}`,
        metadata: {
          proposalId: proposal.id,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          clientId: proposal.clientId,
        },
      });
    }

    res.status(201).json(proposal);
  });

  app.put('/api/proposals/:id', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const latest = await storage.getLatestProposalByCode(existing.code);
      if (latest && (latest.revision ?? 0) > (existing.revision ?? 0)) {
        return res.status(400).json({ message: 'Somente a ultima revisao de uma proposta pode ser editada' });
      }

      if (req.body.status && req.body.status !== existing.status) {
        const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
        if (!allowed.includes(req.body.status)) {
          return res.status(400).json({
            message: `Transicao de status invalida de '${existing.status}' para '${req.body.status}'. Permitidos: ${allowed.join(', ') || 'nenhum'}`,
          });
        }
      }

      const proposal = await storage.updateProposal(req.params.id, req.body);

      const responseProposal = await storage.getProposal(req.params.id);

      const userId = (req as any).user?.sub;
      if (typeof userId === 'string') {
        const requestedStatus = typeof req.body?.status === 'string' ? req.body.status : undefined;
        const statusChanged = Boolean(requestedStatus && requestedStatus !== existing.status);
        const fieldsChanged = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];

        await safeCreateUserActivity(req, userId, {
          category: 'system',
          action: statusChanged ? 'PROPOSAL_STATUS_UPDATED' : 'PROPOSAL_UPDATED',
          title: statusChanged
            ? `Status da proposta atualizado — ${existing.code}`
            : `Proposta atualizada — ${existing.code}`,
          metadata: {
            proposalId: existing.id,
            code: existing.code,
            revision: (existing as any).revision ?? null,
            fieldsChanged,
            ...(statusChanged
              ? { statusFrom: existing.status, statusTo: requestedStatus }
              : {}),
          },
        });
      }

      res.json(responseProposal || proposal);
    } catch (error: any) {
      console.error('Error updating proposal:', error);
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao atualizar proposta';
      // Prisma validation / bad input typically should be a 400
      const status = message.toLowerCase().includes('invalid') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  app.post('/api/proposals/:id/revision', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const latest = existing.code ? await storage.getLatestProposalByCode(existing.code) : null;
      if (latest && (latest.revision ?? 0) > (existing.revision ?? 0)) {
        return res.status(400).json({ message: 'Somente a ultima revisao de uma proposta pode ser revisada' });
      }

      const created = await storage.createProposalRevision(req.params.id);
      if (!created) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const userId = (req as any).user?.sub;
      if (typeof userId === 'string') {
        await safeCreateUserActivity(req, userId, {
          category: 'system',
          action: 'PROPOSAL_REVISED',
          title: `Revisão criada — ${existing.code}`,
          metadata: {
            proposalId: existing.id,
            code: existing.code,
            fromRevision: (existing as any).revision ?? null,
            toRevision: (created as any).revision ?? null,
          },
        });
      }

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating proposal revision:', error);
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao criar revisao da proposta';
      res.status(500).json({ message });
    }
  });

  app.delete('/api/proposals/:id', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const latest = existing.code ? await storage.getLatestProposalByCode(existing.code) : null;
      if (latest && (latest.revision ?? 0) > (existing.revision ?? 0)) {
        return res.status(400).json({ message: 'Somente a ultima revisao de uma proposta pode ser excluida' });
      }

      if (existing.projectId) {
        return res.status(400).json({
          message: 'Exclusão não permitida. A proposta já foi convertida em projeto.',
        });
      }

      const deleted = await storage.deleteProposal(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const userId = (req as any).user?.sub;
      if (typeof userId === 'string') {
        await safeCreateUserActivity(req, userId, {
          category: 'system',
          action: 'PROPOSAL_DELETED',
          title: `Proposta excluída — ${existing.code}`,
          metadata: {
            proposalId: existing.id,
            code: existing.code,
            revision: (existing as any).revision ?? null,
          },
        });
      }

      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting proposal:', error);
      const message = typeof error?.message === 'string' ? error.message : 'Erro ao excluir proposta';
      res.status(500).json({ message });
    }
  });

  app.post('/api/proposals/convert', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const { proposalId, projectName, startDate } = req.body;
    
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    if (proposal.projectId) {
      return res.status(400).json({ message: 'Proposta ja convertida em projeto' });
    }

    if (!conversionAllowedStatuses.has(proposal.status)) {
      return res.status(400).json({ message: 'Apenas propostas com sucesso podem ser convertidas' });
    }

    const result = await generateProposalTapFromProposal({
      proposal,
      tapDraft: normalizeProposalTapDraft(proposal, {
        ...(proposal.tapPayload && typeof proposal.tapPayload === 'object' ? proposal.tapPayload : {}),
        projectName,
        startDate,
      }),
      actorUserId: typeof (req as any).user?.sub === 'string' ? (req as any).user.sub : null,
      req,
    });

    res.status(201).json(result.project);
  });

  app.put('/api/proposals/:id/tap', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const latest = await storage.getLatestProposalByCode(proposal.code);
      if (latest && (latest.revision ?? 0) > (proposal.revision ?? 0)) {
        return res.status(400).json({ message: 'Somente a ultima revisao pode gerar TAP' });
      }

      if (!conversionAllowedStatuses.has(proposal.status)) {
        return res.status(400).json({ message: 'O TAP so pode ser preparado para propostas concluídas com sucesso' });
      }

      if (proposal.projectId) {
        return res.status(400).json({ message: 'O TAP desta proposta ja foi gerado e esta em modo somente leitura' });
      }

      const tapDraft = normalizeProposalTapDraft(proposal, req.body);
      const updated = await storage.updateProposal(req.params.id, {
        tapPayload: tapDraft as any,
        tapStatus: PROPOSAL_TAP_STATUS.DRAFT,
        tapLastEmailError: null,
      } as any);

      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar TAP';
      res.status(500).json({ message });
    }
  });

  app.post('/api/proposals/:id/tap/generate', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      const latest = await storage.getLatestProposalByCode(proposal.code);
      if (latest && (latest.revision ?? 0) > (proposal.revision ?? 0)) {
        return res.status(400).json({ message: 'Somente a ultima revisao pode gerar TAP' });
      }

      const result = await generateProposalTapFromProposal({
        proposal,
        tapDraft: req.body,
        actorUserId: typeof (req as any).user?.sub === 'string' ? (req as any).user.sub : null,
        req,
      });

      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao gerar TAP';
      res.status(500).json({ message });
    }
  });

  app.post('/api/proposals/:id/tap/resend-email', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const requester = (req as any).user as TokenPayload | undefined;
    if (!requester?.sub) {
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ message: 'Proposta nao encontrada' });
      }

      if (!proposal.projectId) {
        return res.status(400).json({ message: 'A proposta ainda nao gerou um projeto/TAP' });
      }

      await resendProjectTapEmail({
        projectId: proposal.projectId,
        actorUserId: requester.sub,
        req,
      });

      const updatedProposal = await storage.getProposal(req.params.id);
      res.json(updatedProposal);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reenviar TAP';
      res.status(500).json({ message });
    }
  });

  app.get('/api/projects', authenticateToken, requireRoles(['projects']), async (_req, res) => {
    const projects = await storage.getAllProjects();
    const clients = await storage.getAllClients();
    const timeEntries = await storage.getAllTimeEntries();
    const clientMap = new Map(clients.map(c => [c.id, c]));

    const approvedHoursByProject = new Map<string, number>();
    const pendingHoursByProject = new Map<string, number>();

    for (const entry of timeEntries) {
      const hours = parseFloat(String(entry.hours || 0));
      if (!Number.isFinite(hours)) continue;

      if (entry.status === 'approved') {
        approvedHoursByProject.set(
          entry.projectId,
          (approvedHoursByProject.get(entry.projectId) || 0) + hours
        );
      } else if (entry.status === 'pending') {
        pendingHoursByProject.set(
          entry.projectId,
          (pendingHoursByProject.get(entry.projectId) || 0) + hours
        );
      }
    }
    
    const enriched = projects.map(p => ({
      ...p,
      client: clientMap.get(p.clientId),
      consumedHours: approvedHoursByProject.get(p.id) || 0,
      pendingHours: pendingHoursByProject.get(p.id) || 0,
    }));
    res.json(enriched);
  });

  app.get('/api/projects/:id', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const [client, entries, users, categories] = await Promise.all([
      storage.getClient(project.clientId),
      storage.getTimeEntriesByProject(project.id),
      storage.getAllUsers(),
      storage.getAllProposalCategories({ includeInactive: true }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
    const coordinator = project.coordinatorId
      ? userMap.get(project.coordinatorId) || null
      : null;

    const parseHours = (value: unknown) => {
      const parsed = parseFloat(String(value || 0));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    let launchedHours = 0;
    let approvedHours = 0;
    let pendingApprovalHours = 0;
    let rejectedHours = 0;

    const hoursByCollaboratorMap = new Map<string, {
      collaboratorId: string;
      collaboratorName: string;
      collaboratorEmail: string | null;
      role: string | null;
      profile: string | null;
      launchedHours: number;
      approvedHours: number;
      pendingApprovalHours: number;
      rejectedHours: number;
      entriesCount: number;
    }>();

    for (const entry of entries) {
      const hours = parseHours(entry.hours);
      launchedHours += hours;

      if (entry.status === 'approved') {
        approvedHours += hours;
      } else if (entry.status === 'pending') {
        pendingApprovalHours += hours;
      } else if (entry.status === 'rejected') {
        rejectedHours += hours;
      }

      const user = userMap.get(entry.collaboratorId);
      const profile = user?.professionalCategoryId
        ? categoryMap.get(user.professionalCategoryId) || null
        : null;

      const existing = hoursByCollaboratorMap.get(entry.collaboratorId);
      if (existing) {
        existing.launchedHours += hours;
        existing.entriesCount += 1;
        if (entry.status === 'approved') existing.approvedHours += hours;
        if (entry.status === 'pending') existing.pendingApprovalHours += hours;
        if (entry.status === 'rejected') existing.rejectedHours += hours;
      } else {
        hoursByCollaboratorMap.set(entry.collaboratorId, {
          collaboratorId: entry.collaboratorId,
          collaboratorName: user?.name || entry.collaboratorId || 'Sem identificação',
          collaboratorEmail: user?.email || null,
          role: user?.role || null,
          profile,
          launchedHours: hours,
          approvedHours: entry.status === 'approved' ? hours : 0,
          pendingApprovalHours: entry.status === 'pending' ? hours : 0,
          rejectedHours: entry.status === 'rejected' ? hours : 0,
          entriesCount: 1,
        });
      }
    }

    const hoursByCollaborator = Array.from(hoursByCollaboratorMap.values()).sort(
      (a, b) => b.launchedHours - a.launchedHours
    );

    const entriesCount = entries.length;
    const approvedEntriesCount = entries.filter((entry) => entry.status === 'approved').length;
    const pendingEntriesCount = entries.filter((entry) => entry.status === 'pending').length;
    const rejectedEntriesCount = entries.filter((entry) => entry.status === 'rejected').length;

    res.json({
      ...project,
      client,
      coordinator: coordinator
        ? {
            id: coordinator.id,
            name: coordinator.name,
            email: coordinator.email,
          }
        : null,
      timeSummary: {
        launchedHours,
        approvedHours,
        pendingApprovalHours,
        rejectedHours,
        entriesCount,
        approvedEntriesCount,
        pendingEntriesCount,
        rejectedEntriesCount,
      },
      hoursByCollaborator,
    });
  });

  app.get('/api/projects/:id/tap', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const tap = await storage.getLatestProjectTap(project.id);
    res.json(tap);
  });

  app.post('/api/projects/:id/tap/resend-email', authenticateToken, requireRoles(['admin', 'commercial', 'projects']), async (req, res) => {
    const requester = (req as any).user as TokenPayload | undefined;
    if (!requester?.sub) {
      return res.status(401).json({ message: 'Usuário não autenticado' });
    }

    try {
      const project = await resendProjectTapEmail({
        projectId: req.params.id,
        actorUserId: requester.sub,
        req,
      });

      if (!project) {
        return res.status(404).json({ message: 'Projeto nao encontrado' });
      }

      res.json(project);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao reenviar TAP';
      res.status(500).json({ message });
    }
  });

  app.post('/api/projects', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.createProject(req.body);
    res.status(201).json(project);
  });

  app.put('/api/projects/:id/setup', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const existingProject = await storage.getProject(req.params.id);
    if (!existingProject) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const updates: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(req.body, 'coordinatorId')) {
      const coordinatorId = typeof req.body.coordinatorId === 'string' ? req.body.coordinatorId.trim() : '';
      if (coordinatorId) {
        const coordinator = await storage.getUser(coordinatorId);
        if (!coordinator || !coordinator.isActive) {
          return res.status(400).json({ message: 'Coordenador inválido' });
        }
        updates.coordinatorId = coordinator.id;
      } else {
        updates.coordinatorId = null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'dailyLimitHours')) {
      const dailyLimitHours = Number.parseInt(String(req.body.dailyLimitHours), 10);
      if (!Number.isFinite(dailyLimitHours) || dailyLimitHours <= 0) {
        return res.status(400).json({ message: 'Limite diário inválido' });
      }
      updates.dailyLimitHours = dailyLimitHours;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'requiresApproval')) {
      updates.requiresApproval = Boolean(req.body.requiresApproval);
    }

    if (existingProject.setupStatus === PROJECT_SETUP_STATUS.PENDING) {
      updates.setupStatus = PROJECT_SETUP_STATUS.IN_PROGRESS;
    }

    const project = await storage.updateProject(req.params.id, updates as any);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROJECT_SETUP_UPDATED',
        title: `Setup atualizado — ${project.code}`,
        metadata: {
          projectId: project.id,
          coordinatorId: project.coordinatorId ?? null,
          dailyLimitHours: project.dailyLimitHours,
          requiresApproval: project.requiresApproval,
        },
      });
    }

    res.json(project);
  });

  app.put('/api/projects/:id', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.updateProject(req.params.id, req.body);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    res.json(project);
  });

  app.post('/api/projects/:id/setup/complete', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    if (!project.coordinatorId) {
      return res.status(400).json({ message: 'Defina o coordenador antes de concluir o setup' });
    }

    if (!project.dailyLimitHours || project.dailyLimitHours <= 0) {
      return res.status(400).json({ message: 'Defina um limite diário válido antes de concluir o setup' });
    }

    if (!PROJECT_READY_TAP_STATUSES.has(String(project.tapStatus || ''))) {
      return res.status(400).json({ message: 'Gere o TAP antes de concluir o setup' });
    }

    const userId = typeof (req as any).user?.sub === 'string' ? (req as any).user.sub : null;
    const updatedProject = await storage.updateProject(req.params.id, {
      setupStatus: PROJECT_SETUP_STATUS.COMPLETED,
      setupCompletedAt: new Date(),
      setupCompletedById: userId,
    } as any);

    if (userId) {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROJECT_SETUP_COMPLETED',
        title: `Setup concluído — ${project.code}`,
        metadata: { projectId: project.id },
      });
    }

    res.json(updatedProject);
  });

  app.post('/api/projects/:id/activate', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    if (String(project.setupStatus) !== PROJECT_SETUP_STATUS.COMPLETED) {
      return res.status(400).json({ message: 'Conclua o setup antes de iniciar o projeto' });
    }

    if (!PROJECT_READY_TAP_STATUSES.has(String(project.tapStatus || ''))) {
      return res.status(400).json({ message: 'Projeto sem TAP gerado' });
    }

    const updatedProject = await storage.updateProject(req.params.id, {
      status: 'active',
    } as any);

    const userId = typeof (req as any).user?.sub === 'string' ? (req as any).user.sub : null;
    if (userId) {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROJECT_ACTIVATED',
        title: `Projeto iniciado — ${project.code}`,
        metadata: { projectId: project.id },
      });
    }

    res.json(updatedProject);
  });

  app.delete('/api/projects/:id', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    res.status(204).send();
  });

  app.get('/api/projects/:id/stats', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const entries = await storage.getTimeEntriesByProject(req.params.id);
    const approvedHours = entries
      .filter(e => e.status === 'approved')
      .reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);
    const pendingHours = entries
      .filter(e => e.status === 'pending')
      .reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

    res.json({
      project,
      budgetHours: project.budgetHours,
      consumedHours: approvedHours,
      pendingHours,
      remainingHours: project.budgetHours - approvedHours,
    });
  });

  app.get('/api/projects/:id/time-entries', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const entries = await storage.getTimeEntriesByProject(req.params.id);
    res.json(entries);
  });

  app.post('/api/projects/time-entries', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const { projectId, collaboratorId, costCenterId, entryDate, hours, description, attachments } = req.body;

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments
          .filter((item: unknown) => item && typeof item === 'object')
          .map((item: any) => ({
            name: typeof item.name === 'string' ? item.name.trim() : '',
            objectPath: typeof item.objectPath === 'string' ? item.objectPath.trim() : '',
            contentType: typeof item.contentType === 'string' ? item.contentType.trim() : 'application/octet-stream',
            size: Number(item.size) || 0,
          }))
          .filter((item) => item.name && item.objectPath)
      : [];

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }

    const normalizedCostCenterId = typeof costCenterId === 'string' && costCenterId.trim() ? costCenterId.trim() : null;
    if (normalizedCostCenterId) {
      const costCenter = await storage.getCostCenter(normalizedCostCenterId);
      if (!costCenter || !costCenter.isActive) {
        return res.status(400).json({ message: 'Centro de custo inválido' });
      }
    }

    const dailyEntries = await storage.getTimeEntriesByCollaboratorAndDate(collaboratorId, entryDate);
    const totalDailyHours = dailyEntries.reduce((sum, e) => sum + parseFloat(String(e.hours)), 0);

    if (totalDailyHours + hours > project.dailyLimitHours) {
      return res.status(400).json({
        message: `Limite diario excedido. Atual: ${totalDailyHours}h, Limite: ${project.dailyLimitHours}h`,
      });
    }

    const entry = await storage.createTimeEntry({
      projectId,
      collaboratorId,
      costCenterId: normalizedCostCenterId,
      entryDate,
      hours: String(hours),
      description,
      attachments: normalizedAttachments,
    });

    res.status(201).json(entry);
  });

  // Admin-only consolidated dashboard (used by admin profile)
  app.get('/api/reports/dashboard', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const proposals = await storage.getAllProposals();
    const projects = await storage.getAllProjects();
    const clients = await storage.getAllClients();
    const timeEntries = await storage.getAllTimeEntries();
    const periodDays = parseDashboardPeriod(req.query.period);
    const trendBuckets = buildTrendBuckets(periodDays);
    const periodRanges = buildPeriodRanges(periodDays);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const proposalsCurrentPeriod = proposals.filter((proposal) => {
      const createdAt = toValidDate((proposal as any).createdAt);
      if (!createdAt) return false;
      return isWithinRange(createdAt, periodRanges.current);
    });

    const projectsCurrentPeriod = projects.filter((project) => {
      const createdAt = toValidDate((project as any).createdAt);
      if (!createdAt) return false;
      return isWithinRange(createdAt, periodRanges.current);
    });

    const proposalsByStatus = proposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const projectsByStatus = projectsCurrentPeriod.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const proposalsByStatusCurrentPeriod = proposalsCurrentPeriod.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const successCountPeriod = proposalsCurrentPeriod.filter((proposal) =>
      APPROVED_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status))
    ).length;
    const successCountOverall = proposals.filter((proposal) =>
      APPROVED_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status))
    ).length;

    const approvedValue = proposalsCurrentPeriod
      .filter(p => APPROVED_PROPOSAL_STATUSES.has(p.status))
      .reduce((sum, p) => sum + getProposalApprovedAmount(p), 0);

    const approvedValueTrend = buildTrendPoints(
      trendBuckets.map((bucket) => {
        return proposals
          .filter((proposal) => {
            if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
            const createdAt = toValidDate((proposal as any).createdAt);
            if (!createdAt) return false;
            return createdAt >= bucket.start && createdAt <= bucket.end;
          })
          .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);
      }),
      trendBuckets.map((bucket) => bucket.label)
    );

    const proposalCountByBucket = trendBuckets.map((bucket) => {
      return proposals.filter((proposal) => {
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return createdAt >= bucket.start && createdAt <= bucket.end;
      }).length;
    });

    const proposalCountTrend = buildTrendPoints(
      proposalCountByBucket,
      trendBuckets.map((bucket) => bucket.label)
    );

    const currentApprovedValue = proposals
      .filter((proposal) => {
        if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return isWithinRange(createdAt, periodRanges.current);
      })
      .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);

    const previousApprovedValue = proposals
      .filter((proposal) => {
        if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return isWithinRange(createdAt, periodRanges.previous);
      })
      .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);

    const funnel = {
      elaboracao: proposalsCurrentPeriod.filter((proposal) => PROPOSAL_FUNNEL_STATUS.elaboracao.has(normalizeStatus(proposal.status))).length,
      analise: proposalsCurrentPeriod.filter((proposal) => PROPOSAL_FUNNEL_STATUS.analise.has(normalizeStatus(proposal.status))).length,
      ganho: proposalsCurrentPeriod.filter((proposal) => PROPOSAL_FUNNEL_STATUS.ganho.has(normalizeStatus(proposal.status))).length,
      perdido: proposalsCurrentPeriod.filter((proposal) => PROPOSAL_FUNNEL_STATUS.perdido.has(normalizeStatus(proposal.status))).length,
    };

    const clientNameById = new Map(
      clients.map((client: any) => [
        client.id,
        String(client.nomeFantasia || client.razaoSocial || 'Cliente sem nome'),
      ])
    );

    const topClientsMap = proposalsCurrentPeriod
      .filter((proposal) => APPROVED_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status)))
      .reduce((acc, proposal: any) => {
        const clientId = String(proposal.clientId || 'unknown');
        const current = acc.get(clientId) || { approvedValue: 0, proposalsCount: 0 };
        current.approvedValue += getProposalApprovedAmount(proposal);
        current.proposalsCount += 1;
        acc.set(clientId, current);
        return acc;
      }, new Map<string, { approvedValue: number; proposalsCount: number }>());

    const topClients = Array.from(topClientsMap.entries())
      .map(([clientId, data]) => ({
        clientId,
        clientName: clientNameById.get(clientId) || 'Cliente sem nome',
        approvedValue: Number(data.approvedValue.toFixed(2)),
        proposalsCount: data.proposalsCount,
      }))
      .sort((a, b) => b.approvedValue - a.approvedValue)
      .slice(0, 5);

    const monthlyLaunchedHours = timeEntries
      .filter((entry) => {
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const monthlyApprovedHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'approved') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const monthlyPendingHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'pending') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const pendingApprovals = timeEntries.filter((entry) => entry.status === 'pending').length;
    const approvalRate = monthlyLaunchedHours > 0
      ? (monthlyApprovedHours / monthlyLaunchedHours) * 100
      : 0;

    res.json({
      proposals: {
        total: proposals.length,
        byStatus: Object.entries(proposalsByStatusCurrentPeriod).map(([status, count]) => ({ status, count })),
        success: {
          period: {
            count: successCountPeriod,
            total: proposalsCurrentPeriod.length,
            rate: proposalsCurrentPeriod.length > 0 ? (successCountPeriod / proposalsCurrentPeriod.length) * 100 : 0,
          },
          overall: {
            count: successCountOverall,
            total: proposals.length,
            rate: proposals.length > 0 ? (successCountOverall / proposals.length) * 100 : 0,
          },
        },
      },
      projects: {
        total: projectsCurrentPeriod.length,
        active: projectsCurrentPeriod.filter(p => p.status === 'active').length,
        byStatus: Object.entries(projectsByStatus).map(([status, count]) => ({ status, count })),
      },
      clients: {
        total: clients.length,
        active: clients.filter(c => c.isActive).length,
      },
      hours: {
        monthlyTotal: monthlyApprovedHours,
        launchedMonthly: monthlyLaunchedHours,
        approvedMonthly: monthlyApprovedHours,
        pendingMonthly: monthlyPendingHours,
        approvalRate,
        pendingApprovals,
      },
      financial: {
        approvedProposalsValue: approvedValue,
      },
      trends: {
        approvedValue: approvedValueTrend,
        proposalCount: proposalCountTrend,
      },
      comparisons: {
        currentApprovedValue,
        previousApprovedValue,
        approvedValueDeltaPct: calculateDeltaPercent(currentApprovedValue, previousApprovedValue),
      },
      funnel,
      topClients,
    });
  });

  // Commercial dashboard (pipeline)
  app.get('/api/dashboard/commercial', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const proposals = await storage.getAllProposals();
    const clients = await storage.getAllClients();
    const timeEntries = await storage.getAllTimeEntries();
    const periodDays = parseDashboardPeriod(req.query.period);
    const trendBuckets = buildTrendBuckets(periodDays);
    const periodRanges = buildPeriodRanges(periodDays);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const proposalsCurrentPeriod = proposals.filter((proposal) => {
      const createdAt = toValidDate((proposal as any).createdAt);
      if (!createdAt) return false;
      return isWithinRange(createdAt, periodRanges.current);
    });

    const proposalsByStatus = proposalsCurrentPeriod.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const successCountPeriod = proposalsCurrentPeriod.filter((proposal) =>
      APPROVED_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status))
    ).length;
    const successCountOverall = proposals.filter((proposal) =>
      APPROVED_PROPOSAL_STATUSES.has(normalizeStatus(proposal.status))
    ).length;

    const approvedValue = proposalsCurrentPeriod
      .filter(p => APPROVED_PROPOSAL_STATUSES.has(p.status))
      .reduce((sum, p) => sum + getProposalApprovedAmount(p), 0);

    const approvedValueTrend = buildTrendPoints(
      trendBuckets.map((bucket) => {
        return proposals
          .filter((proposal) => {
            if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
            const createdAt = toValidDate((proposal as any).createdAt);
            if (!createdAt) return false;
            return createdAt >= bucket.start && createdAt <= bucket.end;
          })
          .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);
      }),
      trendBuckets.map((bucket) => bucket.label)
    );

    const proposalCountByBucket = trendBuckets.map((bucket) => {
      return proposals.filter((proposal) => {
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return createdAt >= bucket.start && createdAt <= bucket.end;
      }).length;
    });

    const proposalCountTrend = buildTrendPoints(
      proposalCountByBucket,
      trendBuckets.map((bucket) => bucket.label)
    );

    const currentApprovedValue = proposals
      .filter((proposal) => {
        if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return isWithinRange(createdAt, periodRanges.current);
      })
      .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);

    const previousApprovedValue = proposals
      .filter((proposal) => {
        if (!APPROVED_PROPOSAL_STATUSES.has(proposal.status)) return false;
        const createdAt = toValidDate((proposal as any).createdAt);
        if (!createdAt) return false;
        return isWithinRange(createdAt, periodRanges.previous);
      })
      .reduce((sum, proposal) => sum + getProposalApprovedAmount(proposal), 0);

    const launchedMonthly = timeEntries
      .filter((entry) => {
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const approvedMonthly = timeEntries
      .filter((entry) => {
        if (entry.status !== 'approved') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const pendingMonthly = timeEntries
      .filter((entry) => {
        if (entry.status !== 'pending') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const approvalRate = launchedMonthly > 0 ? (approvedMonthly / launchedMonthly) * 100 : 0;

    res.json({
      proposals: {
        total: proposals.length,
        byStatus: Object.entries(proposalsByStatus).map(([status, count]) => ({ status, count })),
        success: {
          period: {
            count: successCountPeriod,
            total: proposalsCurrentPeriod.length,
            rate: proposalsCurrentPeriod.length > 0 ? (successCountPeriod / proposalsCurrentPeriod.length) * 100 : 0,
          },
          overall: {
            count: successCountOverall,
            total: proposals.length,
            rate: proposals.length > 0 ? (successCountOverall / proposals.length) * 100 : 0,
          },
        },
      },
      clients: {
        total: clients.length,
        active: clients.filter(c => c.isActive).length,
      },
      financial: {
        approvedProposalsValue: approvedValue,
      },
      hours: {
        launchedMonthly,
        approvedMonthly,
        pendingMonthly,
        approvalRate,
      },
      trends: {
        approvedValue: approvedValueTrend,
        proposalCount: proposalCountTrend,
      },
      comparisons: {
        currentApprovedValue,
        previousApprovedValue,
        approvedValueDeltaPct: calculateDeltaPercent(currentApprovedValue, previousApprovedValue),
      },
    });
  });

  // Projects dashboard (execution)
  app.get('/api/dashboard/projects', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const projects = await storage.getAllProjects();
    const clients = await storage.getAllClients();
    const timeEntries = await storage.getAllTimeEntries();
    const periodDays = parseDashboardPeriod(req.query.period);
    const trendBuckets = buildTrendBuckets(periodDays);
    const periodRanges = buildPeriodRanges(periodDays);

    const projectsCurrentPeriod = projects.filter((project) => {
      const createdAt = toValidDate((project as any).createdAt);
      if (!createdAt) return false;
      return isWithinRange(createdAt, periodRanges.current);
    });

    const projectsByStatus = projectsCurrentPeriod.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyLaunchedHours = timeEntries
      .filter((entry) => {
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const monthlyApprovedHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'approved') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const monthlyPendingHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'pending') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const pendingCount = timeEntries.filter(e => e.status === 'pending').length;
    const approvalRate = monthlyLaunchedHours > 0
      ? (monthlyApprovedHours / monthlyLaunchedHours) * 100
      : 0;

    const approvedHoursTrend = buildTrendPoints(
      trendBuckets.map((bucket) => {
        return timeEntries
          .filter((entry) => {
            if (entry.status !== 'approved') return false;
            const entryDate = toValidDate((entry as any).entryDate);
            if (!entryDate) return false;
            return entryDate >= bucket.start && entryDate <= bucket.end;
          })
          .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);
      }),
      trendBuckets.map((bucket) => bucket.label)
    );

    const currentApprovedHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'approved') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return isWithinRange(entryDate, periodRanges.current);
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    const previousApprovedHours = timeEntries
      .filter((entry) => {
        if (entry.status !== 'approved') return false;
        const entryDate = toValidDate((entry as any).entryDate);
        if (!entryDate) return false;
        return isWithinRange(entryDate, periodRanges.previous);
      })
      .reduce((sum, entry) => sum + parseNumericValue(entry.hours), 0);

    res.json({
      projects: {
        total: projectsCurrentPeriod.length,
        active: projectsCurrentPeriod.filter(p => p.status === 'active').length,
        byStatus: Object.entries(projectsByStatus).map(([status, count]) => ({ status, count })),
      },
      clients: {
        total: clients.length,
      },
      hours: {
        launchedMonthly: monthlyLaunchedHours,
        monthlyApprovedHours,
        approvedMonthly: monthlyApprovedHours,
        pendingMonthly: monthlyPendingHours,
        approvalRate,
        pendingCount,
      },
      trends: {
        approvedHours: approvedHoursTrend,
      },
      comparisons: {
        currentApprovedHours,
        previousApprovedHours,
        approvedHoursDeltaPct: calculateDeltaPercent(currentApprovedHours, previousApprovedHours),
      },
    });
  });

  // Proposal Categories API
  app.get('/api/proposal-categories', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const role = (req as any)?.user?.role;
    const includeInactive = role === 'admin';
    const categories = await storage.getAllProposalCategories({ includeInactive });
    res.json(categories);
  });

  app.get('/api/cost-centers', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const role = (req as any)?.user?.role;
    const includeInactive = role === 'admin';
    const costCenters = await storage.getAllCostCenters({ includeInactive });
    res.json(costCenters);
  });

  app.post('/api/cost-centers', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const isActive = req.body?.isActive;

    if (!code || !name) {
      return res.status(400).json({ message: 'Nome e sigla são obrigatórios' });
    }

    try {
      const costCenter = await storage.createCostCenter({ code, name, isActive });
      res.status(201).json(costCenter);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'Sigla já existe' });
      }
      res.status(500).json({ message: 'Erro ao criar centro de custo' });
    }
  });

  app.put('/api/cost-centers/:id', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { id } = req.params;
    const updates: Record<string, unknown> = {};

    if (req.body?.code !== undefined) {
      const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
      if (!code) {
        return res.status(400).json({ message: 'Sigla é obrigatória' });
      }
      updates.code = code;
    }

    if (req.body?.name !== undefined) {
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ message: 'Nome é obrigatório' });
      }
      updates.name = name;
    }

    if (req.body?.isActive !== undefined) {
      updates.isActive = Boolean(req.body.isActive);
    }

    try {
      const result = await storage.updateCostCenter(id, updates);
      if (!result) {
        return res.status(404).json({ message: 'Centro de custo não encontrado' });
      }
      res.json(result);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'Sigla já existe' });
      }
      res.status(500).json({ message: 'Erro ao atualizar centro de custo' });
    }
  });

  app.delete('/api/cost-centers/:id', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { id } = req.params;
    await storage.deleteCostCenter(id);
    res.status(204).send();
  });

  app.post('/api/proposal-categories', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { code, name, isActive } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Categoria é obrigatória' });
    }
    try {
      const category = await storage.createProposalCategory({ code, name, isActive });
      res.status(201).json(category);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ message: 'Código já existe' });
      }
      res.status(500).json({ message: 'Erro ao criar categoria' });
    }
  });

  app.put('/api/proposal-categories/:id', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { id } = req.params;
    const result = await storage.updateProposalCategory(id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Categoria não encontrada' });
    }
    res.json(result);
  });

  app.delete('/api/proposal-categories/:id', authenticateToken, requireRoles(['admin']), async (req, res) => {
    const { id } = req.params;
    await storage.deleteProposalCategory(id);
    res.status(204).send();
  });

  // Proposal Category Values API
  app.get('/api/proposals/:proposalId/category-values', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const values = await storage.getProposalCategoryValues(proposalId);
    res.json(values);
  });

  app.post('/api/proposals/:proposalId/category-values', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const { values } = req.body;

    if (!Array.isArray(values)) {
      return res.status(400).json({ message: 'Valores inválidos' });
    }

    const categories = await storage.getAllProposalCategories({ includeInactive: true });
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const hasInvalidCategory = values.some((value: any) => {
      const categoryId = typeof value?.categoryId === 'string' ? value.categoryId.trim() : '';
      return !categoryId || !validCategoryIds.has(categoryId);
    });

    if (hasInvalidCategory) {
      return res.status(400).json({
        message: 'Use apenas categorias cadastradas na tela de categorias.',
      });
    }

    const valuesWithProposalId = values.map((v: any) => ({
      proposalId,
      categoryId: v.categoryId,
      customName: undefined,
      value: parseFloat(v.value) || 0,
      hours: parseFloat(v.hours) || 0,
    }));

    const result = await storage.saveProposalCategoryValues(proposalId, valuesWithProposalId);

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      let proposal: any = null;
      try {
        proposal = await storage.getProposal(proposalId);
      } catch {
        proposal = null;
      }

      const code = proposal?.code ?? proposalId;
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_CATEGORY_VALUES_UPDATED',
        title: `Valores por categoria atualizados — ${code}`,
        metadata: {
          proposalId,
          code: proposal?.code ?? null,
          revision: proposal?.revision ?? null,
          valuesCount: Array.isArray(valuesWithProposalId) ? valuesWithProposalId.length : null,
        },
      });
    }

    res.json(result);
  });

  app.delete('/api/proposal-category-values/:id', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { id } = req.params;

    const deleted = await storage.deleteProposalCategoryValue(id);

    const userId = (req as any).user?.sub;
    if (deleted && typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_CATEGORY_VALUE_DELETED',
        title: 'Valor por categoria removido',
        metadata: { valueId: id },
      });
    }

    res.status(204).send();
  });

  // Proposal expenses
  app.get('/api/proposals/:proposalId/expenses', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }
    const items = await storage.getProposalExpenses(proposalId);
    const total = Number((proposal as any).expense ?? 0);
    return res.json({ items, total });
  });

  app.post('/api/proposals/:proposalId/expenses', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const value = typeof req.body?.value === 'number' ? req.body.value : Number(req.body?.value);
    const reimbursable = Boolean(req.body?.reimbursable);

    if (!description || !Number.isFinite(value)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }

    const result = await storage.createProposalExpense(proposalId, { description, value, reimbursable });

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_EXPENSE_CREATED',
        title: `Despesa adicionada — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          expenseId: result?.item?.id ?? null,
          value,
          reimbursable,
        },
      });
    }

    return res.status(201).json(result);
  });

  app.put('/api/proposals/:proposalId/expenses/:expenseId', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId, expenseId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const updates: any = {};
    if (typeof req.body?.description === 'string') updates.description = req.body.description.trim();
    if (typeof req.body?.value !== 'undefined') updates.value = typeof req.body.value === 'number' ? req.body.value : Number(req.body.value);
    if (typeof req.body?.reimbursable === 'boolean') updates.reimbursable = req.body.reimbursable;

    if (updates.description !== undefined && !updates.description) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (updates.value !== undefined && !Number.isFinite(updates.value)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }

    const result = await storage.updateProposalExpense(proposalId, expenseId, updates);
    if (!result) {
      return res.status(404).json({ message: 'Despesa nao encontrada' });
    }

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      const fieldsChanged = Object.keys(updates ?? {});
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_EXPENSE_UPDATED',
        title: `Despesa atualizada — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          expenseId,
          fieldsChanged,
        },
      });
    }

    return res.json(result);
  });

  app.delete('/api/proposals/:proposalId/expenses/:expenseId', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId, expenseId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const result = await storage.deleteProposalExpense(proposalId, expenseId);
    if (!result) {
      return res.status(404).json({ message: 'Despesa nao encontrada' });
    }

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_EXPENSE_DELETED',
        title: `Despesa removida — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          expenseId,
        },
      });
    }

    return res.json(result);
  });

  // Proposal additives (aditivos)
  app.get('/api/proposals/:proposalId/additives', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }
    const items = await storage.getProposalAdditives(proposalId);
    const total = Number((proposal as any).additiveValue ?? 0);
    return res.json({ items, total });
  });

  app.post('/api/proposals/:proposalId/additives', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const termMonthsRaw = req.body?.termMonths;
    const termMonths = termMonthsRaw === null || typeof termMonthsRaw === 'undefined' || termMonthsRaw === ''
      ? null
      : Number(termMonthsRaw);

    const subcontractValue = typeof req.body?.subcontractValue === 'number'
      ? req.body.subcontractValue
      : Number(req.body?.subcontractValue ?? 0);
    const mobilizationValue = typeof req.body?.mobilizationValue === 'number'
      ? req.body.mobilizationValue
      : Number(req.body?.mobilizationValue ?? 0);
    const readjustValue = typeof req.body?.readjustValue === 'number'
      ? req.body.readjustValue
      : Number(req.body?.readjustValue ?? 0);

    if ((termMonths !== null && !Number.isFinite(termMonths)) || !Number.isFinite(subcontractValue) || !Number.isFinite(mobilizationValue) || !Number.isFinite(readjustValue)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (termMonths !== null && termMonths < 0) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }

    const result = await storage.createProposalAdditive(proposalId, {
      termMonths,
      subcontractValue,
      mobilizationValue,
      readjustValue,
    });

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_ADDITIVE_CREATED',
        title: `Aditivo adicionado — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          additiveId: result?.item?.id ?? null,
          termMonths,
        },
      });
    }

    return res.status(201).json(result);
  });

  app.put('/api/proposals/:proposalId/additives/:additiveId', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId, additiveId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const updates: any = {};
    if (typeof req.body?.termMonths !== 'undefined') {
      updates.termMonths = req.body.termMonths === null || req.body.termMonths === '' ? null : Number(req.body.termMonths);
    }
    if (typeof req.body?.subcontractValue !== 'undefined') {
      updates.subcontractValue = typeof req.body.subcontractValue === 'number' ? req.body.subcontractValue : Number(req.body.subcontractValue);
    }
    if (typeof req.body?.mobilizationValue !== 'undefined') {
      updates.mobilizationValue = typeof req.body.mobilizationValue === 'number' ? req.body.mobilizationValue : Number(req.body.mobilizationValue);
    }
    if (typeof req.body?.readjustValue !== 'undefined') {
      updates.readjustValue = typeof req.body.readjustValue === 'number' ? req.body.readjustValue : Number(req.body.readjustValue);
    }

    if (updates.termMonths !== undefined && updates.termMonths !== null && !Number.isFinite(updates.termMonths)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (updates.termMonths !== undefined && updates.termMonths !== null && updates.termMonths < 0) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (updates.subcontractValue !== undefined && !Number.isFinite(updates.subcontractValue)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (updates.mobilizationValue !== undefined && !Number.isFinite(updates.mobilizationValue)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }
    if (updates.readjustValue !== undefined && !Number.isFinite(updates.readjustValue)) {
      return res.status(400).json({ message: 'Dados invalidos' });
    }

    const result = await storage.updateProposalAdditive(proposalId, additiveId, updates);
    if (!result) {
      return res.status(404).json({ message: 'Aditivo nao encontrado' });
    }

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      const fieldsChanged = Object.keys(updates ?? {});
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_ADDITIVE_UPDATED',
        title: `Aditivo atualizado — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          additiveId,
          fieldsChanged,
        },
      });
    }

    return res.json(result);
  });

  app.delete('/api/proposals/:proposalId/additives/:additiveId', authenticateToken, requireRoles(['commercial', 'admin']), async (req, res) => {
    const { proposalId, additiveId } = req.params;
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    const result = await storage.deleteProposalAdditive(proposalId, additiveId);
    if (!result) {
      return res.status(404).json({ message: 'Aditivo nao encontrado' });
    }

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_ADDITIVE_DELETED',
        title: `Aditivo removido — ${proposal.code}`,
        metadata: {
          proposalId,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          additiveId,
        },
      });
    }

    return res.json(result);
  });

  // Proposal Favorites API
  app.get('/api/proposal-favorites', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const userId = (req as any).user.sub;
    const favoriteIds = await storage.getUserFavoriteProposals(userId);
    res.json(favoriteIds);
  });

  app.post('/api/proposal-favorites/:proposalId', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const userId = (req as any).user.sub;
    const { proposalId } = req.params;
    await storage.addFavoriteProposal(userId, proposalId);
    res.status(201).json({ success: true });
  });

  app.delete('/api/proposal-favorites/:proposalId', authenticateToken, requireRoles(['commercial']), async (req, res) => {
    const userId = (req as any).user.sub;
    const { proposalId } = req.params;
    await storage.removeFavoriteProposal(userId, proposalId);
    res.status(204).send();
  });

  return httpServer;
}
