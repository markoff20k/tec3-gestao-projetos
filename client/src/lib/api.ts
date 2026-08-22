const API_BASE = '/api';
let isRedirectingToLogin = false;
const LAST_LOGIN_IDENTIFIER_KEY = 'lastLoginIdentifier';
const SESSION_EXPIRED_PREFILL_KEY = 'sessionExpiredLoginIdentifier';

function shouldHandleSessionExpiration(params: {
  endpoint: string;
  status: number;
  message: string;
  hasToken: boolean;
}): boolean {
  const { endpoint, status, message, hasToken } = params;
  if (!hasToken) return false;
  if (endpoint === '/auth/login') return false;
  if (![401, 403].includes(status)) return false;

  const normalizedMessage = String(message || '').toLowerCase();
  const tokenError =
    normalizedMessage.includes('token inválido') ||
    normalizedMessage.includes('token invalido') ||
    normalizedMessage.includes('token obrigatório') ||
    normalizedMessage.includes('token obrigatorio') ||
    normalizedMessage.includes('credenciais inválidas') ||
    normalizedMessage.includes('credenciais invalidas');

  return tokenError;
}

function redirectToLoginWithSessionExpiredReason(): void {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;

  const lastIdentifier = localStorage.getItem(LAST_LOGIN_IDENTIFIER_KEY);
  if (lastIdentifier) {
    localStorage.setItem(SESSION_EXPIRED_PREFILL_KEY, lastIdentifier);
  }

  localStorage.removeItem('token');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tec3:session-expired'));
  }
}

async function getToken(): Promise<string | null> {
  return localStorage.getItem('token');
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

function createAbortSignal(params: {
  timeoutMs?: number;
  externalSignal?: AbortSignal;
}): { signal?: AbortSignal; clear: () => void } {
  const { timeoutMs, externalSignal } = params;
  if (!timeoutMs && !externalSignal) {
    return { signal: externalSignal, clear: () => {} };
  }

  const controller = new AbortController();
  let timeoutId: number | null = null;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  if (timeoutMs && timeoutMs > 0) {
    timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    clear: () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

async function request<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const token = await getToken();
  const { timeoutMs, signal: externalSignal, ...requestOptions } = options;
  const abort = createAbortSignal({ timeoutMs, externalSignal: externalSignal ?? undefined });

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...requestOptions.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...requestOptions,
      headers,
      signal: abort.signal,
    });
  } catch (error) {
    abort.clear();
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A operação excedeu o tempo limite. Tente novamente.');
    }
    throw error;
  }

  abort.clear();

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    const message = error.message || 'Request failed';

    if (
      shouldHandleSessionExpiration({
        endpoint,
        status: response.status,
        message,
        hasToken: Boolean(token),
      })
    ) {
      redirectToLoginWithSessionExpiredReason();
    }

    throw new Error(message);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function requestBlob(endpoint: string, options: RequestInit = {}): Promise<Blob> {
  const token = await getToken();
  const { timeoutMs, signal: externalSignal, ...requestOptions } = options as ApiRequestOptions;
  const abort = createAbortSignal({ timeoutMs, externalSignal: externalSignal ?? undefined });
  const headers: HeadersInit = {
    ...requestOptions.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...requestOptions,
      headers,
      signal: abort.signal,
    });
  } catch (error) {
    abort.clear();
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('A operação excedeu o tempo limite. Tente novamente.');
    }
    throw error;
  }

  abort.clear();

  if (!response.ok) {
    const jsonError = await response.json().catch(() => null as any);
    const message = jsonError?.message || 'Request failed';

    if (
      shouldHandleSessionExpiration({
        endpoint,
        status: response.status,
        message,
        hasToken: Boolean(token),
      })
    ) {
      redirectToLoginWithSessionExpiredReason();
    }

    throw new Error(message);
  }

  return response.blob();
}

