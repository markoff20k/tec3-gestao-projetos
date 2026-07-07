import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSaturday,
  isSunday,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as DateCalendar } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUpload } from '@/hooks/use-upload';
import { costCentersApi, CostCenter, projectsApi, Project, TimeEntry, TimeEntryAttachment } from '@/lib/api';
import { cn } from '@/lib/utils';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const statusBadgeClass: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
};

type ViewMode = 'week' | 'month';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';
type EntryMode = 'quick' | 'planner';
const PROJECT_COST_CENTER_OPTION = 'project';

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function getEntryDate(entry: TimeEntry) {
  return parseISO(entry.entryDate);
}

function getEntryDateKey(entry: TimeEntry) {
  const parsedDate = getEntryDate(entry);
  if (!Number.isNaN(parsedDate.getTime())) {
    return dateKey(parsedDate);
  }
  return String(entry.entryDate || '').slice(0, 10);
}

function buildDaySummary(entries: TimeEntry[]) {
  const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const approvedHours = entries
    .filter((entry) => entry.status === 'approved')
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;

  return {
    totalHours,
    approvedHours,
    pendingCount,
    entriesCount: entries.length,
  };
}

function normalizeProjectStatus(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function isProjectLaunchable(project: Project) {
  const status = normalizeProjectStatus(project.status);
  return status === 'in_progress' || status === 'active' || status === 'em_andamento';
}

export default function TimeEntries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();
  const [entryMode, setEntryMode] = useState<EntryMode>('quick');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hoursValue, setHoursValue] = useState('');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [attachments, setAttachments] = useState<TimeEntryAttachment[]>([]);
  const [removingAttachmentPath, setRemovingAttachmentPath] = useState<string | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickHoursByCell, setQuickHoursByCell] = useState<Record<string, string>>({});
  const [quickDescriptionsByProject, setQuickDescriptionsByProject] = useState<Record<string, string>>({});
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
    queryFn: () => costCentersApi.getAll(),
  });

  useEffect(() => {
    const queryString = location.includes('?') ? location.split('?')[1] : '';
    if (!queryString) return;

    const params = new URLSearchParams(queryString);
    const projectIdFromQuery = params.get('projectId') || params.get('projectid');
    if (projectIdFromQuery) {
      setSelectedProjectId(projectIdFromQuery);
    }
  }, [location]);

  const { data: timeEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['/api/projects', selectedProjectId, 'time-entries'],
    queryFn: () => projectsApi.getTimeEntries(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const canLaunchHours = !!selectedProject && isProjectLaunchable(selectedProject);
  const hasHoursValue = (Number.parseFloat(hoursValue) || 0) > 0;
  const hasDescriptionValue = descriptionValue.trim().length > 0;
  const shouldHighlightHoursField = Boolean(selectedProject && canLaunchHours && !hasHoursValue);
  const shouldHighlightDescriptionField = Boolean(selectedProject && canLaunchHours && !hasDescriptionValue);
  const pendingRequiredFieldsCount = Number(shouldHighlightHoursField) + Number(shouldHighlightDescriptionField);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((projectA, projectB) => {
      const isProjectAActive = isProjectLaunchable(projectA);
      const isProjectBActive = isProjectLaunchable(projectB);

      if (isProjectAActive !== isProjectBActive) {
        return isProjectAActive ? -1 : 1;
      }

      return projectA.name.localeCompare(projectB.name, 'pt-BR');
    });
  }, [projects]);

  const launchableProjects = useMemo(
    () => sortedProjects.filter((project) => isProjectLaunchable(project)),
    [sortedProjects]
  );

  const availableCostCenters = useMemo(
    () => costCenters.filter((costCenter) => costCenter.isActive),
    [costCenters]
  );

  useEffect(() => {
    if (!selectedProjectId) return;
    if (projects.some((project) => project.id === selectedProjectId)) return;
    setSelectedProjectId('');
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedCostCenterId) return;
    if (availableCostCenters.some((costCenter) => costCenter.id === selectedCostCenterId)) return;
    setSelectedCostCenterId('');
  }, [availableCostCenters, selectedCostCenterId]);

  useEffect(() => {
    if (entryMode !== 'quick') return;
    if (viewMode === 'week') return;
    setViewMode('week');
  }, [entryMode, viewMode]);

  const filteredEntries = useMemo(
    () => timeEntries.filter((entry) => (statusFilter === 'all' ? true : entry.status === statusFilter)),
    [statusFilter, timeEntries]
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    filteredEntries.forEach((entry) => {
      const key = getEntryDateKey(entry);
      map.set(key, [...(map.get(key) ?? []), entry]);
    });
    return map;
  }, [filteredEntries]);

  const allEntriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    timeEntries.forEach((entry) => {
      const key = getEntryDateKey(entry);
      map.set(key, [...(map.get(key) ?? []), entry]);
    });
    return map;
  }, [timeEntries]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'week') {
      return eachDayOfInterval({
        start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
        end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
      });
    }

    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 }),
    });
  }, [selectedDate, viewMode]);

  const quickWeekDates = useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(selectedDate, { weekStartsOn: 1 }),
      end: endOfWeek(selectedDate, { weekStartsOn: 1 }),
    }),
    [selectedDate]
  );

  const quickFilteredProjects = useMemo(() => {
    const query = quickSearch.trim().toLowerCase();
    if (!query) return launchableProjects;

    return launchableProjects.filter((project) =>
      `${project.code} ${project.name}`.toLowerCase().includes(query)
    );
  }, [launchableProjects, quickSearch]);

  const quickTotalHours = useMemo(
    () => Object.values(quickHoursByCell).reduce((sum, raw) => sum + (Number.parseFloat(raw.replace(',', '.')) || 0), 0),
    [quickHoursByCell]
  );

  const quickFilledCells = useMemo(
    () => Object.values(quickHoursByCell).filter((raw) => (Number.parseFloat(raw.replace(',', '.')) || 0) > 0).length,
    [quickHoursByCell]
  );

  const visibleEntries = useMemo(
    () => visibleDates.flatMap((date) => entriesByDate.get(dateKey(date)) ?? []),
    [entriesByDate, visibleDates]
  );

  const periodSummary = useMemo(() => buildDaySummary(visibleEntries), [visibleEntries]);

  const selectedDateEntries = useMemo(() => {
    const key = dateKey(selectedDate);
    return (entriesByDate.get(key) ?? []).sort((entryA, entryB) => Number(entryB.hours) - Number(entryA.hours));
  }, [entriesByDate, selectedDate]);

  const selectedDateSummary = useMemo(() => buildDaySummary(selectedDateEntries), [selectedDateEntries]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<TimeEntry>) => projectsApi.createTimeEntry(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId, 'time-entries'] });
      toast({ title: 'Horas lançadas com sucesso', variant: 'success' });
      setHoursValue('');
      setSelectedCostCenterId('');
      setDescriptionValue('');
      setAttachments([]);
    },
    onError: (error) => {
      toast({ title: 'Erro ao lançar horas', description: error.message, variant: 'destructive' });
    },
  });

  const goToPreviousPeriod = () => {
    setSelectedDate((current) => (viewMode === 'week' ? subWeeks(current, 1) : subMonths(current, 1)));
  };

  const goToNextPeriod = () => {
    setSelectedDate((current) => (viewMode === 'week' ? addWeeks(current, 1) : addMonths(current, 1)));
  };

  const { uploadFile, deleteUploadedFile, isUploading, progress } = useUpload({
    onError: (error) => {
      toast({ title: 'Erro ao anexar arquivo', description: error.message, variant: 'destructive' });
    },
  });

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const nextAttachments: TimeEntryAttachment[] = [];

    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file);
      if (!uploaded) continue;

      nextAttachments.push({
        name: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
        size: uploaded.metadata.size,
      });
    }

    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments]);
      toast({
        title: nextAttachments.length === 1 ? 'Arquivo anexado' : 'Arquivos anexados',
        description: `${nextAttachments.length} arquivo(s) pronto(s) para o lançamento.`,
        variant: 'success',
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (objectPath: string) => {
    setRemovingAttachmentPath(objectPath);

    try {
      await deleteUploadedFile(objectPath);
      setAttachments((current) => current.filter((item) => item.objectPath !== objectPath));
    } catch (error) {
      toast({
        title: 'Erro ao remover anexo',
        description: error instanceof Error ? error.message : 'Não foi possível remover o anexo.',
        variant: 'destructive',
      });
    } finally {
      setRemovingAttachmentPath((current) => (current === objectPath ? null : current));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedProject) {
      toast({ title: 'Selecione um projeto', variant: 'destructive' });
      return;
    }

    if (!isProjectLaunchable(selectedProject)) {
      toast({
        title: 'Projeto não permite lançamento',
        description: 'Somente projetos ativos permitem lançamento de horas.',
        variant: 'destructive',
      });
      return;
    }

    const requestedHours = parseFloat(hoursValue) || 0;
    const key = dateKey(selectedDate);
    const projectDailyLimit = selectedProject.dailyLimitHours;

    if (projectDailyLimit && requestedHours > 0) {
      const hoursAlreadyLaunchedInDay = (allEntriesByDate.get(key) ?? []).reduce(
        (sum, entry) => sum + Number(entry.hours || 0),
        0
      );

      if (hoursAlreadyLaunchedInDay + requestedHours > projectDailyLimit) {
        toast({
          title: 'Limite diário excedido',
          description: `Limite diário do projeto: ${projectDailyLimit}h. Já lançado no dia: ${hoursAlreadyLaunchedInDay}h.`,
          variant: 'destructive',
        });
        return;
      }
    }

    createMutation.mutate({
      projectId: selectedProjectId,
      collaboratorId: '',
      costCenterId: selectedCostCenterId || null,
      entryDate: key,
      hours: requestedHours,
      description: descriptionValue,
      attachments,
    });
  };

  const setQuickCellHours = (projectId: string, entryDate: string, value: string) => {
    const key = `${projectId}__${entryDate}`;
    setQuickHoursByCell((current) => {
      const next = { ...current };
      if (!value || Number.parseFloat(value.replace(',', '.')) <= 0) {
        delete next[key];
        return next;
      }
      next[key] = value;
      return next;
    });
  };

  const getQuickCellHours = (projectId: string, entryDate: string) => {
    const key = `${projectId}__${entryDate}`;
    return quickHoursByCell[key] || '';
  };

  const getQuickProjectHours = (projectId: string) => {
    const prefix = `${projectId}__`;
    return Object.entries(quickHoursByCell).reduce((sum, [key, raw]) => {
      if (!key.startsWith(prefix)) return sum;
      return sum + (Number.parseFloat(raw.replace(',', '.')) || 0);
    }, 0);
  };

  const handleQuickSubmit = async () => {
    if (isQuickSaving) return;

    const entries = Object.entries(quickHoursByCell)
      .map(([key, rawHours]) => {
        const [projectId, entryDate] = key.split('__');
        const hours = Number.parseFloat(rawHours.replace(',', '.')) || 0;
        return { key, projectId, entryDate, hours };
      })
      .filter((entry) => entry.projectId && entry.entryDate && entry.hours > 0);

    if (entries.length === 0) {
      toast({ title: 'Preencha ao menos uma célula com horas', variant: 'destructive' });
      return;
    }

    const projectMap = new Map(launchableProjects.map((project) => [project.id, project]));

    const invalidByLimit = entries.find((entry) => {
      const project = projectMap.get(entry.projectId);
      if (!project?.dailyLimitHours) return false;
      return entry.hours > project.dailyLimitHours;
    });

    if (invalidByLimit) {
      const project = projectMap.get(invalidByLimit.projectId);
      toast({
        title: 'Limite diário excedido',
        description: `${project?.code || 'Projeto'} permite no máximo ${project?.dailyLimitHours}h por dia.`,
        variant: 'destructive',
      });
      return;
    }

    const projectsWithEntries = Array.from(new Set(entries.map((entry) => entry.projectId)));
    const missingDescriptionProjectId = projectsWithEntries.find((projectId) => !(quickDescriptionsByProject[projectId] || '').trim());

    if (missingDescriptionProjectId) {
      const project = projectMap.get(missingDescriptionProjectId);
      toast({
        title: 'Descrição obrigatória',
        description: `Preencha a descrição do projeto ${project?.code || ''} para salvar em lote.`,
        variant: 'destructive',
      });
      return;
    }

    setIsQuickSaving(true);

    const payloads = entries.map((entry) => ({
      key: entry.key,
      projectId: entry.projectId,
      request: {
        projectId: entry.projectId,
        collaboratorId: '',
        costCenterId: null,
        entryDate: entry.entryDate,
        hours: entry.hours,
        description: (quickDescriptionsByProject[entry.projectId] || '').trim(),
        attachments: [],
      },
    }));

    const results = await Promise.allSettled(
      payloads.map((payload) => projectsApi.createTimeEntry(payload.request))
    );

    const successfulKeys = new Set<string>();
    const successfulProjects = new Set<string>();
    let failedCount = 0;

    results.forEach((result, index) => {
      const payload = payloads[index];
      if (result.status === 'fulfilled') {
        successfulKeys.add(payload.key);
        successfulProjects.add(payload.projectId);
      } else {
        failedCount += 1;
      }
    });

    if (successfulProjects.size > 0) {
      await Promise.all(
        Array.from(successfulProjects).map((projectId) =>
          queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'time-entries'] })
        )
      );

      setQuickHoursByCell((current) => {
        const next = { ...current };
        successfulKeys.forEach((key) => {
          delete next[key];
        });
        return next;
      });
    }

    const successCount = successfulKeys.size;

    if (successCount > 0 && failedCount === 0) {
      toast({
        title: 'Lançamentos salvos com sucesso',
        description: `${successCount} lançamento(s) enviado(s).`,
        variant: 'success',
      });
    } else if (successCount > 0 && failedCount > 0) {
      toast({
        title: 'Lançamento parcial concluído',
        description: `${successCount} salvo(s) e ${failedCount} com erro.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Não foi possível salvar os lançamentos',
        variant: 'destructive',
      });
    }

    setIsQuickSaving(false);
  };

  const plannerTitle =
    viewMode === 'week'
      ? `${format(visibleDates[0], "dd 'de' MMM", { locale: ptBR })} - ${format(visibleDates[visibleDates.length - 1], "dd 'de' MMM", { locale: ptBR })}`
      : format(selectedDate, 'MMMM yyyy', { locale: ptBR });

  const quickPlannerTitle = `${format(quickWeekDates[0], "dd 'de' MMM", { locale: ptBR })} - ${format(quickWeekDates[quickWeekDates.length - 1], "dd 'de' MMM", { locale: ptBR })}`;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Lançamento de Horas</h1>
            <p className="text-muted-foreground">
              {entryMode === 'quick'
                ? 'Projetos já listados para lançamento em lote por semana.'
                : 'Planeje a semana ou o mês e aponte horas direto no dia selecionado.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
              <Button
                type="button"
                variant={entryMode === 'quick' ? 'default' : 'ghost'}
                className="h-8 px-4"
                onClick={() => setEntryMode('quick')}
                data-testid="button-time-entries-mode-quick"
              >
                Lançamento rápido
              </Button>
              <Button
                type="button"
                variant={entryMode === 'planner' ? 'default' : 'ghost'}
                className="h-8 px-4"
                onClick={() => setEntryMode('planner')}
                data-testid="button-time-entries-mode-planner"
              >
                Planner detalhado
              </Button>
            </div>

            <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-sm">
              <Button
                type="button"
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                className="h-8 px-4"
                onClick={() => setViewMode('week')}
                data-testid="button-time-entries-week-view"
                disabled={entryMode === 'quick'}
              >
                <CalendarRange className="mr-2 h-4 w-4" />
                Semana
              </Button>
              <Button
                type="button"
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                className="h-8 px-4"
                onClick={() => setViewMode('month')}
                data-testid="button-time-entries-month-view"
                disabled={entryMode === 'quick'}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Mês
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => setSelectedDate(new Date())}>
              Hoje
            </Button>
          </div>
        </div>

        {entryMode === 'quick' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base">Lançamento rápido da semana</CardTitle>
                <p className="text-sm text-muted-foreground">Preencha as horas por projeto e dia. Um clique salva tudo.</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center rounded-lg border border-border bg-background shadow-sm">
                  <Button type="button" variant="ghost" size="icon" onClick={goToPreviousPeriod}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[220px] px-3 text-center text-sm font-semibold capitalize text-foreground">
                    {quickPlannerTitle}
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={goToNextPeriod}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Button type="button" variant="outline" onClick={() => setSelectedDate(new Date())}>
                  Hoje
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Projetos listados</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{quickFilteredProjects.length}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Células preenchidas</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{quickFilledCells}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-muted/20 shadow-none">
                  <CardContent className="p-4">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Total da semana</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{quickTotalHours.toFixed(1)}h</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full max-w-md">
                  <Input
                    value={quickSearch}
                    onChange={(event) => setQuickSearch(event.target.value)}
                    placeholder="Buscar projeto por código ou nome..."
                    className="h-10"
                    data-testid="input-quick-time-search"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Descrição é obrigatória por projeto com horas preenchidas.</p>
              </div>

              {quickFilteredProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
                  Nenhum projeto ativo encontrado para lançamento rápido.
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-background">
                  <div className="overflow-auto">
                    <div className="min-w-[1180px]">
                      <div className="grid grid-cols-[280px_repeat(7,110px)_120px_320px] border-b border-border bg-muted/30 px-3 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        <div>Projeto</div>
                        {quickWeekDates.map((date) => (
                          <div key={`quick-head-${dateKey(date)}`} className="text-center">
                            {format(date, 'EEE dd', { locale: ptBR })}
                          </div>
                        ))}
                        <div className="text-center">Total</div>
                        <div>Descrição</div>
                      </div>

                      {quickFilteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className="grid grid-cols-[280px_repeat(7,110px)_120px_320px] items-center gap-0 border-b border-border/70 px-3 py-3 last:border-b-0"
                        >
                          <div className="pr-3">
                            <p className="truncate text-sm font-semibold text-foreground">{project.code}</p>
                            <p className="truncate text-xs text-muted-foreground">{project.name}</p>
                          </div>

                          {quickWeekDates.map((date) => {
                            const entryDate = dateKey(date);
                            return (
                              <div key={`quick-cell-${project.id}-${entryDate}`} className="px-1">
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  max="24"
                                  value={getQuickCellHours(project.id, entryDate)}
                                  onChange={(event) => setQuickCellHours(project.id, entryDate, event.target.value)}
                                  className="h-9 text-center"
                                  data-testid={`input-quick-hours-${project.id}-${entryDate}`}
                                />
                              </div>
                            );
                          })}

                          <div className="text-center text-sm font-semibold text-foreground">
                            {getQuickProjectHours(project.id).toFixed(1)}h
                          </div>

                          <div className="pl-3">
                            <Input
                              value={quickDescriptionsByProject[project.id] || ''}
                              onChange={(event) =>
                                setQuickDescriptionsByProject((current) => ({
                                  ...current,
                                  [project.id]: event.target.value,
                                }))
                              }
                              placeholder="Descrição única para os lançamentos deste projeto"
                              className="h-9"
                              data-testid={`input-quick-description-${project.id}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Use valores como 0.5, 1, 2.5 ou 8. O envio mantém os campos com erro para correção rápida.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setQuickHoursByCell({})}
                    disabled={isQuickSaving}
                  >
                    Limpar grade
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleQuickSubmit()}
                    disabled={isQuickSaving || quickFilledCells === 0}
                    data-testid="button-save-quick-time-entries"
                  >
                    {isQuickSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Salvar lançamentos da semana
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
        <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(290px,320px)] lg:items-start">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="block">Projeto</Label>
                    <Popover open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={projectFilterOpen}
                          data-testid="select-filter-project"
                          className={cn(
                            'h-11 w-full justify-between',
                            !selectedProject && 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/15'
                          )}
                        >
                          <span className="truncate text-left">
                            {selectedProject
                              ? `${selectedProject.code} · ${selectedProject.name}`
                              : 'Selecione um projeto'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(92vw,44rem)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar por código ou nome..." />
                          <CommandList className="max-h-[280px]">
                            <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                            <CommandGroup>
                              {launchableProjects.map((project) => {
                                const isSelected = selectedProjectId === project.id;

                                return (
                                  <CommandItem
                                    key={project.id}
                                    value={`${project.code} ${project.name}`}
                                    onSelect={() => {
                                      setSelectedProjectId(project.id);
                                      setProjectFilterOpen(false);
                                    }}
                                    className="items-start data-[selected=true]:bg-primary/20 data-[selected=true]:text-foreground [&_[data-project-name]]:opacity-80 data-[selected=true]:[&_[data-project-name]]:opacity-100"
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 mt-0.5 h-4 w-4 shrink-0',
                                        isSelected ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{project.code}</p>
                                      <p data-project-name className="truncate text-xs">{project.name}</p>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Apenas projetos ativos ou em andamento aparecem para apontamento de horas.
                    </p>

                    {!selectedProject ? (
                      <div className="rounded-xl border border-primary/35 bg-primary/5 p-4">
                        <p className="text-sm font-semibold text-primary">Selecione um projeto para começar o apontamento</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Depois de selecionar o projeto, os indicadores e o formulário de lançamento serão liberados.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {selectedProject ? (
                    <div className="grid gap-3 md:grid-cols-4">
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Período</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{periodSummary.totalHours.toFixed(1)}h</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Aprovadas</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{periodSummary.approvedHours.toFixed(1)}h</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Pendentes</p>
                          <p className="mt-2 text-2xl font-semibold text-foreground">{periodSummary.pendingCount}</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/60 bg-muted/20 shadow-none">
                        <CardContent className="p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Status</p>
                          <p className={cn('mt-2 text-base font-semibold', canLaunchHours ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300')}>
                            {canLaunchHours ? 'Lançamento permitido' : 'Projeto bloqueado'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : null}
                </div>

                <Card className="overflow-hidden border-border/60 bg-muted/10 shadow-none">
                  <CardContent className="flex justify-center p-2">
                    <DateCalendar
                      mode="single"
                      locale={ptBR}
                      selected={selectedDate}
                      month={selectedDate}
                      onMonthChange={setSelectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      className="mx-auto w-full max-w-[296px] p-2"
                    />
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Apontamento do dia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProject ? (
                <>
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Dia selecionado</p>
                        <h2 className="mt-1 text-lg font-semibold text-foreground">
                          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                        </h2>
                      </div>
                      {isToday(selectedDate) && <Badge variant="secondary">Hoje</Badge>}
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border bg-background px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Lançadas</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{selectedDateSummary.totalHours.toFixed(1)}h</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Entradas</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{selectedDateSummary.entriesCount}</p>
                      </div>
                      <div className="rounded-lg border border-border bg-background px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Limite</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{selectedProject.dailyLimitHours ? `${selectedProject.dailyLimitHours}h` : 'Livre'}</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                {pendingRequiredFieldsCount > 0 ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                    {pendingRequiredFieldsCount === 2
                      ? 'Preencha os campos obrigatórios destacados: Horas e Descrição das atividades.'
                      : shouldHighlightHoursField
                        ? 'Falta preencher o campo obrigatório: Horas.'
                        : 'Falta preencher o campo obrigatório: Descrição das atividades.'}
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="time-entry-hours" className={cn(shouldHighlightHoursField && 'font-semibold text-primary')}>
                      Horas *
                    </Label>
                    <Input
                      id="time-entry-hours"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      value={hoursValue}
                      onChange={(event) => setHoursValue(event.target.value)}
                      data-testid="input-time-entry-hours"
                      placeholder="Ex.: 4"
                      className={cn(shouldHighlightHoursField && 'border-primary/40 bg-primary/5 focus-visible:ring-primary/30')}
                      disabled={!selectedProjectId || !canLaunchHours}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Centro de custo</Label>
                    <Select
                      value={selectedCostCenterId || PROJECT_COST_CENTER_OPTION}
                      onValueChange={(value) =>
                        setSelectedCostCenterId(value === PROJECT_COST_CENTER_OPTION ? '' : value)
                      }
                      disabled={!selectedProjectId || !canLaunchHours}
                    >
                      <SelectTrigger data-testid="select-time-entry-cost-center">
                        <SelectValue placeholder="Projeto (centro de custo próprio)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PROJECT_COST_CENTER_OPTION}>
                          {selectedProject ? `Projeto (${selectedProject.code})` : 'Projeto (centro de custo próprio)'}
                        </SelectItem>
                        {availableCostCenters.map((costCenter) => (
                          <SelectItem key={costCenter.id} value={costCenter.id}>
                            {costCenter.code} · {costCenter.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status do fluxo</Label>
                    <div className="flex h-10 items-center rounded-md border border-border bg-muted/20 px-3 text-sm text-muted-foreground">
                      {selectedProject?.requiresApproval ? 'Aprovação do coordenador obrigatória' : 'Aprovação não obrigatória'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time-entry-description" className={cn(shouldHighlightDescriptionField && 'font-semibold text-primary')}>
                    Descrição das atividades *
                  </Label>
                  <Textarea
                    id="time-entry-description"
                    value={descriptionValue}
                    onChange={(event) => setDescriptionValue(event.target.value)}
                    data-testid="input-time-entry-description"
                    placeholder="Descreva o que foi realizado nesse dia..."
                    className={cn(shouldHighlightDescriptionField && 'border-primary/40 bg-primary/5 focus-visible:ring-primary/30')}
                    disabled={!selectedProjectId || !canLaunchHours}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>Anexos</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Adicione arquivos de apoio a este lançamento antes de salvar.</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleUploadFiles(event.target.files)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!selectedProjectId || !canLaunchHours || isUploading || createMutation.isPending}
                    >
                      {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Anexar arquivos
                    </Button>
                  </div>

                  {isUploading && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Enviando arquivo</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      {attachments.map((attachment) => (
                        <div key={attachment.objectPath} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{attachment.name}</p>
                              <p className="text-xs text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => removeAttachment(attachment.objectPath)}
                            disabled={createMutation.isPending || removingAttachmentPath === attachment.objectPath}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {selectedProjectId
                      ? canLaunchHours
                        ? 'O lançamento será associado ao dia selecionado no planner.'
                        : 'Este projeto não aceita novos lançamentos.'
                      : 'Selecione um projeto para liberar o apontamento.'}
                  </p>
                  <Button
                    type="submit"
                    data-testid="button-save-time-entry"
                    disabled={!selectedProjectId || !canLaunchHours || createMutation.isPending}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {createMutation.isPending ? 'Salvando...' : 'Apontar horas'}
                  </Button>
                </div>
                  </form>

                </>
              ) : (
                <div className="rounded-xl border border-primary/35 bg-primary/5 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary">Projeto obrigatório</p>
                  <p className="mt-2 text-base font-semibold text-foreground">Selecione um projeto para liberar o apontamento</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O formulário de horas, anexos e status do fluxo será exibido após a seleção do projeto.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Planner de horas</CardTitle>
              <p className="text-sm text-muted-foreground">Visualização do período selecionado para acompanhamento e aprovação.</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center rounded-lg border border-border bg-background shadow-sm">
                <Button type="button" variant="ghost" size="icon" onClick={goToPreviousPeriod}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-[220px] px-3 text-center text-sm font-semibold capitalize text-foreground">
                  {plannerTitle}
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={goToNextPeriod}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="w-[180px]" data-testid="select-time-entry-status-filter">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedProjectId ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
                Selecione um projeto para abrir o planner de horas.
              </div>
            ) : isLoading ? (
              <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`time-entry-skeleton-${index}`} className="rounded-xl border border-border bg-background p-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-44" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === 'week' ? (
              <div className="grid gap-3 lg:grid-cols-7 sm:grid-cols-2">
                {visibleDates.map((date) => {
                  const key = dateKey(date);
                  const dayEntries = entriesByDate.get(key) ?? [];
                  const daySummary = buildDaySummary(dayEntries);
                  const isWeekend = isSaturday(date) || isSunday(date);
                  const isSundayDate = isSunday(date);
                  const isSelectedDay = isSameDay(date, selectedDate);
                  const isTodayDay = isToday(date);

                  return (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'flex min-h-[240px] flex-col rounded-2xl border p-4 text-left transition-all',
                        isSelectedDay
                          ? 'border-primary bg-primary/10 shadow-md ring-1 ring-primary/20'
                          : isTodayDay
                            ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300 hover:bg-amber-50/80'
                          : isWeekend
                            ? 'border-sky-100 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-100/70'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/20'
                      )}
                      onClick={() => setSelectedDate(date)}
                      data-testid={`planner-day-${key}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={cn('text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground', isWeekend && 'text-sky-700')}>
                            {format(date, 'EEE', { locale: ptBR })}
                          </p>
                          <p className={cn('mt-1 text-xl font-semibold text-foreground', isSundayDate && 'text-sky-800')}>
                            {format(date, 'dd')}
                          </p>
                        </div>
                        {isTodayDay && (
                          <Badge
                            variant={isSelectedDay ? 'secondary' : 'outline'}
                            className={cn(!isSelectedDay && 'border-amber-300 bg-amber-50 text-amber-700')}
                          >
                            Hoje
                          </Badge>
                        )}
                      </div>

                      <div className={cn('mt-4 rounded-xl bg-muted/30 p-3', isWeekend && 'bg-white/70')}>
                        <p className={cn('text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground', isWeekend && 'text-sky-700')}>Total</p>
                        <p className="mt-1 text-lg font-semibold">{daySummary.totalHours.toFixed(1)}h</p>
                      </div>

                      <div className="mt-4 flex-1 space-y-2">
                        {dayEntries.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                            Nenhum lançamento
                          </div>
                        ) : (
                          dayEntries.slice(0, 3).map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-border bg-background px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-foreground">{entry.hours}h</span>
                                <Badge className={cn('border text-[10px]', statusBadgeClass[entry.status] ?? 'border-border bg-muted text-foreground')}>
                                  {statusLabels[entry.status] ?? entry.status}
                                </Badge>
                              </div>
                              {entry.costCenter && (
                                <p className="mt-1 text-[11px] font-medium text-primary">
                                  {entry.costCenter.code} · {entry.costCenter.name}
                                </p>
                              )}
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {entry.description || 'Sem descrição'}
                              </p>
                            </div>
                          ))
                        )}
                      </div>

                      {dayEntries.length > 3 && (
                        <p className="mt-3 text-xs font-medium text-primary">+ {dayEntries.length - 3} lançamento(s)</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-3">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((label) => (
                  <div key={label} className={cn('px-2 py-1 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground', (label === 'Sáb' || label === 'Dom') && 'text-sky-700')}>
                    {label}
                  </div>
                ))}
                {visibleDates.map((date) => {
                  const key = dateKey(date);
                  const dayEntries = entriesByDate.get(key) ?? [];
                  const daySummary = buildDaySummary(dayEntries);
                  const isWeekend = isSaturday(date) || isSunday(date);
                  const isSundayDate = isSunday(date);
                  const isSelectedDay = isSameDay(date, selectedDate);
                  const isTodayDay = isToday(date);

                  return (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        'min-h-[140px] rounded-2xl border p-3 text-left transition-all',
                        isSelectedDay
                          ? 'border-primary bg-primary/10 shadow-md ring-1 ring-primary/20'
                          : isTodayDay
                            ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300 hover:bg-amber-50/80'
                          : isWeekend
                            ? 'border-sky-100 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-100/70'
                            : 'border-border bg-card hover:border-primary/35 hover:bg-muted/20',
                        !isSameMonth(date, selectedDate) && 'opacity-45'
                      )}
                      onClick={() => setSelectedDate(date)}
                      data-testid={`planner-month-day-${key}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn('text-sm font-semibold', isSelectedDay ? 'text-primary' : isTodayDay ? 'text-amber-700' : isSundayDate ? 'text-sky-800' : isWeekend ? 'text-sky-700' : 'text-foreground')}>
                          {format(date, 'dd')}
                        </span>
                        {dayEntries.length > 0 && (
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', isWeekend ? 'bg-sky-100 text-sky-700' : 'bg-primary/10 text-primary')}>
                            {daySummary.totalHours.toFixed(1)}h
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        {dayEntries.slice(0, 2).map((entry) => (
                          <div key={entry.id} className="rounded-lg bg-muted/40 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-foreground">{entry.hours}h</span>
                              <span className="text-muted-foreground">{statusLabels[entry.status] ?? entry.status}</span>
                            </div>
                            {entry.costCenter && (
                              <p className="mt-1 line-clamp-1 text-[11px] font-medium text-primary">
                                {entry.costCenter.code}
                              </p>
                            )}
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description || 'Sem descrição'}</p>
                          </div>
                        ))}
                        {dayEntries.length === 0 && (
                          <div className="pt-8 text-center text-xs text-muted-foreground">Livre</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedProjectId && (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detalhamento do dia</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDateEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center text-muted-foreground">
                  Nenhum lançamento para {format(selectedDate, 'dd/MM/yyyy')} com o filtro atual.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {selectedDateEntries.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Clock3 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{entry.hours}h</p>
                            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{format(getEntryDate(entry), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <Badge className={cn('border', statusBadgeClass[entry.status] ?? 'border-border bg-muted text-foreground')}>
                          {statusLabels[entry.status] ?? entry.status}
                        </Badge>
                      </div>
                      <div className="mt-4 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        {entry.costCenter
                          ? `${entry.costCenter.code} · ${entry.costCenter.name}`
                          : selectedProject
                            ? `Projeto · ${selectedProject.code}`
                            : 'Projeto'}
                      </div>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{entry.description || 'Sem descrição informada.'}</p>
                      {entry.status === 'rejected' && entry.rejectionReason ? (
                        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          Motivo da rejeição: {entry.rejectionReason}
                        </div>
                      ) : null}
                      {entry.attachments && entry.attachments.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.attachments.map((attachment) => (
                            <a
                              key={attachment.objectPath}
                              href={attachment.objectPath}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              {attachment.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {selectedProjectId && isLoading && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando lançamentos
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </Layout>
  );
}
