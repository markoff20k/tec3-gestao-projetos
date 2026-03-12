import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ProposalStatus, TimeEntryStatus } from "@shared/schema";
import { authenticateViaLdap } from "./ldap";

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
  em_elaboracao: ['em_analise', 'cancelada'],
  em_analise: ['em_elaboracao', 'com_sucesso', 'sucesso_aditivo', 'nao_sucesso', 'cancelada', 'declinio'],
  com_sucesso: [],
  sucesso_aditivo: [],
  nao_sucesso: ['em_elaboracao'],
  cancelada: [],
  declinio: ['em_elaboracao'],

  // Backward-compatibility for old statuses while deployments/migrations roll out
  draft: ['em_analise', 'cancelada'],
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

type DashboardPeriodDays = 30 | 90 | 180;

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
  if (normalized === '30d' || normalized === '30') return 30;
  if (normalized === '180d' || normalized === '180') return 180;
  return 90;
}

function toValidDate(value: unknown): Date | null {
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildTrendBuckets(periodDays: DashboardPeriodDays, now = new Date()): TrendBucket[] {
  if (periodDays === 30) {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    return Array.from({ length: 4 }).map((_, index) => {
      const end = new Date(now.getTime() - weekMs * (3 - index));
      const start = new Date(end.getTime() - weekMs + 1);
      return {
        label: `S${index + 1}`,
        start,
        end,
      };
    });
  }

  const monthCount = periodDays === 90 ? 3 : 6;
  return Array.from({ length: monthCount }).map((_, index) => {
    const cursor = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1);
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      label: monthCount === 3 ? `M-${monthCount - 1 - index}` : `M-${monthCount - 1 - index}`,
      start,
      end,
    };
  });
}

function buildTrendPoints(values: number[], labels: string[]) {
  const average = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return values.map((value, index) => ({
    label: labels[index],
    atual: Number(value.toFixed(2)),
    meta: Number(Math.max(value * 1.08, average * 1.03).toFixed(2)),
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
    const normalizedRole: unknown = String((dbUser as any).role).toLowerCase() === 'owner'
      ? 'admin'
      : (dbUser as any).role;

    if (!isRole(normalizedRole)) {
      return res.status(403).json({ message: 'Perfil inválido' });
    }

    (req as any).user = {
      sub: dbUser.id,
      email: dbUser.email,
      role: normalizedRole,
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

        const token = jwt.sign(
          { sub: user.id, email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRES_SECONDS }
        );

        return res.json({
          accessToken: token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
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

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_SECONDS }
    );

      res.json({
        accessToken: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
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

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_SECONDS }
    );

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl,
      },
    });
  });

  app.get('/api/auth/me', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const [user, profileSummary] = await Promise.all([
      storage.getUser(userId),
      storage.getUserProfileSummary(userId),
    ]);
    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
    });
  });

  app.put('/api/auth/preferences', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const { theme, sidebarCollapsed, language, proposalColumns, toastPosition, notificationsEnabled } = req.body;
    
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

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({
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

    const updated = await storage.updateUser(userId, updates);
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

      res.json(proposal);
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

      if (['com_sucesso', 'sucesso_aditivo', 'approved', 'converted'].includes(existing.status)) {
        return res.status(400).json({
          message: 'Exclusão não permitida. Existe um ou mais valor por categoria vinculado a este item.',
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

    const allowedStatuses = new Set<string>([
      'com_sucesso',
      'sucesso_aditivo',

      // Backward compatibility
      'approved',
    ]);

    if (!allowedStatuses.has(proposal.status)) {
      return res.status(400).json({ message: 'Apenas propostas com sucesso podem ser convertidas' });
    }

    const project = await storage.createProject({
      name: projectName || proposal.title,
      description: proposal.description,
      clientId: proposal.clientId,
      coordinatorId: proposal.coordinatorId,
      startDate: startDate || proposal.expectedStartDate,
      endDate: proposal.expectedEndDate,
      budgetHours: proposal.estimatedHours,
      budgetValue: proposal.totalValue,
    });

    await storage.updateProposal(proposalId, {
      ...(proposal.status === 'approved' ? { status: 'com_sucesso' } : {}),
      projectId: project.id,
    });

    const userId = (req as any).user?.sub;
    if (typeof userId === 'string') {
      await safeCreateUserActivity(req, userId, {
        category: 'system',
        action: 'PROPOSAL_CONVERTED',
        title: `Proposta convertida em projeto — ${proposal.code}`,
        metadata: {
          proposalId: proposal.id,
          code: proposal.code,
          revision: (proposal as any).revision ?? null,
          projectId: project.id,
          projectCode: (project as any).code ?? null,
        },
      });
    }

    res.status(201).json(project);
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

  app.post('/api/projects', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.createProject(req.body);
    res.status(201).json(project);
  });

  app.put('/api/projects/:id', authenticateToken, requireRoles(['projects']), async (req, res) => {
    const project = await storage.updateProject(req.params.id, req.body);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    res.json(project);
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
    const { projectId, collaboratorId, entryDate, hours, description } = req.body;

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
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
      entryDate,
      hours: String(hours),
      description,
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

    const proposalsByStatus = proposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const projectsByStatus = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const approvedValue = proposals
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
      elaboracao: proposals.filter((proposal) => PROPOSAL_FUNNEL_STATUS.elaboracao.has(normalizeStatus(proposal.status))).length,
      analise: proposals.filter((proposal) => PROPOSAL_FUNNEL_STATUS.analise.has(normalizeStatus(proposal.status))).length,
      ganho: proposals.filter((proposal) => PROPOSAL_FUNNEL_STATUS.ganho.has(normalizeStatus(proposal.status))).length,
      perdido: proposals.filter((proposal) => PROPOSAL_FUNNEL_STATUS.perdido.has(normalizeStatus(proposal.status))).length,
    };

    const clientNameById = new Map(
      clients.map((client: any) => [
        client.id,
        String(client.nomeFantasia || client.razaoSocial || 'Cliente sem nome'),
      ])
    );

    const topClientsMap = proposals
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
        byStatus: Object.entries(proposalsByStatus).map(([status, count]) => ({ status, count })),
      },
      projects: {
        total: projects.length,
        active: projects.filter(p => p.status === 'active').length,
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

    const proposalsByStatus = proposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const approvedValue = proposals
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

    const projectsByStatus = projects.reduce((acc, p) => {
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
        total: projects.length,
        active: projects.filter(p => p.status === 'active').length,
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

    const valuesWithProposalId = values.map((v: any) => ({
      proposalId,
      categoryId: v.categoryId || null,
      customName: v.categoryName || v.customName || null,
      value: parseFloat(v.value) || 0,
      hours: parseInt(v.hours) || 0,
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
