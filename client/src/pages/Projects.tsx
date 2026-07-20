import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, Clock, LayoutGrid, List, UserRound, Filter, SlidersHorizontal, X, Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Trash2, FileText, Download, Printer, ArrowRightCircle, ClipboardCheck, MailCheck, Sparkles, Info, Star, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { projectsApi, clientsApi, usersApi, projectFavoritesApi, Project, Client, ProjectTap, ProjectMember, UserOption } from '@/lib/api';
import { TEC3_LOADER_ANIMATION_SECONDS, TEC3_LOADER_MIN_VISIBLE_MS } from '@/lib/loader';
import { DangerZoneConfirm } from '@/components/DangerZoneConfirm';

const statusColors: Record<string, string> = {
  planning: 'bg-gray-500',
  in_progress: 'bg-blue-500',
  active: 'bg-blue-500',
  on_hold: 'bg-yellow-500',
  completed: 'bg-green-500',
  cancelled: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  planning: 'Planejamento',
  in_progress: 'Em Andamento',
  active: 'Em Andamento',
  on_hold: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const setupStatusLabels: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  completed: 'Concluído',
};

const tapStatusLabels: Record<string, string> = {
  not_generated: 'Não gerado',
  generated: 'Gerado',
  sent: 'Enviado',
  failed: 'Falha no envio',
};

const PROJECT_TAP_PUBLIC_LOGO_URL = 'https://www.tec3engenharia.com.br/wp-content/uploads/2025/09/tec3-LogoTagline-Cor.svg';

