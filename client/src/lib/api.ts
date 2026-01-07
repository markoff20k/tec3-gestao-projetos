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

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'coordinator' | 'commercial' | 'user';
  photoUrl?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, name }),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (data: { name?: string; email?: string }) =>
    api.put<User>('/auth/profile', data),
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
};

export interface Client {
  id: string;
  name: string;
  tradeName?: string;
  document?: string;
  email?: string;
  phone?: string;
  segment?: string;
  isActive: boolean;
}

export interface Proposal {
  id: string;
  code: string;
  title: string;
  description?: string;
  clientId: string;
  client?: Client;
  type: string;
  status: string;
  totalValue: number;
  estimatedHours: number;
  createdAt: string;
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

export interface DashboardMetrics {
  proposals: { total: number; byStatus: any[] };
  projects: { total: number; active: number; byStatus: any[] };
  clients: { total: number; active: number };
  hours: { monthlyTotal: number; pendingApprovals: number };
  financial: { approvedProposalsValue: number };
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
