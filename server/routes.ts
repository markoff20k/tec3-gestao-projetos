import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ProposalStatus, TimeEntryStatus } from "@shared/schema";

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  }),
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

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  'draft': ['in_review', 'cancelled'],
  'in_review': ['draft', 'sent', 'cancelled'],
  'sent': ['negotiating', 'approved', 'rejected', 'cancelled'],
  'negotiating': ['sent', 'approved', 'rejected', 'cancelled'],
  'approved': ['converted'],
  'rejected': ['draft'],
  'cancelled': [],
  'converted': [],
};

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as any).user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: 'Invalid token' });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    const user = await storage.getUserByEmail(email);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Credenciais invalidas' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Credenciais invalidas' });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, role } = req.body;
    
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email ja cadastrado' });
    }

    const user = await storage.createUser({
      email,
      password,
      name,
      role: role || 'user',
      isActive: true,
    });

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  app.get('/api/auth/me', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      photoUrl: user.photoUrl,
      preferences: {
        theme: user.theme || 'light',
        sidebarCollapsed: user.sidebarCollapsed || false,
        language: user.language || 'pt-BR',
      },
    });
  });

  app.get('/api/auth/preferences', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }
    res.json({
      theme: user.theme || 'light',
      sidebarCollapsed: user.sidebarCollapsed || false,
      language: user.language || 'pt-BR',
      proposalColumns: user.proposalColumns || null,
    });
  });

  app.put('/api/auth/preferences', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const { theme, sidebarCollapsed, language, proposalColumns } = req.body;
    
    const updateData: any = {};
    if (theme !== undefined) updateData.theme = theme;
    if (sidebarCollapsed !== undefined) updateData.sidebarCollapsed = sidebarCollapsed;
    if (language !== undefined) updateData.language = language;
    if (proposalColumns !== undefined) updateData.proposalColumns = proposalColumns;
    
    const user = await storage.updateUser(userId, updateData);
    if (!user) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }
    res.json({
      theme: user.theme || 'light',
      sidebarCollapsed: user.sidebarCollapsed || false,
      language: user.language || 'pt-BR',
      proposalColumns: user.proposalColumns || null,
    });
  });

  app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    const userId = (req as any).user.sub;
    const { name, email } = req.body;
    
    const user = await storage.updateUser(userId, { name, email });
    if (!user) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
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

    const photoUrl = `/uploads/${req.file.filename}`;
    const user = await storage.updateUser(userId, { photoUrl });
    
    if (!user) {
      return res.status(404).json({ message: 'Usuario nao encontrado' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      photoUrl: user.photoUrl,
    });
  });

  app.use('/uploads', express.static(uploadsDir));

  app.get('/api/auth/users', authenticateToken, async (req, res) => {
    const userRole = (req as any).user.role;
    if (userRole !== 'owner') {
      return res.status(403).json({ message: 'Acesso nao autorizado' });
    }
    const users = await storage.getAllUsers();
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
    })));
  });

  app.get('/api/clients', authenticateToken, async (_req, res) => {
    const clients = await storage.getAllClients();
    res.json(clients);
  });

  app.get('/api/clients/:id', authenticateToken, async (req, res) => {
    const client = await storage.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.json(client);
  });

  app.post('/api/clients', authenticateToken, async (req, res) => {
    const client = await storage.createClient(req.body);
    res.status(201).json(client);
  });

  app.put('/api/clients/:id', authenticateToken, async (req, res) => {
    const client = await storage.updateClient(req.params.id, req.body);
    if (!client) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.json(client);
  });

  app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    const deleted = await storage.deleteClient(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Cliente nao encontrado' });
    }
    res.status(204).send();
  });

  app.get('/api/proposals', authenticateToken, async (_req, res) => {
    const proposals = await storage.getAllProposals();
    const clients = await storage.getAllClients();
    const clientMap = new Map(clients.map(c => [c.id, c]));
    
    const enriched = proposals.map(p => ({
      ...p,
      client: clientMap.get(p.clientId),
    }));
    res.json(enriched);
  });

  app.get('/api/proposals/:id', authenticateToken, async (req, res) => {
    const proposal = await storage.getProposal(req.params.id);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }
    const client = await storage.getClient(proposal.clientId);
    res.json({ ...proposal, client });
  });

  app.post('/api/proposals', authenticateToken, async (req, res) => {
    const proposal = await storage.createProposal(req.body);
    res.status(201).json(proposal);
  });

  app.put('/api/proposals/:id', authenticateToken, async (req, res) => {
    const existing = await storage.getProposal(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
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
    res.json(proposal);
  });

  app.delete('/api/proposals/:id', authenticateToken, async (req, res) => {
    const deleted = await storage.deleteProposal(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }
    res.status(204).send();
  });

  app.post('/api/proposals/convert', authenticateToken, async (req, res) => {
    const { proposalId, projectName, startDate } = req.body;
    
    const proposal = await storage.getProposal(proposalId);
    if (!proposal) {
      return res.status(404).json({ message: 'Proposta nao encontrada' });
    }

    if (proposal.status === 'converted') {
      return res.status(400).json({ message: 'Proposta ja convertida em projeto' });
    }

    if (proposal.status !== 'approved') {
      return res.status(400).json({ message: 'Apenas propostas aprovadas podem ser convertidas' });
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
      status: 'converted',
      projectId: project.id,
    });

    res.status(201).json(project);
  });

  app.get('/api/projects', authenticateToken, async (_req, res) => {
    const projects = await storage.getAllProjects();
    const clients = await storage.getAllClients();
    const clientMap = new Map(clients.map(c => [c.id, c]));
    
    const enriched = projects.map(p => ({
      ...p,
      client: clientMap.get(p.clientId),
    }));
    res.json(enriched);
  });

  app.get('/api/projects/:id', authenticateToken, async (req, res) => {
    const project = await storage.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    const client = await storage.getClient(project.clientId);
    res.json({ ...project, client });
  });

  app.post('/api/projects', authenticateToken, async (req, res) => {
    const project = await storage.createProject(req.body);
    res.status(201).json(project);
  });

  app.put('/api/projects/:id', authenticateToken, async (req, res) => {
    const project = await storage.updateProject(req.params.id, req.body);
    if (!project) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    res.json(project);
  });

  app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    const deleted = await storage.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Projeto nao encontrado' });
    }
    res.status(204).send();
  });

  app.get('/api/projects/:id/stats', authenticateToken, async (req, res) => {
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

  app.get('/api/projects/:id/time-entries', authenticateToken, async (req, res) => {
    const entries = await storage.getTimeEntriesByProject(req.params.id);
    res.json(entries);
  });

  app.post('/api/projects/time-entries', authenticateToken, async (req, res) => {
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

  app.get('/api/reports/dashboard', authenticateToken, async (_req, res) => {
    const proposals = await storage.getAllProposals();
    const projects = await storage.getAllProjects();
    const clients = await storage.getAllClients();

    const proposalsByStatus = proposals.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const projectsByStatus = projects.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const approvedValue = proposals
      .filter(p => p.status === 'approved' || p.status === 'converted')
      .reduce((sum, p) => sum + parseFloat(String(p.totalValue || 0)), 0);

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
        monthlyTotal: 0,
        pendingApprovals: 0,
      },
      financial: {
        approvedProposalsValue: approvedValue,
      },
    });
  });

  return httpServer;
}