export const api = {
  get: <T>(endpoint: string, options?: ApiRequestOptions) => request<T>(endpoint, { ...options, method: 'GET' }),
  getBlob: (endpoint: string, options?: ApiRequestOptions) => requestBlob(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
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
  notificationsEnabled?: boolean;
  toastPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  headerShortcutPath?: string | null;
  headerShortcutPaths?: string[] | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'commercial' | 'projects';
  photoUrl?: string;
  isActive?: boolean;
  accountSummary?: {
    hoursThisMonth: number;
    approvedHoursThisMonth: number;
    status: 'active' | 'inactive';
    memberSince: string | null;
    lastLoginAt: string | null;
  };
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

export const usersApi = {
  list: () => api.get<UserOption[]>('/users'),
  getAllOptions: () => api.get<UserOption[]>('/users'),
};

export type UserActivityCategory = 'security' | 'profile' | 'preferences' | 'system';
export type NotificationType = 'proposal_due_soon' | 'project_tap_email_failed' | 'project_setup_completed' | 'time_entry_approved' | 'time_entry_rejected';

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

export interface EntityActivity extends UserActivity {
  actorName: string | null;
}

export interface UserNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: any;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotificationsResponse {
  items: UserNotification[];
  nextCursor: string | null;
  unreadCount: number;
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
  getNotifications: (params?: { limit?: number; cursor?: string; unreadOnly?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.cursor) search.set('cursor', params.cursor);
    if (typeof params?.unreadOnly === 'boolean') search.set('unreadOnly', String(params.unreadOnly));
    const qs = search.toString();
    return api.get<UserNotificationsResponse>(`/auth/notifications${qs ? `?${qs}` : ''}`);
  },
  markNotificationRead: (notificationId: string) =>
    api.put<UserNotification>(`/auth/notifications/${notificationId}/read`),
  markAllNotificationsRead: () =>
    api.put<{ updatedCount: number }>('/auth/notifications/read-all'),
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
  projectId?: string | null;
  tapPayload?: ProposalTapDraft | null;
  tapStatus?: 'not_started' | 'draft' | 'generated' | 'sent' | 'failed';
  tapGeneratedAt?: string | null;
  tapGeneratedById?: string | null;
  tapSentAt?: string | null;
  tapLastEmailError?: string | null;
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

export interface ProposalTapAttachment {
  id: string;
  title: string;
  description?: string | null;
  name: string;
  objectPath: string;
  contentType?: string | null;
  size?: number | null;
}

export interface ProposalTapDraft {
  projectName: string;
  executiveSummary: string;
  scopeHtml: string;
  objectives: string;
  deliverables: string;
  premises: string;
  exclusions: string;
  stakeholders: string;
  reimbursableByClient?: 'sim' | 'nao';
  mobilityForecast?: 'sim' | 'nao';
  mobilityForecastDetails?: string;
  reimbursableExpensesForecast?: 'sim' | 'nao';
  reimbursableExpensesForecastDetails?: string;
  subcontractForecast?: 'sim' | 'nao';
  subcontractForecastDetails?: string;
  projectAnalystId?: string | null;
  projectAnalystName?: string | null;
  additiveProjectId?: string | null;
  projectCoordinatorId?: string | null;
  projectCoordinatorName?: string | null;
  notes: string;
  startDate?: string | null;
  endDate?: string | null;
  budgetHours: number;
  budgetValue: number;
  attachments: ProposalTapAttachment[];
}

export interface ProposalTapGenerateResponse {
  proposal: Proposal;
  project: Project;
  isAdditive?: boolean;
}

export interface ProposalExpenseItem {
  id: string;
  proposalId: string;
  description: string;
  value: number;
  reimbursable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalExpensesResponse {
  items: ProposalExpenseItem[];
  total: number;
}

export const proposalExpensesApi = {
  list: (proposalId: string) =>
    api.get<ProposalExpensesResponse>(`/proposals/${proposalId}/expenses`),
  create: (
    proposalId: string,
    data: { description: string; value: number; reimbursable?: boolean }
  ) => api.post<{ item: ProposalExpenseItem; total: number }>(`/proposals/${proposalId}/expenses`, data),
  update: (
    proposalId: string,
    expenseId: string,
    data: Partial<{ description: string; value: number; reimbursable: boolean }>
  ) =>
    api.put<{ item: ProposalExpenseItem; total: number }>(
      `/proposals/${proposalId}/expenses/${expenseId}`,
      data
    ),
  delete: (proposalId: string, expenseId: string) =>
    api.delete<{ total: number }>(`/proposals/${proposalId}/expenses/${expenseId}`),
};

export interface ProposalAdditiveItem {
  id: string;
  proposalId: string;
  termMonths: number | null;
  subcontractValue: number;
  mobilizationValue: number;
  readjustValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalAdditivesResponse {
  items: ProposalAdditiveItem[];
  total: number;
}

export const proposalAdditivesApi = {
  list: (proposalId: string) => api.get<ProposalAdditivesResponse>(`/proposals/${proposalId}/additives`),
  create: (
    proposalId: string,
    data: { termMonths?: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }
  ) => api.post<{ item: ProposalAdditiveItem; total: number }>(`/proposals/${proposalId}/additives`, data),
  update: (
    proposalId: string,
    additiveId: string,
    data: Partial<{ termMonths: number | null; subcontractValue: number; mobilizationValue: number; readjustValue: number }>
  ) => api.put<{ item: ProposalAdditiveItem; total: number }>(`/proposals/${proposalId}/additives/${additiveId}`, data),
  delete: (proposalId: string, additiveId: string) =>
    api.delete<{ total: number }>(`/proposals/${proposalId}/additives/${additiveId}`),
};

export type ProjectHealthLevel = 'green' | 'yellow' | 'red';

export interface ProjectHealthMetric {
  key: 'hours' | 'financial' | 'pendingHours' | 'schedule';
  label: string;
  level: ProjectHealthLevel;
  value: number;
  displayValue: string;
}

export interface ProjectHealth {
  level: ProjectHealthLevel;
  ruleSource: 'project' | 'global';
  metrics: ProjectHealthMetric[];
}

export interface ProjectHealthRule {
  id: string;
  projectId: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  hoursEnabled: boolean;
  hoursYellow: number;
  hoursRed: number;
  financialEnabled: boolean;
  financialYellow: number;
  financialRed: number;
  pendingHoursEnabled: boolean;
  pendingHoursYellow: number;
  pendingHoursRed: number;
  scheduleEnabled: boolean;
  scheduleYellowDays: number;
  scheduleRedDays: number;
}

export type ProjectHealthRuleInput = Pick<ProjectHealthRule,
  | 'hoursEnabled' | 'hoursYellow' | 'hoursRed'
  | 'financialEnabled' | 'financialYellow' | 'financialRed'
  | 'pendingHoursEnabled' | 'pendingHoursYellow' | 'pendingHoursRed'
  | 'scheduleEnabled' | 'scheduleYellowDays' | 'scheduleRedDays'
>;

export interface ProjectHealthRuleResponse {
  rule: ProjectHealthRule;
  source: 'project' | 'global';
  canEdit?: boolean;
}

export interface Project {
  id: string;
  code: string;
  legacyProposalCode?: string;
  legacyRevision?: number;
  legacyTermMonths?: number;
  name: string;
  description?: string;
  clientId: string;
  coordinatorId?: string | null;
  client?: Client;
  coordinator?: {
    id: string;
    name: string;
    email: string;
  } | null;
  status: string;
  startDate?: string;
  endDate?: string;
  budgetHours: number;
  budgetValue: number;
  dailyLimitHours?: number;
  requiresApproval?: boolean;
  setupStatus?: 'pending' | 'in_progress' | 'completed';
  setupCompletedAt?: string | null;
  setupCompletedById?: string | null;
  tapStatus?: 'not_generated' | 'generated' | 'sent' | 'failed';
  tapGeneratedAt?: string | null;
  tapSentAt?: string | null;
  tapLastEmailError?: string | null;
  consumedHours?: number;
  pendingHours?: number;
  timeSummary?: {
    launchedHours: number;
    approvedHours: number;
    pendingApprovalHours: number;
    rejectedHours: number;
    entriesCount: number;
    approvedEntriesCount: number;
    pendingEntriesCount: number;
    rejectedEntriesCount: number;
  };
  hoursByCollaborator?: Array<{
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
  }>;
  isCurrentUserAllocated?: boolean;
  health?: ProjectHealth;
  createdAt: string;
}

export interface ProjectTap {
  id: string;
  projectId: string;
  version: number;
  title: string;
  payload: any;
  htmlContent?: string | null;
  generatedById?: string | null;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: User['role'];
  isActive: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  collaboratorId: string;
  collaboratorName?: string | null;
  costCenterId?: string | null;
  entryDate: string;
  hours: number;
  description?: string;
  attachments?: TimeEntryAttachment[] | null;
  costCenter?: CostCenter | null;
  status: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
}

export interface TimeEntryAttachment {
  name: string;
  objectPath: string;
  contentType: string;
  size: number;
}

export interface ProposalCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
}

export interface DashboardMetrics {
  proposals: {
    total: number;
    byStatus: any[];
    success?: {
      period: { count: number; total: number; rate: number };
      overall: { count: number; total: number; rate: number };
    };
  };
  projects: { total: number; active: number; byStatus: any[] };
  clients: { total: number; active: number };
  hours: {
    monthlyTotal: number;
    launchedMonthly?: number;
    approvedMonthly?: number;
    pendingMonthly?: number;
    approvalRate?: number;
    pendingApprovals: number;
  };
  financial: { approvedProposalsValue: number };
  trends?: {
    approvedValue: Array<{ label: string; atual: number; meta: number }>;
    proposalCount?: Array<{ label: string; atual: number; meta: number }>;
  };
  comparisons?: {
    currentApprovedValue: number;
    previousApprovedValue: number;
    approvedValueDeltaPct: number;
  };
  funnel?: {
    elaboracao: number;
    analise: number;
    ganho: number;
    perdido: number;
  };
  topClients?: Array<{
    clientId: string;
    clientName: string;
    approvedValue: number;
    proposalsCount: number;
  }>;
}

export interface CommercialDashboardMetrics {
  proposals: {
    total: number;
    byStatus: any[];
    success?: {
      period: { count: number; total: number; rate: number };
      overall: { count: number; total: number; rate: number };
    };
  };
  clients: { total: number; active: number };
  financial: { approvedProposalsValue: number };
  hours?: {
    launchedMonthly: number;
    approvedMonthly: number;
    pendingMonthly: number;
    approvalRate: number;
  };
  trends?: {
    approvedValue: Array<{ label: string; atual: number; meta: number }>;
    proposalCount?: Array<{ label: string; atual: number; meta: number }>;
  };
  comparisons?: {
    currentApprovedValue: number;
    previousApprovedValue: number;
    approvedValueDeltaPct: number;
  };
}

export interface ProjectsDashboardMetrics {
  projects: { total: number; active: number; byStatus: any[] };
  clients: { total: number };
  hours: {
    monthlyApprovedHours: number;
    launchedMonthly?: number;
    approvedMonthly?: number;
    pendingMonthly?: number;
    approvalRate?: number;
    pendingCount: number;
  };
  trends?: {
    approvedHours: Array<{ label: string; atual: number; meta: number }>;
  };
  comparisons?: {
    currentApprovedHours: number;
    previousApprovedHours: number;
    approvedHoursDeltaPct: number;
  };
}

export const clientsApi = {
  getAll: () => api.get<Client[]>('/clients'),
  getOne: (id: string) => api.get<Client>(`/clients/${id}`),
  create: (data: Partial<Client>) => api.post<Client>('/clients', data),
  update: (id: string, data: Partial<Client>) => api.put<Client>(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
};

const TAP_PREVIEW_TIMEOUT_MS = 15000;
const TAP_SAVE_TIMEOUT_MS = 20000;
const TAP_GENERATE_TIMEOUT_MS = 45000;
const TAP_RESEND_TIMEOUT_MS = 20000;

export const proposalsApi = {
  getAll: () => api.get<Proposal[]>('/proposals'),
  getOne: (id: string) => api.get<Proposal>(`/proposals/${id}`),
  getActivities: (id: string) => api.get<EntityActivity[]>(`/proposals/${id}/activities`),
  create: (data: Partial<Proposal>) => api.post<Proposal>('/proposals', data),
  update: (id: string, data: Partial<Proposal>) => api.put<Proposal>(`/proposals/${id}`, data),
  delete: (id: string) => api.delete(`/proposals/${id}`),
  saveTap: (proposalId: string, data: ProposalTapDraft) =>
    request<Proposal>(`/proposals/${proposalId}/tap`, {
      method: 'PUT',
      body: JSON.stringify(data),
      timeoutMs: TAP_SAVE_TIMEOUT_MS,
    }),
  getTapHtml: (proposalId: string) => api.get<{ htmlContent: string }>(`/proposals/${proposalId}/tap/html`),
  previewTapHtml: (proposalId: string, data: ProposalTapDraft) =>
    request<{ htmlContent: string }>(`/proposals/${proposalId}/tap/preview-html`, {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: TAP_PREVIEW_TIMEOUT_MS,
    }),
  getTapPdfBlob: (proposalId: string) => api.getBlob(`/proposals/${proposalId}/tap/pdf`),
  generateTap: (proposalId: string, data: ProposalTapDraft) =>
    request<ProposalTapGenerateResponse>(`/proposals/${proposalId}/tap/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: TAP_GENERATE_TIMEOUT_MS,
    }),
  resendTapEmail: (proposalId: string) =>
    request<Proposal>(`/proposals/${proposalId}/tap/resend-email`, {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: TAP_RESEND_TIMEOUT_MS,
    }),
  createRevision: (id: string) => api.post<Proposal>(`/proposals/${id}/revision`, {}),
};

export const projectsApi = {
  getAll: () => api.get<Project[]>('/projects'),
  getOne: (id: string) => api.get<Project>(`/projects/${id}`),
  getNextCode: () => api.get<{ code: string }>('/projects/next-code'),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getTap: (id: string) => api.get<ProjectTap | null>(`/projects/${id}/tap`),
  resendTapEmail: (id: string) => api.post<Project>(`/projects/${id}/tap/resend-email`, {}),
  updateSetup: (id: string, data: { coordinatorId?: string | null; dailyLimitHours?: number; requiresApproval?: boolean }) =>
    api.put<Project>(`/projects/${id}/setup`, data),
  getMembers: (id: string) => api.get<ProjectMember[]>(`/projects/${id}/members`),
  setMembers: (id: string, userIds: string[]) =>
    api.put<ProjectMember[]>(`/projects/${id}/members`, { userIds }),
  completeSetup: (id: string) => api.post<Project>(`/projects/${id}/setup/complete`),
  activate: (id: string) => api.post<Project>(`/projects/${id}/activate`),
  getStats: (id: string) => api.get<any>(`/projects/${id}/stats`),
  getActivities: (id: string) => api.get<EntityActivity[]>(`/projects/${id}/activities`),
  getTimeEntries: (id: string) => api.get<TimeEntry[]>(`/projects/${id}/time-entries`),
  createTimeEntry: (data: Partial<TimeEntry>) => api.post<TimeEntry>('/projects/time-entries', data),
  updateTimeEntry: (id: string, data: Partial<TimeEntry>) => api.put<TimeEntry>(`/projects/time-entries/${id}`, data),
  deleteTimeEntry: (id: string) => api.delete(`/projects/time-entries/${id}`),
  updateTimeEntryStatus: (id: string, data: { status: 'approved' | 'rejected'; rejectionReason?: string | null }) =>
    api.patch<TimeEntry>(`/projects/time-entries/${id}/status`, data),
  getGlobalHealthRule: () => api.get<ProjectHealthRule>('/projects/health-rules/global'),
  updateGlobalHealthRule: (data: ProjectHealthRuleInput) => api.put<ProjectHealthRule>('/projects/health-rules/global', data),
  getHealthRule: (id: string) => api.get<ProjectHealthRuleResponse>(`/projects/${id}/health-rule`),
  updateHealthRule: (id: string, data: ProjectHealthRuleInput) =>
    api.put<ProjectHealthRuleResponse>(`/projects/${id}/health-rule`, data),
  resetHealthRule: (id: string) => api.delete<ProjectHealthRuleResponse>(`/projects/${id}/health-rule`),
};

export const reportsApi = {
  getDashboard: (period?: '7d' | '30d' | '90d' | '180d' | '365d') =>
    api.get<DashboardMetrics>(`/reports/dashboard${period ? `?period=${period}` : ''}`),
  getHours: (startDate: string, endDate: string) =>
    api.get<any>(`/reports/hours?startDate=${startDate}&endDate=${endDate}`),
  getProposals: () => api.get<any>('/reports/proposals'),
  getProjects: () => api.get<any>('/reports/projects'),
  getClients: () => api.get<any>('/reports/clients'),
};

export const dashboardApi = {
  getCommercial: (period?: '7d' | '30d' | '90d' | '180d' | '365d') =>
    api.get<CommercialDashboardMetrics>(`/dashboard/commercial${period ? `?period=${period}` : ''}`),
  getProjects: (period?: '7d' | '30d' | '90d' | '180d' | '365d') =>
    api.get<ProjectsDashboardMetrics>(`/dashboard/projects${period ? `?period=${period}` : ''}`),
};

export const favoritesApi = {
  getAll: () => api.get<string[]>('/proposal-favorites'),
  add: (proposalId: string) => api.post<{ success: boolean }>(`/proposal-favorites/${proposalId}`),
  remove: (proposalId: string) => api.delete(`/proposal-favorites/${proposalId}`),
};

export const projectFavoritesApi = {
  getAll: () => api.get<string[]>('/project-favorites'),
  add: (projectId: string) => api.post<{ success: boolean }>(`/project-favorites/${projectId}`),
  remove: (projectId: string) => api.delete(`/project-favorites/${projectId}`),
};

export const proposalCategoriesApi = {
  getAll: () => api.get<ProposalCategory[]>('/proposal-categories'),
  create: (data: { name: string; isActive?: boolean; code?: string }) =>
    api.post<ProposalCategory>('/proposal-categories', data),
  update: (id: string, data: Partial<ProposalCategory>) =>
    api.put<ProposalCategory>(`/proposal-categories/${id}`, data),
  delete: (id: string) => api.delete(`/proposal-categories/${id}`),
};

export const costCentersApi = {
  getAll: () => api.get<CostCenter[]>('/cost-centers'),
  create: (data: { code: string; name: string; isActive?: boolean }) =>
    api.post<CostCenter>('/cost-centers', data),
  update: (id: string, data: Partial<CostCenter>) =>
    api.put<CostCenter>(`/cost-centers/${id}`, data),
  delete: (id: string) => api.delete(`/cost-centers/${id}`),
};
