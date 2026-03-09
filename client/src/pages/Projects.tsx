import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, Clock, LayoutGrid, List, UserRound, Filter, SlidersHorizontal, X, Calendar, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { projectsApi, clientsApi, Project, Client } from '@/lib/api';
import { TEC3_LOADER_ANIMATION_SECONDS, TEC3_LOADER_MIN_VISIBLE_MS } from '@/lib/loader';

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

type ViewMode = 'cards' | 'table';
type SortOrder = 'recent' | 'oldest' | 'name_asc' | 'value_desc';

export default function Projects() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [hoursMin, setHoursMin] = useState('');
  const [hoursMax, setHoursMax] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    clientId: '',
    budgetHours: '',
    budgetValue: '',
    dailyLimitHours: '8',
  });

  useEffect(() => {
    const savedViewMode = localStorage.getItem('projectsViewMode') as ViewMode;
    if (savedViewMode && (savedViewMode === 'cards' || savedViewMode === 'table')) {
      setViewMode(savedViewMode);
    }

    const savedSortOrder = localStorage.getItem('projectsSortOrder') as SortOrder;
    if (savedSortOrder && (savedSortOrder === 'recent' || savedSortOrder === 'oldest' || savedSortOrder === 'name_asc' || savedSortOrder === 'value_desc')) {
      setSortOrder(savedSortOrder);
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('projectsViewMode', mode);
  };

  const handleSortOrderChange = (order: SortOrder) => {
    setSortOrder(order);
    localStorage.setItem('projectsSortOrder', order);
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

  const { data: selectedProject, isLoading: isLoadingSelectedProject } = useQuery<Project>({
    queryKey: ['/api/projects', selectedProjectId],
    queryFn: () => projectsApi.getOne(selectedProjectId as string),
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

  const openDetailsDialog = (projectId: string) => {
    setSelectedProjectId(projectId);
    setShowFullColumnsMobile(false);
    setDetailsOpen(true);
  };

  const openProjectTimeEntries = (projectId: string) => {
    setLocation(`/time-entries?projectId=${projectId}`);
  };

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

      const statusMatch = statusFilters.length === 0 || statusFilters.includes(p.status);
      const clientMatch = !clientFilter || p.clientId === clientFilter;

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

      return searchMatch && statusMatch && clientMatch && dateMatch && valueMatch && hoursMatch;
    });

    return filtered.sort((a, b) => {
      if (sortOrder === 'value_desc') {
        return Number(b.budgetValue || 0) - Number(a.budgetValue || 0);
      }

      if (sortOrder === 'name_asc') {
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      }

      const dateA = Number.isNaN(new Date(a.createdAt).getTime()) ? 0 : new Date(a.createdAt).getTime();
      const dateB = Number.isNaN(new Date(b.createdAt).getTime()) ? 0 : new Date(b.createdAt).getTime();

      if (sortOrder === 'oldest') {
        return dateA - dateB;
      }

      return dateB - dateA;
    });

  }, [projects, search, statusFilters, clientFilter, dateFrom, dateTo, valueMin, valueMax, hoursMin, hoursMax, sortOrder]);

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
                  <Select value={sortOrder} onValueChange={(value) => handleSortOrderChange(value as SortOrder)}>
                    <SelectTrigger className="w-44" data-testid="select-projects-sort-order">
                      <SelectValue placeholder="Ordenar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Mais recente</SelectItem>
                      <SelectItem value="oldest">Mais antigo</SelectItem>
                      <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                      <SelectItem value="value_desc">Maior valor</SelectItem>
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
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Horas</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProjects.map((project) => (
                    <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
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
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-time-entries-table-${project.id}`}
                            onClick={() => openProjectTimeEntries(project.id)}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Horas
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
                  <Badge className={`text-xs text-white ${statusColors[project.status]}`}>
                    {statusLabels[project.status] || project.status}
                  </Badge>
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
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-time-entries-${project.id}`}
                        onClick={() => openProjectTimeEntries(project.id)}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Horas
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

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

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-5xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Detalhes do Projeto</DialogTitle>
            </DialogHeader>

            {isLoadingSelectedProject ? (
              <div className="py-12 text-center text-muted-foreground">Carregando detalhes...</div>
            ) : selectedProject ? (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
                <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold leading-tight break-words">{selectedProject.name}</h3>
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

                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Coordenador do Projeto</p>
                    <div className="mt-1 flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold leading-tight">
                        {selectedProject.coordinator?.name || 'Não definido'}
                      </p>
                    </div>
                  </div>
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
                    <p className="font-medium">{getProgressText(selectedProject)}</p>
                  </div>
                </div>

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

                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Descrição</p>
                  <p className="font-medium whitespace-pre-wrap">{selectedProject.description || '-'}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Horas por Profissional / Perfil</p>
                  {selectedProject.hoursByCollaborator && selectedProject.hoursByCollaborator.length > 0 ? (
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
                  ) : (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground text-center">
                      Nenhuma hora lançada para este projeto.
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
