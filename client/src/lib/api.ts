const API_BASE = '/api';

async function getToken(): Promise<string | null> {
  return localStorage.getItem('token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  width?: string;
  category: 'basic' | 'classification' | 'values' | 'dates' | 'people';
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  language: string;
  proposalColumns?: ColumnConfig[] | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'commercial' | 'projects';
  photoUrl?: string;
  isActive?: boolean;
  professionalCategoryId?: string | null;
  emailGroup?: string | null;
  receivesEmails?: boolean;
  preferences?: UserPreferences;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: User['role'];
  photoUrl?: string;
}

export interface UserOption {
  id: string;
  name: string;
  role: User['role'];
  isActive: boolean;
}

export type UserActivityCategory = 'security' | 'profile' | 'preferences' | 'system';

export interface UserActivity {
  id: string;
  userId: string;
  category: UserActivityCategory;
  action: string;
  title: string;
  metadata?: any;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface UserActivitiesResponse {
  items: UserActivity[];
  nextCursor: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export const authApi = {
  login: (identifier: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { identifier, password }),
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, name }),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put<User>('/auth/profile', data),
  listUsers: () => api.get<UserSummary[]>('/auth/users'),
  getActivities: (params?: {
    userId?: string;
    category?: UserActivityCategory;
    limit?: number;
    cursor?: string;
  }) => {
    const search = new URLSearchParams();
    if (params?.userId) search.set('userId', params.userId);
    if (params?.category) search.set('category', params.category);
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    const qs = search.toString();
    return api.get<UserActivitiesResponse>(`/auth/activities${qs ? `?${qs}` : ''}`);
  },
  uploadPhoto: async (file: File): Promise<User> => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('photo', file);
    
    const response = await fetch('/api/auth/upload-photo', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new Error(error.message || 'Upload failed');
    }
    
    return response.json();
  },
  getPreferences: () => api.get<UserPreferences>('/auth/preferences'),
  updatePreferences: (data: Partial<UserPreferences>) =>
    api.put<UserPreferences>('/auth/preferences', data),
};

export const usersApi = {
  list: () => api.get<UserOption[]>('/users'),
};

export interface Client {
  id: string;
  // Dados principais
  cnpj?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  pais?: string;
  // Endereço
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  // Contato Comercial
  nomeComercial?: string;
  emailComercial?: string;
  telefoneComercial?: string;
  // Contato Medição
  nomeMedicao?: string;
  emailMedicao?: string;
  telefoneMedicao?: string;
  // Contato Técnico
  nomeTecnico?: string;
  emailTecnico?: string;
  telefoneTecnico?: string;
  // Status
  isActive: boolean;
}

export interface Proposal {
  id: string;
  code: string;
  revision: number;
  title: string;
  description?: string | null;
  clientId: string;
  client?: Client;
  coordinatorId?: string | null;
  coordinatorName?: string | null;
  type: string;
  status: string;
  totalValue: number;
  estimatedHours: number;
  expectedStartDate?: string | null;
  expectedEndDate?: string | null;
  sentDate?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  // Campos adicionais do sistema legado
  activityType?: string | null;
  umbrellaRef?: string | null;
  utility?: string | null;
  sentByName?: string | null;
  specialist?: string | null;
  mainType?: string | null;
  quantity?: number | null;
  hourJustification?: number | null;
  rehabilitation?: number | null;
  subcontracted?: number | null;
  paymentBook?: number | null;
  expense?: number | null;
  additiveValue?: number | null;
  resource?: number | null;
  workOrders?: string | null;
  // Novos campos do sistema legado
  contractCode?: string | null;
  deliveryDate?: string | null;
  dueDate?: string | null;
  duration?: string | null;
  expectation?: string | null;
  termMonths?: number | null;
  hours?: number | null;
  riskAssessment?: string | null;
  maintenanceNum?: number | null;
  acquisitionMargin?: string | null;
  anfibex?: string | null;
  discount?: string | null;
  proposalOrigin?: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  clientId: string;
  client?: Client;
  status: string;
  startDate?: string;
  endDate?: string;
  budgetHours: number;
  budgetValue: number;
  dailyLimitHours?: number;
  requiresApproval?: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  collaboratorId: string;
  entryDate: string;
  hours: number;
  description?: string;
  status: string;
}

export interface ProposalCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface DashboardMetrics {
  proposals: { total: number; byStatus: any[] };
  projects: { total: number; active: number; byStatus: any[] };
  clients: { total: number; active: number };
  hours: { monthlyTotal: number; pendingApprovals: number };
  financial: { approvedProposalsValue: number };
}

export interface CommercialDashboardMetrics {
  proposals: { total: number; byStatus: any[] };
  clients: { total: number; active: number };
  financial: { approvedProposalsValue: number };
}

export interface ProjectsDashboardMetrics {
  projects: { total: number; active: number; byStatus: any[] };
  clients: { total: number };
  hours: { monthlyApprovedHours: number; pendingCount: number };
}

export const clientsApi = {
  getAll: () => api.get<Client[]>('/clients'),
  getOne: (id: string) => api.get<Client>(`/clients/${id}`),
  create: (data: Partial<Client>) => api.post<Client>('/clients', data),
  update: (id: string, data: Partial<Client>) => api.put<Client>(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
};

export const proposalsApi = {
  getAll: () => api.get<Proposal[]>('/proposals'),
  getOne: (id: string) => api.get<Proposal>(`/proposals/${id}`),
  create: (data: Partial<Proposal>) => api.post<Proposal>('/proposals', data),
  update: (id: string, data: Partial<Proposal>) => api.put<Proposal>(`/proposals/${id}`, data),
  delete: (id: string) => api.delete(`/proposals/${id}`),
  convert: (proposalId: string) => api.post<Project>('/proposals/convert', { proposalId }),
};

export const projectsApi = {
  getAll: () => api.get<Project[]>('/projects'),
  getOne: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getStats: (id: string) => api.get<any>(`/projects/${id}/stats`),
  getTimeEntries: (id: string) => api.get<TimeEntry[]>(`/projects/${id}/time-entries`),
  createTimeEntry: (data: Partial<TimeEntry>) => api.post<TimeEntry>('/projects/time-entries', data),
};

export const reportsApi = {
  getDashboard: () => api.get<DashboardMetrics>('/reports/dashboard'),
  getHours: (startDate: string, endDate: string) =>
    api.get<any>(`/reports/hours?startDate=${startDate}&endDate=${endDate}`),
  getProposals: () => api.get<any>('/reports/proposals'),
  getProjects: () => api.get<any>('/reports/projects'),
  getClients: () => api.get<any>('/reports/clients'),
};

export const dashboardApi = {
  getCommercial: () => api.get<CommercialDashboardMetrics>('/dashboard/commercial'),
  getProjects: () => api.get<ProjectsDashboardMetrics>('/dashboard/projects'),
};

export const favoritesApi = {
  getAll: () => api.get<string[]>('/proposal-favorites'),
  add: (proposalId: string) => api.post<{ success: boolean }>(`/proposal-favorites/${proposalId}`),
  remove: (proposalId: string) => api.delete(`/proposal-favorites/${proposalId}`),
};

export const proposalCategoriesApi = {
  getAll: () => api.get<ProposalCategory[]>('/proposal-categories'),
  create: (data: { name: string; isActive?: boolean; code?: string }) =>
    api.post<ProposalCategory>('/proposal-categories', data),
  update: (id: string, data: Partial<ProposalCategory>) =>
    api.put<ProposalCategory>(`/proposal-categories/${id}`, data),
  delete: (id: string) => api.delete(`/proposal-categories/${id}`),
};