function normalizeProjectTapHtml(htmlContent: string | null | undefined) {
  if (!htmlContent) return '';

  return htmlContent
    .replace(
      /src=(["'])(?:https?:\/\/[^"']*\/assets\/tec3-logo\.svg|\/assets\/tec3-logo\.svg)\1/gi,
      `src=$1${PROJECT_TAP_PUBLIC_LOGO_URL}$1`
    )
    .replace(
      /<a\b[^>]*>[\s\S]*?abrir\s+projeto\s+no\s+sistema[\s\S]*?<\/a>/gi,
      ''
    )
    .replace(
      /<button\b[^>]*>[\s\S]*?abrir\s+projeto\s+no\s+sistema[\s\S]*?<\/button>/gi,
      ''
    );
}

function parseQueryList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeFilterValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

type ViewMode = 'cards' | 'table';
type SortColumn = 'name' | 'code' | 'client' | 'status' | 'hours' | 'value' | 'createdAt';
type SortDirection = 'asc' | 'desc';
type SortPreset = 'recent' | 'oldest' | 'name_asc' | 'value_desc' | 'custom';

export default function Projects() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortColumn, setSortColumn] = useState<SortColumn>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [sortPreset, setSortPreset] = useState<SortPreset>('recent');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [onboardingOriginFilter, setOnboardingOriginFilter] = useState<'all' | 'native' | 'legacy'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [hoursMin, setHoursMin] = useState('');
  const [hoursMax, setHoursMax] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleteConfirmProjectInput, setDeleteConfirmProjectInput] = useState('');
  const [tapPreviewOpen, setTapPreviewOpen] = useState(false);
  const [tapDetailsOpen, setTapDetailsOpen] = useState(false);
  const [detailsInitialSection, setDetailsInitialSection] = useState<'overview' | 'config' | 'team'>('overview');
  const configurationSectionRef = useRef<HTMLDivElement | null>(null);
  const teamSectionRef = useRef<HTMLDivElement | null>(null);
  const [setupForm, setSetupForm] = useState({
    coordinatorId: '',
    dailyLimitHours: '8',
    requiresApproval: 'true',
  });
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: '',
    budgetHours: '',
    budgetValue: '',
    dailyLimitHours: '8',
  });

  useEffect(() => {
    const queryStringFromLocation = location.includes('?') ? location.split('?')[1] ?? '' : '';
    const queryStringFromWindow = typeof window !== 'undefined'
      ? window.location.search.replace(/^\?/, '')
      : '';
    const queryString = queryStringFromLocation || queryStringFromWindow;
    const params = new URLSearchParams(queryString);

    const statusFromList = parseQueryList(params.get('statuses'));
    const statusSingle = parseQueryList(params.get('status'));
    const nextStatusFilters = Array.from(new Set([...statusFromList, ...statusSingle]));
    const nextClientFilter = (params.get('clientId') ?? params.get('client') ?? '').trim();
    const nextOnboardingOrigin = normalizeFilterValue(params.get('onboardingOrigin') ?? 'all');
    const nextProjectId = (params.get('projectId') ?? '').trim();
    const nextAction = normalizeFilterValue(params.get('action') ?? '');
    const nextFavoritesOnly = params.get('favorites') === '1';

    setSearch(params.get('search') ?? '');
    setStatusFilters(nextStatusFilters);
    setClientFilter(nextClientFilter);
    setOnboardingOriginFilter(
      nextOnboardingOrigin === 'legacy' || nextOnboardingOrigin === 'native'
        ? (nextOnboardingOrigin as 'legacy' | 'native')
        : 'all'
    );
    setSelectedProjectId(nextProjectId || null);
    setDetailsOpen(Boolean(nextProjectId));
    setDetailsInitialSection(nextAction === 'allocateteam' ? 'team' : 'overview');
    setShowOnlyFavorites(nextFavoritesOnly);

    if (nextStatusFilters.length > 0 || nextClientFilter || nextOnboardingOrigin === 'legacy' || nextOnboardingOrigin === 'native' || nextFavoritesOnly) {
      setFiltersOpen(true);
    }

    setCurrentPage(1);
  }, [location]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const normalizedStatuses = Array.from(
      new Set(statusFilters.map(normalizeFilterValue).filter(Boolean))
    );
    const nextSearch = search.trim();
    const nextClient = clientFilter.trim();

    ['search', 'statuses', 'status', 'clientId', 'client', 'onboardingOrigin', 'favorites'].forEach((key) => {
      params.delete(key);
    });

    if (nextSearch) params.set('search', nextSearch);
    if (normalizedStatuses.length) params.set('statuses', normalizedStatuses.join(','));
    if (nextClient) params.set('clientId', nextClient);
    if (onboardingOriginFilter !== 'all') params.set('onboardingOrigin', onboardingOriginFilter);
    if (showOnlyFavorites) params.set('favorites', '1');

    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [search, statusFilters, clientFilter, onboardingOriginFilter, showOnlyFavorites]);

  useEffect(() => {
    const savedViewMode = localStorage.getItem('projectsViewMode') as ViewMode;
    if (savedViewMode && (savedViewMode === 'cards' || savedViewMode === 'table')) {
      setViewMode(savedViewMode);
    }

    const savedSortColumn = localStorage.getItem('projectsSortColumn') as SortColumn;
    const savedSortDirection = localStorage.getItem('projectsSortDirection') as SortDirection;
    const savedSortOrder = localStorage.getItem('projectsSortOrder') as SortPreset;

    if (savedSortColumn && ['name', 'code', 'client', 'status', 'hours', 'value', 'createdAt'].includes(savedSortColumn)) {
      setSortColumn(savedSortColumn);
    }
    if (savedSortDirection && (savedSortDirection === 'asc' || savedSortDirection === 'desc')) {
      setSortDirection(savedSortDirection);
    }
    if (savedSortOrder && (savedSortOrder === 'recent' || savedSortOrder === 'oldest' || savedSortOrder === 'name_asc' || savedSortOrder === 'value_desc' || savedSortOrder === 'custom')) {
      setSortPreset(savedSortOrder);
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('projectsViewMode', mode);
  };

  const persistSortState = (nextColumn: SortColumn, nextDirection: SortDirection) => {
    setSortColumn(nextColumn);
    setSortDirection(nextDirection);
    localStorage.setItem('projectsSortColumn', nextColumn);
    localStorage.setItem('projectsSortDirection', nextDirection);

    if (nextColumn === 'createdAt' && nextDirection === 'desc') {
      setSortPreset('recent');
      localStorage.setItem('projectsSortOrder', 'recent');
      return;
    }

    if (nextColumn === 'createdAt' && nextDirection === 'asc') {
      setSortPreset('oldest');
      localStorage.setItem('projectsSortOrder', 'oldest');
      return;
    }

    if (nextColumn === 'name' && nextDirection === 'asc') {
      setSortPreset('name_asc');
      localStorage.setItem('projectsSortOrder', 'name_asc');
      return;
    }

    if (nextColumn === 'value' && nextDirection === 'desc') {
      setSortPreset('value_desc');
      localStorage.setItem('projectsSortOrder', 'value_desc');
      return;
    }

    setSortPreset('custom');
    localStorage.setItem('projectsSortOrder', 'custom');
  };

  const handleSortPresetChange = (preset: SortPreset) => {
    switch (preset) {
      case 'recent':
        persistSortState('createdAt', 'desc');
        return;
      case 'oldest':
        persistSortState('createdAt', 'asc');
        return;
      case 'name_asc':
        persistSortState('name', 'asc');
        return;
      case 'value_desc':
        persistSortState('value', 'desc');
        return;
      default:
        setSortPreset('custom');
        localStorage.setItem('projectsSortOrder', 'custom');
    }
  };

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const [showProjectsLoader, setShowProjectsLoader] = useState<boolean>(isLoading);
  const projectsLoaderStartedAtRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (isLoading) {
      if (projectsLoaderStartedAtRef.current === null) {
        projectsLoaderStartedAtRef.current = Date.now();
      }
      setShowProjectsLoader(true);
      return;
    }

    const startedAt = projectsLoaderStartedAtRef.current;
    if (startedAt === null) {
      setShowProjectsLoader(false);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, TEC3_LOADER_MIN_VISIBLE_MS - elapsed);

    timeoutId = setTimeout(() => {
      setShowProjectsLoader(false);
      projectsLoaderStartedAtRef.current = null;
    }, remaining);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isLoading]);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['/api/users'],
    queryFn: () => usersApi.getAllOptions(),
  });

  const { data: favoriteProjectIds = [] } = useQuery<string[]>({
    queryKey: ['/api/project-favorites'],
    queryFn: () => projectFavoritesApi.getAll(),
  });

  const favoriteProjectsSet = useMemo(() => new Set(favoriteProjectIds), [favoriteProjectIds]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ projectId, isFavorite }: { projectId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        return projectFavoritesApi.remove(projectId);
      }

      return projectFavoritesApi.add(projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-favorites'] });
    },
  });

  const { data: selectedProject, isLoading: isLoadingSelectedProject } = useQuery<Project>({
    queryKey: ['/api/projects', selectedProjectId],
    queryFn: () => projectsApi.getOne(selectedProjectId as string),
    enabled: detailsOpen && !!selectedProjectId,
  });

  const { data: selectedProjectTap } = useQuery<ProjectTap | null>({
    queryKey: ['/api/projects', selectedProjectId, 'tap'],
    queryFn: () => projectsApi.getTap(selectedProjectId as string),
    enabled: detailsOpen && !!selectedProjectId,
  });

  const { data: selectedProjectMembers = [] } = useQuery<ProjectMember[]>({
    queryKey: ['/api/projects', selectedProjectId, 'members'],
    queryFn: () => projectsApi.getMembers(selectedProjectId as string),
    enabled: detailsOpen && !!selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Project>) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Projeto criado com sucesso', variant: 'success' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar projeto', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Projeto excluído com sucesso', variant: 'success' });
      if (selectedProjectId === id) {
        setDetailsOpen(false);
        setSelectedProjectId(null);
      }
      setProjectToDelete(null);
      setDeleteConfirmProjectInput('');
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir projeto', description: error.message, variant: 'destructive' });
    },
  });

  const updateSetupMutation = useMutation({
    mutationFn: (data: { coordinatorId?: string | null; dailyLimitHours?: number; requiresApproval?: boolean }) =>
      projectsApi.updateSetup(selectedProjectId as string, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar setup', description: error.message, variant: 'destructive' });
    },
  });

  const completeSetupMutation = useMutation({
    mutationFn: () => projectsApi.completeSetup(selectedProjectId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao concluir setup', description: error.message, variant: 'destructive' });
    },
  });

  const activateProjectMutation = useMutation({
    mutationFn: () => projectsApi.activate(selectedProjectId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId] });
      toast({ title: 'Projeto iniciado com sucesso', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao iniciar projeto', description: error.message, variant: 'destructive' });
    },
  });

  const updateMembersMutation = useMutation({
    mutationFn: (memberIds: string[]) => projectsApi.setMembers(selectedProjectId as string, memberIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId, 'members'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Equipe alocada com sucesso', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao alocar equipe', description: error.message, variant: 'destructive' });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setFormData({
      name: '',
      description: '',
      clientId: '',
      budgetHours: '',
      budgetValue: '',
      dailyLimitHours: '8',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      budgetHours: parseInt(formData.budgetHours) || 0,
      budgetValue: parseFloat(formData.budgetValue) || 0,
      dailyLimitHours: parseInt(formData.dailyLimitHours) || 8,
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('pt-BR');
  };

  const openDetailsDialog = (projectId: string, initialSection: 'overview' | 'config' | 'team' = 'overview') => {
    setSelectedProjectId(projectId);
    setShowFullColumnsMobile(false);
    setDetailsInitialSection(initialSection);
    setDetailsOpen(true);
  };

  const openProjectTimeEntries = (projectId: string) => {
    setLocation(`/time-entries?projectId=${projectId}`);
  };

  const openProjectTimeApprovals = (projectId: string) => {
    setLocation(`/time-approvals?projectId=${projectId}`);
  };

  useEffect(() => {
    if (!selectedProject) return;

    setSetupForm({
      coordinatorId: selectedProject.coordinatorId ?? '',
      dailyLimitHours: String(selectedProject.dailyLimitHours ?? 8),
      requiresApproval: String(selectedProject.requiresApproval ?? true),
    });
  }, [selectedProject]);

  useEffect(() => {
    setSelectedTeamMemberIds(selectedProjectMembers.map((member) => member.userId));
  }, [selectedProjectMembers, selectedProjectId]);

  useEffect(() => {
    setTapDetailsOpen(false);
  }, [selectedProjectId, detailsOpen]);

  useEffect(() => {
    if (!detailsOpen || !selectedProject) return;

    const frameId = window.requestAnimationFrame(() => {
      if (detailsInitialSection === 'config') {
        configurationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (detailsInitialSection === 'team') {
        teamSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      setDetailsInitialSection('overview');
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [detailsOpen, selectedProject, detailsInitialSection]);

  const getConsumedHours = (project: Project) => Number(project.consumedHours || 0);
  const getBudgetHours = (project: Project) => Number(project.budgetHours || 0);
  const formatHours = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const formatHoursWithUnit = (value: number) => `${formatHours(value)} h`;
  const getProgressText = (project: Project) => {
    const consumed = getConsumedHours(project);
    const budget = getBudgetHours(project);
    if (budget <= 0) {
      return consumed > 0 ? `${formatHours(consumed)}h / -` : '-';
    }
    return `${formatHours(consumed)} / ${formatHours(budget)}h`;
  };
  const getProgressPercent = (project: Project) => {
    const budgetHours = getBudgetHours(project);
    if (budgetHours <= 0) return 0;
    const consumedHours = getConsumedHours(project);
    return Math.min(100, Math.max(0, (consumedHours / budgetHours) * 100));
  };
  const hasProjectExecutionStarted = (project: Project) =>
    project.status !== 'planning' || Number(project.timeSummary?.entriesCount || 0) > 0;

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      persistSortState(column, sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    persistSortState(column, 'asc');
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-4 w-4 opacity-50" />;
    }

    return sortDirection === 'asc'
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const handleToggleFavorite = (projectId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    toggleFavoriteMutation.mutate({
      projectId,
      isFavorite: favoriteProjectsSet.has(projectId),
    });
  };

  const hasProjectTapReady = (project: Project) =>
    Boolean((project.tapStatus && project.tapStatus !== 'not_generated') || project.tapGeneratedAt);

  const isLegacyCompatibilityProject = (project: Project) =>
    hasProjectExecutionStarted(project) && !hasProjectTapReady(project);

  const isProjectExecutionStarted = selectedProject ? hasProjectExecutionStarted(selectedProject) : false;

  const isSetupCompletedEffective = Boolean(
    selectedProject && (selectedProject.setupStatus === 'completed' || isProjectExecutionStarted)
  );

  const isSetupMarkedCompleted = selectedProject?.setupStatus === 'completed';

  const isAdmin = user?.role === 'admin';
  const isCoordinatorOfSelectedProject = Boolean(
    selectedProject && user?.id && selectedProject.coordinatorId === user.id
  );
  const canManageTeamAllocation = Boolean(selectedProject && (isAdmin || isCoordinatorOfSelectedProject));

  const currentTeamMemberIds = useMemo(
    () => selectedProjectMembers.map((member) => member.userId).sort(),
    [selectedProjectMembers]
  );

  const normalizedSelectedTeamMemberIds = useMemo(
    () => Array.from(new Set(selectedTeamMemberIds)).sort(),
    [selectedTeamMemberIds]
  );

  const hasTeamAllocationChanges =
    currentTeamMemberIds.join('|') !== normalizedSelectedTeamMemberIds.join('|');

  const normalizedCurrentCoordinatorId = selectedProject?.coordinatorId ?? '';
  const normalizedCurrentDailyLimitHours = Number.parseInt(String(selectedProject?.dailyLimitHours ?? 8), 10) || 8;
  const normalizedCurrentRequiresApproval = String(Boolean(selectedProject?.requiresApproval ?? true));

  const normalizedFormCoordinatorId = setupForm.coordinatorId || '';
  const normalizedFormDailyLimitHours = Number.parseInt(setupForm.dailyLimitHours, 10) || 8;
  const normalizedFormRequiresApproval = setupForm.requiresApproval;

  const hasSetupChanges = Boolean(
    selectedProject && (
      normalizedFormCoordinatorId !== normalizedCurrentCoordinatorId ||
      normalizedFormDailyLimitHours !== normalizedCurrentDailyLimitHours ||
      normalizedFormRequiresApproval !== normalizedCurrentRequiresApproval
    )
  );

  const canEditSetupAfterCompletion = !isSetupMarkedCompleted || isAdmin;

  const isTapReadyEffective = Boolean(
    selectedProject && (
      (selectedProject.tapStatus && selectedProject.tapStatus !== 'not_generated') ||
      selectedProject.tapGeneratedAt ||
      selectedProjectTap?.htmlContent
    )
  );

  const canEditSetupCoordinator = canEditSetupAfterCompletion && !isTapReadyEffective;

  const isLegacyOnboardingInferred = Boolean(
    selectedProject && selectedProject.setupStatus !== 'completed' && isProjectExecutionStarted
  );

  const isLegacyTapMissingInExecution = Boolean(
    selectedProject && isProjectExecutionStarted && !isTapReadyEffective
  );

  const setupStatusPresentationLabel = selectedProject
    ? (isLegacyOnboardingInferred
      ? 'Concluído'
      : (setupStatusLabels[selectedProject.setupStatus || 'pending'] || selectedProject.setupStatus || '-'))
    : '-';

  const tapStatusPresentationLabel = selectedProject
    ? (isLegacyTapMissingInExecution
      ? 'Histórico sem TAP'
      : (tapStatusLabels[selectedProject.tapStatus || 'not_generated'] || selectedProject.tapStatus || '-'))
    : '-';

  const onboardingHeadline = isProjectExecutionStarted
    ? 'Projeto em execução com onboarding consolidado'
    : 'Projeto em planejamento com TAP e setup operacional';

  const onboardingStatusBadgeClassName = 'h-6 min-w-[150px] px-2.5 inline-flex items-center justify-center whitespace-nowrap text-[11px] font-medium tracking-wide dark:border-white/10 dark:bg-[#214273] dark:text-blue-50';

  const teamAllocationCandidates = useMemo(
    () => users.filter((candidate) => candidate.isActive),
    [users]
  );

  const toggleTeamMember = (userId: string) => {
    setSelectedTeamMemberIds((current) => (
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId]
    ));
  };

  const handleSaveTeamAllocation = () => {
    if (!canManageTeamAllocation || !selectedProjectId || !hasTeamAllocationChanges) return;
    updateMembersMutation.mutate(normalizedSelectedTeamMemberIds);
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilters([]);
    setClientFilter('');
    setOnboardingOriginFilter('all');
    setDateFrom('');
    setDateTo('');
    setValueMin('');
    setValueMax('');
    setHoursMin('');
    setHoursMax('');
    setCurrentPage(1);
  };

  const activeFilterCount =
    statusFilters.length +
    (clientFilter ? 1 : 0) +
    (onboardingOriginFilter !== 'all' ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (valueMin ? 1 : 0) +
    (valueMax ? 1 : 0) +
    (hoursMin ? 1 : 0) +
    (hoursMax ? 1 : 0);

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter((p) => {
      const searchMatch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase());

      const projectStatus = normalizeFilterValue(p.status);
      const normalizedStatusFilters = statusFilters.map(normalizeFilterValue);
      const statusMatch = normalizedStatusFilters.length === 0 || normalizedStatusFilters.includes(projectStatus);
      const clientMatch = !clientFilter || p.clientId === clientFilter;
      const onboardingOriginMatch =
        onboardingOriginFilter === 'all' ||
        (onboardingOriginFilter === 'legacy' ? isLegacyCompatibilityProject(p) : !isLegacyCompatibilityProject(p));

      const dateMatch = (() => {
        if (!dateFrom && !dateTo) return true;
        const projectDate = p.createdAt ? new Date(p.createdAt) : null;
        if (!projectDate || Number.isNaN(projectDate.getTime())) return false;
        if (dateFrom && projectDate < new Date(dateFrom)) return false;
        if (dateTo && projectDate > new Date(`${dateTo}T23:59:59`)) return false;
        return true;
      })();

      const valueMatch = (() => {
        const value = Number(p.budgetValue || 0);
        if (valueMin && value < Number.parseFloat(valueMin)) return false;
        if (valueMax && value > Number.parseFloat(valueMax)) return false;
        return true;
      })();

      const hoursMatch = (() => {
        const hours = Number(p.budgetHours || 0);
        if (hoursMin && hours < Number.parseFloat(hoursMin)) return false;
        if (hoursMax && hours > Number.parseFloat(hoursMax)) return false;
        return true;
      })();

      const favoriteMatch = !showOnlyFavorites || favoriteProjectsSet.has(p.id);

      return searchMatch && statusMatch && clientMatch && onboardingOriginMatch && dateMatch && valueMatch && hoursMatch && favoriteMatch;
    });

    return filtered.sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';

      switch (sortColumn) {
        case 'name':
          aValue = a.name || '';
          bValue = b.name || '';
          break;
        case 'code':
          aValue = a.code || '';
          bValue = b.code || '';
          break;
        case 'client':
          aValue = a.client?.razaoSocial || '';
          bValue = b.client?.razaoSocial || '';
          break;
        case 'status':
          aValue = a.status || '';
          bValue = b.status || '';
          break;
        case 'hours':
          aValue = Number(a.consumedHours || 0);
          bValue = Number(b.consumedHours || 0);
          break;
        case 'value':
          aValue = Number(a.budgetValue || 0);
          bValue = Number(b.budgetValue || 0);
          break;
        case 'createdAt':
        default:
          aValue = Number.isNaN(new Date(a.createdAt).getTime()) ? 0 : new Date(a.createdAt).getTime();
          bValue = Number.isNaN(new Date(b.createdAt).getTime()) ? 0 : new Date(b.createdAt).getTime();
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue, 'pt-BR', { sensitivity: 'base' })
          : bValue.localeCompare(aValue, 'pt-BR', { sensitivity: 'base' });
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }

      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    });

  }, [projects, search, statusFilters, clientFilter, onboardingOriginFilter, dateFrom, dateTo, valueMin, valueMax, hoursMin, hoursMax, sortColumn, sortDirection, showOnlyFavorites, favoriteProjectsSet]);

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleSetupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedProject) return;

    if (isSetupMarkedCompleted && !isAdmin) {
      toast({ title: 'Somente administradores podem alterar setup concluído', variant: 'destructive' });
      return;
    }

    if (!hasSetupChanges && !canCompleteSetup) {
      return;
    }

    try {
      if (hasSetupChanges) {
        await updateSetupMutation.mutateAsync({
          coordinatorId: normalizedFormCoordinatorId || null,
          dailyLimitHours: normalizedFormDailyLimitHours,
          requiresApproval: normalizedFormRequiresApproval === 'true',
        });
      }

      if (canCompleteSetup) {
        await completeSetupMutation.mutateAsync();
        toast({ title: 'Setup concluído com sucesso', variant: 'success' });
      } else if (hasSetupChanges) {
        toast({ title: 'Configuração salva com sucesso', variant: 'success' });
      }
    } catch {
      // erros já tratados nos onError das mutations
    }
  };

  const normalizedSelectedProjectTapHtml = useMemo(
    () => normalizeProjectTapHtml(selectedProjectTap?.htmlContent),
    [selectedProjectTap?.htmlContent]
  );

  const handleTapDownload = () => {
    if (!normalizedSelectedProjectTapHtml || !selectedProject) return;

    const blob = new Blob([normalizedSelectedProjectTapHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedProject.code}-tap.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleTapPrint = () => {
    if (!normalizedSelectedProjectTapHtml) return;

    const previewWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!previewWindow) return;

    previewWindow.document.open();
    previewWindow.document.write(normalizedSelectedProjectTapHtml);
    previewWindow.document.close();
    previewWindow.focus();
    previewWindow.print();
  };

  const onboardingItems = selectedProject ? [
    {
      title: 'TAP gerado',
      description: isTapReadyEffective
        ? 'Documento inicial disponível para consulta e exportação.'
        : isLegacyTapMissingInExecution
          ? 'Projeto já em execução sem TAP histórico registrado no sistema atual.'
          : 'Aguardando geração do termo de abertura.',
      complete: isTapReadyEffective || isLegacyTapMissingInExecution,
      icon: FileText,
    },
    {
      title: 'Setup operacional',
      description: isSetupCompletedEffective
        ? 'Regras e responsáveis definidos para início da execução.'
        : isLegacyOnboardingInferred
          ? 'Setup consolidado pelo histórico de execução já iniciado.'
        : 'Defina coordenador, limite diário e aprovação de horas.',
      complete: isSetupCompletedEffective,
      icon: ClipboardCheck,
    },
    {
      title: 'Pronto para execução',
      description: isProjectExecutionStarted
        ? 'Projeto já liberado para operação.'
        : 'Ative o projeto após concluir o onboarding.',
      complete: isProjectExecutionStarted,
      icon: ArrowRightCircle,
    },
  ] : [];

  const currentOnboardingStepIndex = onboardingItems.length
    ? (() => {
      const firstPendingStepIndex = onboardingItems.findIndex((item) => !item.complete);
      return firstPendingStepIndex === -1 ? onboardingItems.length - 1 : firstPendingStepIndex;
    })()
    : 0;

  const canCompleteSetup = Boolean(
    selectedProject &&
    !isSetupCompletedEffective &&
    isTapReadyEffective &&
    setupForm.coordinatorId &&
    (Number.parseInt(setupForm.dailyLimitHours, 10) || 0) > 0
  );

  const canSubmitSetup = Boolean(
    selectedProject &&
    canEditSetupAfterCompletion &&
    (hasSetupChanges || canCompleteSetup)
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Projetos</h1>
            <p className="text-muted-foreground">Gerencie os projetos em execução</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-project">
                <Plus className="h-4 w-4 mr-2" />
                Novo Projeto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo Projeto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    data-testid="input-project-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    data-testid="input-project-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                  >
                    <SelectTrigger data-testid="select-project-client">
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.razaoSocial}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="budgetHours">Horas Orçadas</Label>
                    <Input
                      id="budgetHours"
                      type="number"
                      data-testid="input-project-hours"
                      value={formData.budgetHours}
                      onChange={(e) => setFormData({ ...formData, budgetHours: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budgetValue">Valor Orçado (R$)</Label>
                    <Input
                      id="budgetValue"
                      type="number"
                      step="0.01"
                      data-testid="input-project-value"
                      value={formData.budgetValue}
                      onChange={(e) => setFormData({ ...formData, budgetValue: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailyLimitHours">Limite Diário (h)</Label>
                    <Input
                      id="dailyLimitHours"
                      type="number"
                      data-testid="input-project-daily-limit"
                      value={formData.dailyLimitHours}
                      onChange={(e) => setFormData({ ...formData, dailyLimitHours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50">
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="button-save-project" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="flex-shrink-0">
          <CardContent className="p-4">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-projects"
                    placeholder="Buscar projetos..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Select value={sortPreset} onValueChange={(value) => handleSortPresetChange(value as SortPreset)}>
                    <SelectTrigger className="w-44" data-testid="select-projects-sort-order">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Mais recente</SelectItem>
                      <SelectItem value="oldest">Mais antigo</SelectItem>
                      <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                      <SelectItem value="value_desc">Maior valor</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center border rounded-md">
                    <Button
                      variant={viewMode === 'cards' ? 'default' : 'ghost'}
                      size="sm"
                      data-testid="button-view-cards-projects"
                      onClick={() => handleViewModeChange('cards')}
                      className="rounded-r-none"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'table' ? 'default' : 'ghost'}
                      size="sm"
                      data-testid="button-view-table-projects"
                      onClick={() => handleViewModeChange('table')}
                      className="rounded-l-none"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>

                  <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        data-testid="button-toggle-project-filters"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        Filtros
                        {activeFilterCount > 0 && (
                          <Badge variant="secondary" className="ml-1 h-5 px-2 text-xs">
                            {activeFilterCount}
                          </Badge>
                        )}
                        {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                </div>
              </div>

              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleContent className="space-y-4 border-t pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Status</Label>
                    </div>
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="gap-1 text-muted-foreground"
                        data-testid="button-clear-project-filters"
                      >
                        <X className="h-3 w-3" />
                        Limpar filtros
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <Button
                        key={key}
                        variant={statusFilters.includes(key) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleStatusFilter(key)}
                        data-testid={`filter-project-status-${key}`}
                        className={`gap-2 ${statusFilters.includes(key) ? '' : 'text-muted-foreground'}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusColors[key]}`} />
                        {label}
                      </Button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Período (criação)</Label>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => {
                            setDateFrom(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-date-from"
                          className="flex-1"
                        />
                        <Input
                          type="date"
                          value={dateTo}
                          onChange={(e) => {
                            setDateTo(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-date-to"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-medium">Valor Orçado (R$)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Mín"
                          value={valueMin}
                          onChange={(e) => {
                            setValueMin(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-value-min"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Máx"
                          value={valueMax}
                          onChange={(e) => {
                            setValueMax(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-value-max"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-medium">Horas Orçadas</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="Mín"
                          value={hoursMin}
                          onChange={(e) => {
                            setHoursMin(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-hours-min"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Máx"
                          value={hoursMax}
                          onChange={(e) => {
                            setHoursMax(e.target.value);
                            setCurrentPage(1);
                          }}
                          data-testid="filter-project-hours-max"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-medium">Cliente</Label>
                      <Select
                        value={clientFilter}
                        onValueChange={(value) => {
                          setClientFilter(value === '_all' ? '' : value);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-project-client">
                          <SelectValue placeholder="Todos os clientes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Todos os clientes</SelectItem>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.razaoSocial}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="font-medium">Origem do onboarding</Label>
                      <Select
                        value={onboardingOriginFilter}
                        onValueChange={(value) => {
                          setOnboardingOriginFilter(
                            value === 'legacy' || value === 'native' ? value : 'all'
                          );
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-project-onboarding-origin">
                          <SelectValue placeholder="Todos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="native">Nativo</SelectItem>
                          <SelectItem value="legacy">Contexto histórico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CardContent>
        </Card>

        {showProjectsLoader ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <style>{`
              @keyframes tec3LogoFillGrayProjects {
                0%, 100% {
                  width: 12%;
                  opacity: 0.45;
                }
                50% {
                  width: 100%;
                  opacity: 1;
                }
              }
            `}</style>
            <p>Carregando projetos...</p>
            <div className="relative h-16 w-52" aria-label="Carregando projetos">
              <img
                src="/assets/tec3-logo.svg"
                alt="Carregando"
                className="absolute inset-0 h-full w-full object-contain grayscale opacity-25"
              />
              <div
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ animation: `tec3LogoFillGrayProjects ${TEC3_LOADER_ANIMATION_SECONDS}s ease-in-out infinite` }}
              >
                <img
                  src="/assets/tec3-logo.svg"
                  alt="Carregando"
                  className="h-full w-52 object-contain grayscale opacity-80"
                />
              </div>
            </div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Nenhum projeto encontrado</div>
        ) : viewMode === 'table' ? (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-10 px-2">
                      <Button
                        size="icon"
                        variant={showOnlyFavorites ? 'default' : 'ghost'}
                        className="h-7 w-7"
                        onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                        data-testid="button-filter-favorites"
                        title={showOnlyFavorites ? 'Mostrando apenas favoritos' : 'Mostrar apenas favoritos'}
                      >
                        <Star className={`h-4 w-4 ${showOnlyFavorites ? 'fill-current' : ''}`} />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('name')}>
                        Nome {getSortIcon('name')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('code')}>
                        Código {getSortIcon('code')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('client')}>
                        Cliente {getSortIcon('client')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('status')}>
                        Status {getSortIcon('status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('hours')}>
                        Horas {getSortIcon('hours')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button type="button" variant="ghost" className="-ml-3 h-8 px-2 font-medium hover:bg-transparent" onClick={() => handleSort('value')}>
                        Valor {getSortIcon('value')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProjects.map((project) => (
                    <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
                      <TableCell className="px-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(event) => handleToggleFavorite(project.id, event)}
                          data-testid={`button-favorite-project-table-${project.id}`}
                          title={favoriteProjectsSet.has(project.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                        >
                          <Star className={`h-4 w-4 transition-colors ${favoriteProjectsSet.has(project.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} />
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{project.name}</TableCell>
                      <TableCell>{project.code}</TableCell>
                      <TableCell>{project.client?.razaoSocial || '-'}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs text-white ${statusColors[project.status]}`}>
                          {statusLabels[project.status] || project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{getProgressText(project)}</TableCell>
                      <TableCell>{formatCurrency(project.budgetValue)}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-view-project-table-${project.id}`}
                            onClick={() => openDetailsDialog(project.id)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Ver
                          </Button>
                          {project.status === 'planning' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              data-testid={`button-configure-project-table-${project.id}`}
                              onClick={() => openDetailsDialog(project.id, 'config')}
                            >
                              <SlidersHorizontal className="h-3 w-3 mr-1" />
                              Configurar
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-time-entries-table-${project.id}`}
                            onClick={() => openProjectTimeEntries(project.id)}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Horas
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-time-approvals-table-${project.id}`}
                            onClick={() => openProjectTimeApprovals(project.id)}
                          >
                            <ClipboardCheck className="h-3 w-3 mr-1" />
                            Aprovações
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-delete-project-table-${project.id}`}
                            onClick={() => {
                              setProjectToDelete(project);
                              setDeleteConfirmProjectInput('');
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {paginatedProjects.map((project) => (
              <Card key={project.id} data-testid={`card-project-${project.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {project.code}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{project.client?.razaoSocial}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(event) => handleToggleFavorite(project.id, event)}
                      data-testid={`button-favorite-project-card-${project.id}`}
                      title={favoriteProjectsSet.has(project.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                    >
                      <Star className={`h-4 w-4 transition-colors ${favoriteProjectsSet.has(project.id) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`} />
                    </Button>
                    <Badge className={`text-xs text-white ${statusColors[project.status]}`}>
                      {statusLabels[project.status] || project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progresso</span>
                      <span>{getProgressText(project)}</span>
                    </div>
                    <Progress value={getProgressPercent(project)} className="h-2" />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Valor:</span>{' '}
                      <span className="font-medium">{formatCurrency(project.budgetValue)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-view-project-${project.id}`}
                        onClick={() => openDetailsDialog(project.id)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                      {project.status === 'planning' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-configure-project-${project.id}`}
                          onClick={() => openDetailsDialog(project.id, 'config')}
                        >
                          <SlidersHorizontal className="h-3 w-3 mr-1" />
                          Configurar
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-time-entries-${project.id}`}
                        onClick={() => openProjectTimeEntries(project.id)}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Horas
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-time-approvals-${project.id}`}
                        onClick={() => openProjectTimeApprovals(project.id)}
                      >
                        <ClipboardCheck className="h-3 w-3 mr-1" />
                        Aprovações
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-delete-project-${project.id}`}
                        onClick={() => {
                          setProjectToDelete(project);
                          setDeleteConfirmProjectInput('');
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog
          open={Boolean(projectToDelete)}
          onOpenChange={(open) => {
            if (!open && !deleteMutation.isPending) {
              setProjectToDelete(null);
              setDeleteConfirmProjectInput('');
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O projeto “{projectToDelete?.code}” será removido.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <DangerZoneConfirm
              description="Para confirmar a exclusão, digite o código do projeto exatamente como abaixo:"
              expectedValue={projectToDelete?.code || ''}
              value={deleteConfirmProjectInput}
              onValueChange={setDeleteConfirmProjectInput}
              inputTestId={projectToDelete ? `input-confirm-delete-project-${projectToDelete.id}` : undefined}
            />

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={
                  deleteMutation.isPending ||
                  !projectToDelete ||
                  deleteConfirmProjectInput.trim() !== (projectToDelete.code || '')
                }
                onClick={() => {
                  if (!projectToDelete) return;
                  if (deleteConfirmProjectInput.trim() !== (projectToDelete.code || '')) return;
                  deleteMutation.mutate(projectToDelete.id);
                }}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {filteredProjects.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProjects.length)} de {filteredProjects.length}
              </span>
              <span className="mx-2">|</span>
              <span>Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-16 h-8" data-testid="select-projects-items-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="button-projects-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    data-testid={`button-projects-page-${pageNum}`}
                    className="w-8"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                data-testid="button-projects-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Dialog open={detailsOpen} onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setDetailsInitialSection('overview');
          }
        }}>
          <DialogContent className="flex w-[calc(100vw-1rem)] max-h-[90vh] flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] max-w-5xl dark:bg-[#102452] dark:border-white/10">
            <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6 dark:border-white/10 dark:bg-[#163266]">
              <DialogTitle className="text-xl font-semibold tracking-tight">Detalhes do Projeto</DialogTitle>
            </DialogHeader>

            {isLoadingSelectedProject ? (
              <div className="py-12 text-center text-muted-foreground">Carregando detalhes...</div>
            ) : selectedProject ? (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-5 sm:space-y-6 dark:bg-[#102452]">
                <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4 dark:bg-[#19386f] dark:border-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xl font-semibold leading-tight break-words">{selectedProject.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {selectedProject.code}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedProject.client?.razaoSocial || '-'}</p>
                    </div>
                    <Badge className={`text-xs text-white w-fit ${statusColors[selectedProject.status]}`}>
                      {statusLabels[selectedProject.status] || selectedProject.status}
                    </Badge>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3 dark:border-white/10 dark:bg-[#24457d]">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coordenador do Projeto</p>
                    <div className="mt-1 flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-primary" />
                      <p className="text-base font-semibold leading-tight">
                        {selectedProject.coordinator?.name || 'Não definido'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-5 dark:bg-[#14305f] dark:border-white/10">
                  <div className="rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,rgba(13,79,137,0.09)_0%,rgba(47,136,205,0.04)_100%)] p-4 sm:p-5 space-y-4 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(32,82,172,0.35)_0%,rgba(24,54,118,0.72)_55%,rgba(16,35,82,0.95)_100%)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary dark:bg-[#24457d] dark:border-white/10 dark:text-blue-100">
                          <Sparkles className="h-3.5 w-3.5" />
                          Onboarding do Projeto
                        </div>
                        <div>
                          <p className="text-lg font-semibold">{onboardingHeadline}</p>
                          <p className="text-sm text-muted-foreground">
                            {isLegacyTapMissingInExecution
                              ? 'Projeto já em execução com contexto histórico sem TAP registrado no sistema atual.'
                              : isLegacyOnboardingInferred
                                ? 'Projeto já em execução. O onboarding foi consolidado com base no histórico operacional.'
                              : 'Estruture o projeto em etapas, valide o TAP e conclua o setup antes da execução.'}
                          </p>
                          {isLegacyTapMissingInExecution ? (
                            <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <span>Contexto histórico</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                                    aria-label="Entenda o contexto histórico"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[320px] text-xs leading-relaxed">
                                  Este projeto já estava em execução quando o onboarding passou a ser rastreado no sistema. Por isso o TAP histórico pode não estar disponível, sem impacto na operação atual.
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:max-w-[320px] lg:justify-end">
                        <Badge variant="outline" className={onboardingStatusBadgeClassName}>TAP: {tapStatusPresentationLabel}</Badge>
                        <Badge variant="outline" className={onboardingStatusBadgeClassName}>Setup: {setupStatusPresentationLabel}</Badge>
                      </div>
                    </div>

                    <div className="rounded-xl border border-primary/15 bg-background/70 px-3 py-3 dark:border-white/10 dark:bg-[#112a57]">
                      <div className="mb-3 flex flex-col gap-1 text-xs uppercase tracking-wide text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>Fluxo de etapas</span>
                        <span>Etapa atual {currentOnboardingStepIndex + 1} de {onboardingItems.length || 3}</span>
                      </div>
                      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                        <div className="flex min-w-[560px] items-center sm:min-w-0">
                        {onboardingItems.map((item, index) => {
                          const isCurrent = index === currentOnboardingStepIndex;
                          const isComplete = item.complete;
                          const isPending = !isComplete && !isCurrent;

                          return (
                            <div key={`stepper-${item.title}`} className="flex min-w-[170px] flex-1 items-center sm:min-w-0">
                              <div className="group inline-flex min-w-0 items-center gap-2 text-left">
                                <span
                                  className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[11px] font-semibold ${isComplete
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : isCurrent
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border bg-background text-muted-foreground dark:border-white/20 dark:bg-[#173467]'
                                  }`}
                                >
                                  {index + 1}
                                </span>
                                <span className={`truncate text-[11px] font-medium sm:text-xs ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                                  <span className="sm:hidden">Etapa {index + 1}</span>
                                  <span className="hidden sm:inline">{item.title}</span>
                                </span>
                                <span className="sr-only">
                                  {item.title}
                                </span>
                              </div>

                              {index < onboardingItems.length - 1 ? (
                                <span
                                  className={`mx-2 h-[2px] flex-1 rounded-full ${index < currentOnboardingStepIndex
                                    ? 'bg-emerald-500/70'
                                    : 'bg-border dark:bg-white/15'
                                  }`}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                    <div ref={configurationSectionRef} className="rounded-xl border bg-card p-4 sm:p-5 space-y-4 dark:bg-[#183767] dark:border-white/10">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">Setup guiado</p>
                          <p className="text-xs text-muted-foreground">
                            Preencha os campos para transformar o projeto em operacional.
                          </p>
                        </div>
                      </div>

                      <form onSubmit={handleSetupSubmit} className="space-y-4">
                        <div className="space-y-4 rounded-xl border p-4 dark:border-white/10 dark:bg-[#102247]">
                          <div className="space-y-1">
                            <p className="text-base font-semibold">Configuração operacional</p>
                            <p className="text-sm text-muted-foreground">
                              Defina responsável, limite diário e aprovação de horas em uma única tela.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>Coordenador do Projeto</Label>
                            <Select
                              value={setupForm.coordinatorId || '__none__'}
                              onValueChange={(value) => setSetupForm((current) => ({ ...current, coordinatorId: value === '__none__' ? '' : value }))}
                              disabled={!canEditSetupCoordinator}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um coordenador" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Não definido</SelectItem>
                                {users.filter((user) => user.isActive).map((user) => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {isTapReadyEffective && (
                              <p className="text-xs text-muted-foreground">
                                Definido na geração do TAP e não pode ser alterado.
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="setup-daily-limit">Limite Diário (h)</Label>
                              <Input
                                id="setup-daily-limit"
                                type="number"
                                value={setupForm.dailyLimitHours}
                                onChange={(event) => setSetupForm((current) => ({ ...current, dailyLimitHours: event.target.value }))}
                                disabled={!canEditSetupAfterCompletion}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Exige Aprovação</Label>
                              <Select
                                value={setupForm.requiresApproval}
                                onValueChange={(value) => setSetupForm((current) => ({ ...current, requiresApproval: value }))}
                                disabled={!canEditSetupAfterCompletion}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">Sim</SelectItem>
                                  <SelectItem value="false">Não</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 rounded-xl border p-4 dark:border-white/10 dark:bg-[#102247]">
                          <div className="space-y-1">
                            <p className="text-base font-semibold">Revisão</p>
                            <p className="text-sm text-muted-foreground">
                              Confira os dados atuais antes de concluir o setup.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border bg-muted/30 p-3 dark:border-white/10 dark:bg-[#112a57]">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coordenador</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProject.coordinator?.name || 'Não definido'}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-3 dark:border-white/10 dark:bg-[#112a57]">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Limite diário</p>
                              <p className="mt-1 text-sm font-semibold">{setupForm.dailyLimitHours || '-'} h</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-3 dark:border-white/10 dark:bg-[#112a57]">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Aprovação</p>
                              <p className="mt-1 text-sm font-semibold">{setupForm.requiresApproval === 'true' ? 'Obrigatória' : 'Dispensada'}</p>
                            </div>
                            <div className="rounded-xl border bg-muted/30 p-3 dark:border-white/10 dark:bg-[#112a57]">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">TAP</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProjectTap?.title || 'Ainda não disponível'}</p>
                            </div>
                          </div>
                        </div>

                        {canSubmitSetup ? (
                          <div className="flex justify-end pt-1">
                            <Button
                              type="submit"
                              className="w-full sm:w-auto sm:min-w-[210px]"
                              disabled={
                                updateSetupMutation.isPending ||
                                completeSetupMutation.isPending ||
                                !canSubmitSetup
                              }
                            >
                              {updateSetupMutation.isPending || completeSetupMutation.isPending
                                ? 'Salvando...'
                                : isSetupCompletedEffective
                                  ? 'Salvar alterações do setup'
                                  : canCompleteSetup && !hasSetupChanges
                                    ? 'Concluir setup'
                                    : canCompleteSetup
                                      ? 'Salvar e concluir setup'
                                      : 'Salvar configuração'}
                            </Button>
                          </div>
                        ) : null}
                      </form>

                      <div className="flex flex-col gap-3 border-t pt-4">
                        {isSetupCompletedEffective ? (
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-[#183f44] dark:text-emerald-100">
                            {isLegacyOnboardingInferred
                              ? 'Setup consolidado automaticamente com base no histórico de execução já iniciado.'
                              : 'Setup concluído. O projeto está pronto para operação.'}
                          </div>
                        ) : null}

                        {isSetupMarkedCompleted ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-300/40 dark:bg-[#3a3018] dark:text-amber-100">
                            Após a conclusão do setup, somente administradores podem alterar esta configuração.
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <Button
                            type="button"
                            className="w-full sm:w-auto sm:min-w-[210px]"
                            disabled={
                              activateProjectMutation.isPending ||
                              isProjectExecutionStarted ||
                              !isSetupCompletedEffective
                            }
                            onClick={() => activateProjectMutation.mutate()}
                          >
                            {activateProjectMutation.isPending
                              ? 'Iniciando...'
                              : isProjectExecutionStarted
                                ? 'Projeto já iniciado'
                                : 'Iniciar projeto'}
                          </Button>
                        </div>
                      </div>

                      <div ref={teamSectionRef} className="space-y-4 border-t pt-4">
                        <div>
                          <p className="text-base font-semibold">Alocação da equipe</p>
                          <p className="text-xs text-muted-foreground">
                            Defina quais colaboradores estão autorizados a lançar horas neste projeto.
                          </p>
                        </div>

                        {!canManageTeamAllocation ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-300/40 dark:bg-[#3a3018] dark:text-amber-100">
                            Somente o coordenador do projeto ou administrador pode alterar a equipe alocada.
                          </div>
                        ) : null}

                        <div className="max-h-[240px] space-y-2 overflow-y-auto rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247]">
                          {teamAllocationCandidates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhum colaborador ativo disponível.</p>
                          ) : (
                            teamAllocationCandidates.map((candidate) => {
                              const checked = selectedTeamMemberIds.includes(candidate.id);
                              return (
                                <label
                                  key={candidate.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm dark:border-white/10"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{candidate.name}</p>
                                    <p className="truncate text-[11px] text-muted-foreground">{candidate.role}</p>
                                  </div>
                                  <Checkbox
                                    checked={checked}
                                    disabled={!canManageTeamAllocation || updateMembersMutation.isPending}
                                    onCheckedChange={() => toggleTeamMember(candidate.id)}
                                  />
                                </label>
                              );
                            })
                          )}
                        </div>

                        {canManageTeamAllocation && hasTeamAllocationChanges ? (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              className="w-full sm:w-auto sm:min-w-[210px]"
                              onClick={handleSaveTeamAllocation}
                              disabled={updateMembersMutation.isPending}
                            >
                              {updateMembersMutation.isPending ? 'Salvando equipe...' : 'Salvar equipe alocada'}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4 dark:bg-[#183767] dark:border-white/10">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold">TAP do projeto</p>
                          <p className="text-xs text-muted-foreground">
                            Visualize, imprima ou exporte o termo de abertura do projeto.
                          </p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-blue-300/18 dark:text-blue-100">
                          <FileText className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 dark:border-white/10 dark:bg-[#112a57]">
                        <div className="flex items-center gap-2">
                          <MailCheck className="h-4 w-4 text-primary" />
                          <p className="text-base font-semibold">{selectedProjectTap?.title || 'TAP ainda não disponível'}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Status</p>
                            <p className="font-medium">{tapStatusPresentationLabel}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Enviado em</p>
                            <p className="font-medium">{selectedProject.tapSentAt ? formatDate(selectedProject.tapSentAt) : '-'}</p>
                          </div>
                        </div>
                      </div>

                      <Collapsible open={tapDetailsOpen} onOpenChange={setTapDetailsOpen}>
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" className="w-full justify-between">
                            {tapDetailsOpen ? 'Ocultar detalhes do TAP' : 'Mostrar detalhes do TAP'}
                            {tapDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 pt-3">
                          <div className="rounded-xl border p-3 text-sm text-muted-foreground break-words dark:border-white/10 dark:bg-[#102247]">
                            {selectedProject.tapLastEmailError || 'Nenhum erro de envio registrado até o momento.'}
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247]">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Gerado em</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProject.tapGeneratedAt ? formatDate(selectedProject.tapGeneratedAt) : '-'}</p>
                            </div>
                            <div className="rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247]">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProjectTap?.payload?.client?.razaoSocial || selectedProject.client?.razaoSocial || '-'}</p>
                            </div>
                            <div className="rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247]">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Proposta origem</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProjectTap?.payload?.proposal?.code || '-'}</p>
                            </div>
                            <div className="rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247]">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Horas previstas</p>
                              <p className="mt-1 text-sm font-semibold">{selectedProjectTap?.payload?.project?.budgetHours ?? selectedProject.budgetHours ?? 0} h</p>
                            </div>
                            <div className="rounded-xl border p-3 dark:border-white/10 dark:bg-[#102247] sm:col-span-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor previsto</p>
                              <p className="mt-1 text-sm font-semibold">{formatCurrency(Number(selectedProjectTap?.payload?.project?.budgetValue ?? selectedProject.budgetValue ?? 0))}</p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button type="button" className="flex-1" variant="outline" onClick={() => setTapPreviewOpen(true)} disabled={!selectedProjectTap?.htmlContent}>
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar TAP
                        </Button>
                        <Button type="button" className="flex-1" variant="outline" onClick={handleTapPrint} disabled={!selectedProjectTap?.htmlContent}>
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                        </Button>
                      </div>
                      <Button type="button" className="w-full" onClick={handleTapDownload} disabled={!selectedProjectTap?.htmlContent}>
                        <Download className="mr-2 h-4 w-4" />
                        Baixar HTML do TAP
                      </Button>
                    </div>
                  </div>

                  <Dialog open={tapPreviewOpen} onOpenChange={setTapPreviewOpen}>
                    <DialogContent className="flex h-[90vh] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
                      <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle>Visualização do TAP</DialogTitle>
                        <DialogDescription>
                          Pré-visualização do termo de abertura gerado para o projeto {selectedProject.code}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 min-h-0 bg-slate-100">
                        {normalizedSelectedProjectTapHtml ? (
                          <iframe
                            key={`${selectedProject.id}-${selectedProjectTap?.id || 'tap'}-${tapPreviewOpen ? 'open' : 'closed'}`}
                            title="Pré-visualização do TAP"
                            srcDoc={normalizedSelectedProjectTapHtml}
                            className="h-full w-full border-0 bg-white"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            TAP ainda não disponível para visualização.
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-muted-foreground">Início</p>
                      <p className="font-medium">{formatDate(selectedProject.startDate)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-muted-foreground">Encerramento</p>
                      <p className="font-medium">{formatDate(selectedProject.endDate)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-muted-foreground">Limite Diário</p>
                      <p className="font-medium">{selectedProject.dailyLimitHours || 0} h</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-muted-foreground">Valor Orçado</p>
                      <p className="font-medium">{formatCurrency(selectedProject.budgetValue || 0)}</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Horas Orçadas</p>
                    <p className="font-medium">{selectedProject.budgetHours || 0} h</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-muted-foreground">Progresso Atual</p>
                    <p className="font-medium">
                      {hasProjectExecutionStarted(selectedProject) ? getProgressText(selectedProject) : 'Aguardando início'}
                    </p>
                  </div>
                </div>

                {hasProjectExecutionStarted(selectedProject) ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Resumo de Horas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-muted-foreground">Horas Lançadas</p>
                          <p className="font-semibold">{formatHoursWithUnit(Number(selectedProject.timeSummary?.launchedHours || 0))}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-muted-foreground">Horas Aprovadas</p>
                          <p className="font-semibold">{formatHoursWithUnit(Number(selectedProject.timeSummary?.approvedHours || 0))}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-muted-foreground">Pendentes de Aprovação</p>
                          <p className="font-semibold">{formatHoursWithUnit(Number(selectedProject.timeSummary?.pendingApprovalHours || 0))}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-muted-foreground">Horas Rejeitadas</p>
                          <p className="font-semibold">{formatHoursWithUnit(Number(selectedProject.timeSummary?.rejectedHours || 0))}</p>
                        </CardContent>
                      </Card>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lançamentos: {selectedProject.timeSummary?.entriesCount || 0} · Aprovados: {selectedProject.timeSummary?.approvedEntriesCount || 0} · Pendentes: {selectedProject.timeSummary?.pendingEntriesCount || 0} · Rejeitados: {selectedProject.timeSummary?.rejectedEntriesCount || 0}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    O projeto ainda não iniciou a execução. As métricas de horas e progresso detalhado aparecerão após a ativação e os primeiros lançamentos.
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Descrição</p>
                  <p className="font-medium whitespace-pre-wrap">{selectedProject.description || '-'}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Horas por Profissional / Perfil</p>
                  {hasProjectExecutionStarted(selectedProject) && selectedProject.hoursByCollaborator && selectedProject.hoursByCollaborator.length > 0 ? (
                    <div className="space-y-2">
                      <div className="sm:hidden flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setShowFullColumnsMobile((prev) => !prev)}
                        >
                          {showFullColumnsMobile ? 'Visão compacta' : 'Ver completo'}
                        </Button>
                      </div>
                      <div className="border rounded-md overflow-x-auto bg-card">
                      <Table className="min-w-[760px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Profissional</TableHead>
                            <TableHead>Perfil</TableHead>
                            <TableHead>Lançadas</TableHead>
                            <TableHead>Aprovadas</TableHead>
                            <TableHead className={showFullColumnsMobile ? '' : 'hidden sm:table-cell'}>Pendentes</TableHead>
                            <TableHead className={showFullColumnsMobile ? '' : 'hidden md:table-cell'}>Rejeitadas</TableHead>
                            <TableHead className="text-right">Lanç.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProject.hoursByCollaborator.map((row) => (
                            <TableRow key={row.collaboratorId}>
                              <TableCell>
                                <div className="font-medium">{row.collaboratorName}</div>
                              </TableCell>
                              <TableCell>{row.profile || '-'}</TableCell>
                              <TableCell>{formatHoursWithUnit(Number(row.launchedHours || 0))}</TableCell>
                              <TableCell>{formatHoursWithUnit(Number(row.approvedHours || 0))}</TableCell>
                              <TableCell className={showFullColumnsMobile ? '' : 'hidden sm:table-cell'}>{formatHoursWithUnit(Number(row.pendingApprovalHours || 0))}</TableCell>
                              <TableCell className={showFullColumnsMobile ? '' : 'hidden md:table-cell'}>{formatHoursWithUnit(Number(row.rejectedHours || 0))}</TableCell>
                              <TableCell className="text-right">{row.entriesCount || 0}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    </div>
                  ) : hasProjectExecutionStarted(selectedProject) ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                      Nenhuma hora lançada para este projeto.
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                      A distribuição por profissional aparecerá quando houver início da execução e lançamento de horas.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">Projeto não encontrado.</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
