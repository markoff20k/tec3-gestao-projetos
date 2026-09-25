import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  isWeekend,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUpload } from '@/hooks/use-upload';
import { costCentersApi, CostCenter, projectFavoritesApi, projectsApi, Project, TimeEntry, TimeEntryAttachment } from '@/lib/api';
import { cn } from '@/lib/utils';

const statusLabels: Record<string, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const statusDescriptions: Record<string, string> = {
  pending: 'Enviado para o coordenador do projeto aprovar. Enquanto isso você ainda pode editar ou excluir.',
  approved: 'Aprovado pelo coordenador. Não pode mais ser alterado nesta tela.',
  rejected: 'Recusado pelo coordenador. Corrija pelos detalhes e lance novamente.',
};

const statusBadgeClass: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
};

const statusDotClass: Record<string, string> = {
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-rose-500',
};

const NO_COST_CENTER = 'none';
const PROJECT_COST_CENTER_OPTION = 'project';

type ViewMode = 'day' | 'week' | 'month';

const viewModeLabels: Record<ViewMode, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
};

const VIEW_MODE_STORAGE_KEY = 'timeEntriesViewMode';
const DEFAULT_VIEW_MODE: ViewMode = 'week';

function isViewMode(value: unknown): value is ViewMode {
  return value === 'day' || value === 'week' || value === 'month';
}

function readStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_VIEW_MODE;
  } catch {
    // Navegador com armazenamento bloqueado: cai no padrão sem quebrar a tela.
    return DEFAULT_VIEW_MODE;
  }
}

function persistViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Preferência é conveniência: falhar ao gravar não pode impedir a troca de visão.
  }
}

const COLLAPSED_PROJECTS_STORAGE_KEY = 'timeEntriesCollapsedProjects';

// Guardamos os projetos RECOLHIDOS, não os expandidos: o padrão é vir expandido,
// e assim um projeto novo aparece aberto sem precisar existir na preferência.
function readStoredCollapsedProjects(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROJECTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(parsed.filter((id) => typeof id === 'string').map((id) => [id, true]));
  } catch {
    return {};
  }
}

function persistCollapsedProjects(collapsed: Record<string, boolean>) {
  try {
    const ids = Object.entries(collapsed).filter(([, isCollapsed]) => isCollapsed).map(([id]) => id);
    localStorage.setItem(COLLAPSED_PROJECTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Preferência é conveniência: falhar ao gravar não pode travar a tela.
  }
}

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

// entry_date é uma data pura no banco e chega como "2026-08-21T00:00:00.000Z".
// Converter para Date desloca o dia em qualquer fuso a oeste de Greenwich
// (no Brasil, UTC-3, o lançamento apareceria na coluna do dia anterior), então
// a chave sai direto do texto ISO, sem passar por fuso horário.
function getEntryDateKey(entry: TimeEntry) {
  return String(entry.entryDate || '').slice(0, 10);
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

function rowKeyOf(projectId: string, costCenterId: string) {
  return `${projectId}::${costCenterId}`;
}

function cellKeyOf(projectId: string, costCenterId: string, dayKey: string) {
  return `${projectId}::${costCenterId}::${dayKey}`;
}

function formatHours(value: number) {
  return value.toFixed(2).replace(/\.00$/, '');
}

function CellStatusTooltip({ entries }: { entries: TimeEntry[] }) {
  if (entries.length > 1) {
    const total = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    return (
      <div className="space-y-1">
        <p className="font-semibold">{entries.length} lançamentos neste dia</p>
        <p className="text-muted-foreground">
          Somam {formatHours(total)}h. Abra os detalhes para editar cada um separadamente.
        </p>
      </div>
    );
  }

  const entry = entries[0];
  const approvedAt = entry.approvedAt ? parseISO(entry.approvedAt) : null;

  return (
    <div className="space-y-1">
      <p className="font-semibold">
        {formatHours(Number(entry.hours || 0))}h · {statusLabels[entry.status] ?? entry.status}
      </p>
      <p className="text-muted-foreground">{statusDescriptions[entry.status] ?? ''}</p>
      {entry.status === 'approved' && approvedAt && !Number.isNaN(approvedAt.getTime()) ? (
        <p className="text-muted-foreground">
          Aprovado em {format(approvedAt, 'dd/MM/yyyy', { locale: ptBR })}.
        </p>
      ) : null}
      {entry.status === 'rejected' && entry.rejectionReason ? (
        <p className="text-rose-300">Motivo: {entry.rejectionReason}</p>
      ) : null}
      {entry.description ? (
        <p className="border-t border-white/15 pt-1 text-muted-foreground">{entry.description}</p>
      ) : null}
    </div>
  );
}

function getPeriodRange(viewMode: ViewMode, anchorDate: Date) {
  if (viewMode === 'day') {
    return { start: startOfDay(anchorDate), end: startOfDay(anchorDate) };
  }
  if (viewMode === 'week') {
    return {
      start: startOfWeek(anchorDate, { weekStartsOn: 0 }),
      end: endOfWeek(anchorDate, { weekStartsOn: 0 }),
    };
  }
  return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
}

function shiftAnchor(viewMode: ViewMode, anchorDate: Date, direction: 1 | -1) {
  if (viewMode === 'day') return addDays(anchorDate, direction);
  if (viewMode === 'week') return addWeeks(anchorDate, direction);
  return addMonths(anchorDate, direction);
}

function formatPeriodLabel(viewMode: ViewMode, start: Date, end: Date) {
  if (viewMode === 'day') {
    return format(start, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  }
  if (viewMode === 'month') {
    return format(start, "MMMM 'de' yyyy", { locale: ptBR });
  }
  return `${format(start, 'dd MMM', { locale: ptBR })} – ${format(end, "dd MMM 'de' yyyy", { locale: ptBR })}`;
}

export default function TimeEntries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>(readStoredCollapsedProjects);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [savedCells, setSavedCells] = useState<Record<string, boolean>>({});

  const [detailContext, setDetailContext] = useState<{
    projectId: string;
    costCenterId: string;
    dayKey: string;
  } | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [hoursValue, setHoursValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [detailCostCenterId, setDetailCostCenterId] = useState('');
  const [attachments, setAttachments] = useState<TimeEntryAttachment[]>([]);
  const [removingAttachmentPath, setRemovingAttachmentPath] = useState<string | null>(null);
  const [deleteConfirmEntryId, setDeleteConfirmEntryId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = savedTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const { start: periodStart, end: periodEnd } = useMemo(
    () => getPeriodRange(viewMode, anchorDate),
    [viewMode, anchorDate]
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: periodStart, end: periodEnd }),
    [periodStart, periodEnd]
  );

  const startKey = dateKey(periodStart);
  const endKey = dateKey(periodEnd);

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
    queryFn: () => costCentersApi.getAll(),
  });

  const entriesQueryKey = ['/api/time-entries/me', startKey, endKey] as const;

  const { data: periodEntries = [], isLoading: isLoadingEntries } = useQuery<TimeEntry[]>({
    queryKey: entriesQueryKey,
    queryFn: () => projectsApi.getMyTimeEntries(startKey, endKey),
  });

  const { data: favoriteProjectIds = [] } = useQuery<string[]>({
    queryKey: ['/api/project-favorites'],
    queryFn: () => projectFavoritesApi.getAll(),
  });

  const favoriteProjectsSet = useMemo(() => new Set(favoriteProjectIds), [favoriteProjectIds]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ projectId, isFavorite }: { projectId: string; isFavorite: boolean }) =>
      isFavorite ? projectFavoritesApi.remove(projectId) : projectFavoritesApi.add(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-favorites'] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar favoritos', description: error.message, variant: 'destructive' });
    },
  });
  const launchableProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          isProjectLaunchable(project) &&
          Boolean(project.isCurrentUserAllocated) &&
          !project.isAdministrative
      ),
    [projects]
  );

  // A API devolve apenas os centros de custo administrativos; o centro de custo
  // próprio de cada projeto vem junto do projeto.
  const administrativeCostCenters = useMemo(
    () => costCenters.filter((costCenter) => costCenter.isActive),
    [costCenters]
  );

  const costCenterById = useMemo(() => {
    const map = new Map<string, CostCenter>();
    for (const costCenter of costCenters) map.set(costCenter.id, costCenter);
    for (const project of projects) {
      if (project.costCenter) map.set(project.costCenter.id, project.costCenter);
    }
    return map;
  }, [costCenters, projects]);

  const getSelectableCostCenters = (project: Project): CostCenter[] =>
    project.costCenter ? [project.costCenter, ...administrativeCostCenters] : administrativeCostCenters;

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const matching = launchableProjects.filter((project) => {
      if (showOnlyFavorites && !favoriteProjectsSet.has(project.id)) return false;
      if (!query) return true;
      return `${project.code} ${project.name}`.toLowerCase().includes(query);
    });

    // Favoritos primeiro: quem aponta horas todo dia repete os mesmos projetos,
    // e rolar a grade atrás deles é o atrito que o favorito existe para remover.
    return [...matching].sort((a, b) => {
      const favA = favoriteProjectsSet.has(a.id) ? 0 : 1;
      const favB = favoriteProjectsSet.has(b.id) ? 0 : 1;
      if (favA !== favB) return favA - favB;
      return (a.code || '').localeCompare(b.code || '', 'pt-BR', { sensitivity: 'base' });
    });
  }, [launchableProjects, searchQuery, showOnlyFavorites, favoriteProjectsSet]);

  const entriesByCell = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of periodEntries) {
      const key = cellKeyOf(entry.projectId, entry.costCenterId || NO_COST_CENTER, getEntryDateKey(entry));
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return map;
  }, [periodEntries]);

  const costCenterRowsByProject = useMemo(() => {
    const costCentersWithEntries = new Map<string, string[]>();

    for (const entry of periodEntries) {
      const current = costCentersWithEntries.get(entry.projectId) ?? [];
      const costCenterId = entry.costCenterId || NO_COST_CENTER;
      if (!current.includes(costCenterId)) current.push(costCenterId);
      costCentersWithEntries.set(entry.projectId, current);
    }

    const map = new Map<string, string[]>();

    for (const project of filteredProjects) {
      const rows: string[] = [];

      // O centro de custo do próprio projeto é sempre a primeira linha: é onde
      // o apontamento normalmente cai, e evita cair na linha "Sem centro de custo".
      if (project.costCenter) rows.push(project.costCenter.id);

      // Os administrativos (férias, feriado, licença, treinamento...) ficam sempre
      // disponíveis dentro de cada projeto: são horas que o colaborador precisa
      // apontar no dia a dia, não algo que ele deva acrescentar à grade antes.
      for (const costCenter of administrativeCostCenters) {
        if (!rows.includes(costCenter.id)) rows.push(costCenter.id);
      }

      // Lançamentos antigos podem apontar para centros de custo fora das listas
      // acima (inativados, ou a linha "sem centro de custo" do legado).
      for (const costCenterId of costCentersWithEntries.get(project.id) ?? []) {
        if (!rows.includes(costCenterId)) rows.push(costCenterId);
      }

      // Só sobra quando o projeto ainda não tem centro de custo próprio
      // (projeto sem TAP gerado) e não há lançamento no período.
      if (rows.length === 0) rows.push(NO_COST_CENTER);

      map.set(project.id, rows);
    }

    return map;
  }, [periodEntries, filteredProjects, administrativeCostCenters]);

  const getCellEntries = (projectId: string, costCenterId: string, dayKey: string) =>
    entriesByCell.get(cellKeyOf(projectId, costCenterId, dayKey)) ?? [];

  const getCellHours = (projectId: string, costCenterId: string, dayKey: string) =>
    getCellEntries(projectId, costCenterId, dayKey).reduce(
      (sum, entry) => sum + Number(entry.hours || 0),
      0
    );

  const getProjectDayHours = (projectId: string, dayKey: string) =>
    periodEntries
      .filter((entry) => entry.projectId === projectId && getEntryDateKey(entry) === dayKey)
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

  const getDayTotal = (dayKey: string) =>
    periodEntries
      .filter((entry) => getEntryDateKey(entry) === dayKey)
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

  const periodTotal = useMemo(
    () => periodEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [periodEntries]
  );

  const markCellSaved = (cellKey: string) => {
    setSavedCells((current) => ({ ...current, [cellKey]: true }));
    const existingTimer = savedTimersRef.current[cellKey];
    if (existingTimer) clearTimeout(existingTimer);
    savedTimersRef.current[cellKey] = setTimeout(() => {
      setSavedCells((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
      delete savedTimersRef.current[cellKey];
    }, 1600);
  };

  const clearDraft = (cellKey: string) => {
    setDraftValues((current) => {
      const next = { ...current };
      delete next[cellKey];
      return next;
    });
  };

  const refreshEntries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['/api/time-entries/me'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
  };

  const commitCell = async (
    project: Project,
    costCenterId: string,
    day: Date,
    rawValue: string
  ) => {
    const dayKey = dateKey(day);
    const cellKey = cellKeyOf(project.id, costCenterId, dayKey);
    const cellEntries = getCellEntries(project.id, costCenterId, dayKey);
    const currentHours = cellEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

    const normalized = rawValue.trim().replace(',', '.');
    const parsedHours = normalized === '' ? 0 : Number(normalized);

    if (!Number.isFinite(parsedHours) || parsedHours < 0 || parsedHours > 24) {
      clearDraft(cellKey);
      toast({
        title: 'Horas inválidas',
        description: 'Informe um valor entre 0 e 24. Deixe em branco para remover o lançamento.',
        variant: 'destructive',
      });
      return;
    }

    if (parsedHours === currentHours) {
      clearDraft(cellKey);
      return;
    }

    const existingEntry = cellEntries[0];

    if (!existingEntry && costCenterId === NO_COST_CENTER) {
      clearDraft(cellKey);
      toast({
        title: 'Escolha um centro de custo',
        description: 'A linha "Sem centro de custo" mostra apenas lançamentos antigos. Use a linha do centro de custo do projeto ou um administrativo.',
        variant: 'destructive',
      });
      return;
    }

    if (cellEntries.length > 1) {
      clearDraft(cellKey);
      toast({
        title: 'Vários lançamentos neste dia',
        description: 'Abra os detalhes da célula para editar cada lançamento individualmente.',
        variant: 'destructive',
      });
      return;
    }

    if (existingEntry && existingEntry.status !== 'pending') {
      clearDraft(cellKey);
      toast({
        title: 'Lançamento já avaliado',
        description: `Somente lançamentos pendentes podem ser alterados. Este está ${(statusLabels[existingEntry.status] ?? existingEntry.status).toLowerCase()}.`,
        variant: 'destructive',
      });
      return;
    }

    if (parsedHours > 0 && project.dailyLimitHours) {
      const otherHoursInDay = getProjectDayHours(project.id, dayKey) - currentHours;
      if (otherHoursInDay + parsedHours > project.dailyLimitHours) {
        clearDraft(cellKey);
        toast({
          title: 'Limite diário excedido',
          description: `Limite do projeto ${project.code}: ${project.dailyLimitHours}h por dia. Já lançado neste dia: ${formatHours(otherHoursInDay)}h.`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSavingCells((current) => ({ ...current, [cellKey]: true }));

    try {
      if (parsedHours === 0) {
        if (existingEntry) {
          await projectsApi.deleteTimeEntry(existingEntry.id);
        }
      } else if (existingEntry) {
        await projectsApi.updateTimeEntry(existingEntry.id, {
          costCenterId: costCenterId === NO_COST_CENTER ? null : costCenterId,
          entryDate: dayKey,
          hours: parsedHours,
          description: existingEntry.description,
          attachments: existingEntry.attachments ?? [],
        });
      } else {
        await projectsApi.createTimeEntry({
          projectId: project.id,
          collaboratorId: '',
          costCenterId: costCenterId === NO_COST_CENTER ? null : costCenterId,
          entryDate: dayKey,
          hours: parsedHours,
          description: '',
          attachments: [],
        });
      }

      await refreshEntries();
      clearDraft(cellKey);
      markCellSaved(cellKey);
    } catch (error) {
      clearDraft(cellKey);
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Erro ao salvar o lançamento.',
        variant: 'destructive',
      });
    } finally {
      setSavingCells((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
    }
  };

  const isProjectExpanded = (projectId: string) => !collapsedProjects[projectId];

  const toggleProjectExpanded = (projectId: string) => {
    setCollapsedProjects((current) => {
      const next = { ...current };
      if (next[projectId]) delete next[projectId];
      else next[projectId] = true;
      persistCollapsedProjects(next);
      return next;
    });
  };


  const detailProject = useMemo(
    () => launchableProjects.find((project) => project.id === detailContext?.projectId) ?? null,
    [launchableProjects, detailContext]
  );

  const detailEntries = useMemo(() => {
    if (!detailContext) return [];
    return getCellEntries(detailContext.projectId, detailContext.costCenterId, detailContext.dayKey);
  }, [detailContext, entriesByCell]);

  // Lançamento novo nunca nasce sem centro de custo: na linha de histórico o
  // formulário já abre com o centro de custo do próprio projeto selecionado.
  const defaultCostCenterIdFor = (projectId: string, costCenterId: string) => {
    if (costCenterId !== NO_COST_CENTER) return costCenterId;
    const project = launchableProjects.find((candidate) => candidate.id === projectId);
    return project?.costCenter?.id ?? '';
  };

  const resetDetailForm = () => {
    setEditingEntryId(null);
    setHoursValue('');
    setDescriptionValue('');
    setAttachments([]);
    setDetailCostCenterId(
      detailContext ? defaultCostCenterIdFor(detailContext.projectId, detailContext.costCenterId) : ''
    );
  };

  const openDetail = (projectId: string, costCenterId: string, dayKey: string) => {
    setDetailContext({ projectId, costCenterId, dayKey });
    setEditingEntryId(null);
    setHoursValue('');
    setDescriptionValue('');
    setAttachments([]);
    setDetailCostCenterId(defaultCostCenterIdFor(projectId, costCenterId));
  };

  const startEditingEntry = (entry: TimeEntry) => {
    setEditingEntryId(entry.id);
    setHoursValue(String(entry.hours));
    setDescriptionValue(entry.description || '');
    setAttachments(entry.attachments || []);
    setDetailCostCenterId(entry.costCenterId || '');
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<TimeEntry>) => projectsApi.createTimeEntry(data),
    onSuccess: async () => {
      await refreshEntries();
      toast({ title: 'Horas lançadas com sucesso', variant: 'success' });
      resetDetailForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao lançar horas', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimeEntry> }) => projectsApi.updateTimeEntry(id, data),
    onSuccess: async () => {
      await refreshEntries();
      toast({ title: 'Lançamento atualizado com sucesso', variant: 'success' });
      resetDetailForm();
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar lançamento', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectsApi.deleteTimeEntry(id),
    onSuccess: async () => {
      await refreshEntries();
      toast({ title: 'Lançamento excluído com sucesso', variant: 'success' });
      setDeleteConfirmEntryId(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir lançamento', description: error.message, variant: 'destructive' });
    },
  });

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

  const handleDetailSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!detailProject || !detailContext) return;

    const requestedHours = Number(hoursValue.replace(',', '.')) || 0;
    if (requestedHours <= 0 || requestedHours > 24) {
      toast({ title: 'Informe as horas', description: 'Use um valor entre 0.5 e 24.', variant: 'destructive' });
      return;
    }

    const payload = {
      costCenterId: detailCostCenterId || null,
      entryDate: detailContext.dayKey,
      hours: requestedHours,
      description: descriptionValue,
      attachments,
    };

    if (editingEntryId) {
      updateMutation.mutate({ id: editingEntryId, data: payload });
      return;
    }

    createMutation.mutate({
      ...payload,
      projectId: detailProject.id,
      collaboratorId: '',
    });
  };

  const dayColumnWidth = viewMode === 'day' ? 'w-40' : 'w-[68px]';
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <div className="flex h-[calc(100vh-6rem)] flex-col gap-5 lg:h-[calc(100vh-7rem)]">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold">Lançamento de Horas</h1>
          <p className="text-muted-foreground">
            Aponte as horas direto na grade: escolha o período, digite em cada dia e use Tab para avançar.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
              {(Object.keys(viewModeLabels) as ViewMode[]).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={viewMode === mode ? 'default' : 'ghost'}
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    setViewMode(mode);
                    persistViewMode(mode);
                  }}
                  data-testid={`button-view-mode-${mode}`}
                >
                  {viewModeLabels[mode]}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setAnchorDate((current) => shiftAnchor(viewMode, current, -1))}
                data-testid="button-period-previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setAnchorDate(new Date())}
                data-testid="button-period-today"
              >
                Hoje
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setAnchorDate((current) => shiftAnchor(viewMode, current, 1))}
                data-testid="button-period-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="capitalize">{formatPeriodLabel(viewMode, periodStart, periodEnd)}</span>
            </div>
          </div>

          <div className="flex w-full max-w-md items-center gap-2">
            <Button
              type="button"
              variant={showOnlyFavorites ? 'default' : 'outline'}
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setShowOnlyFavorites((current) => !current)}
              aria-pressed={showOnlyFavorites}
              data-testid="button-filter-favorites"
            >
              <Star
                className={cn(
                  'mr-1 h-4 w-4',
                  showOnlyFavorites ? 'fill-current' : 'text-muted-foreground'
                )}
              />
              Favoritos
            </Button>

            <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Filtrar por código ou nome..."
              className="h-9 pl-9"
              data-testid="input-search-project"
            />
            </div>
          </div>
        </div>

        {isLoadingProjects ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Carregando projetos...
            </CardContent>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              {launchableProjects.length === 0
                ? 'Você não está alocado em nenhum projeto ativo. Procure o coordenador do projeto para ser incluído na equipe.'
                : showOnlyFavorites && favoriteProjectsSet.size === 0
                  ? 'Você ainda não marcou nenhum projeto como favorito. Use a estrela no cabeçalho do projeto.'
                  : 'Nenhum projeto encontrado para este filtro.'}
            </CardContent>
          </Card>
        ) : (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 top-0 z-40 min-w-[320px] bg-muted px-3 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Projeto / Centro de custo
                    </th>
                    {days.map((day) => {
                      const isCurrentDay = isToday(day);
                      return (
                        <th
                          key={dateKey(day)}
                          className={cn(
                            dayColumnWidth,
                            'sticky top-0 z-30 border-l border-border bg-muted px-1 py-1.5 text-center align-middle',
                            isWeekend(day) && 'bg-muted',
                            isCurrentDay && 'bg-primary/10'
                          )}
                        >
                          <div className={cn('text-sm font-semibold', isCurrentDay && 'text-primary')}>
                            {format(day, 'dd')}
                          </div>
                          <div className="text-[10px] uppercase text-muted-foreground">
                            {format(day, 'EEEEE', { locale: ptBR })}
                          </div>
                        </th>
                      );
                    })}
                    <th className="sticky top-0 z-30 w-20 border-l border-border bg-muted px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProjects.map((project) => {
                    const rows = costCenterRowsByProject.get(project.id) ?? [NO_COST_CENTER];
                    const isExpanded = isProjectExpanded(project.id);

                    return (
                      <Fragment key={project.id}>
                        <tr className="border-b border-border bg-primary/10">
                          <td className="sticky left-0 z-10 bg-card px-3 py-2 text-left">
                            <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-2 py-1">
                              <button
                                type="button"
                                className="shrink-0 rounded p-0.5 hover:bg-primary/10"
                                onClick={() =>
                                  toggleFavoriteMutation.mutate({
                                    projectId: project.id,
                                    isFavorite: favoriteProjectsSet.has(project.id),
                                  })
                                }
                                title={
                                  favoriteProjectsSet.has(project.id)
                                    ? 'Remover dos favoritos'
                                    : 'Adicionar aos favoritos'
                                }
                                aria-label={
                                  favoriteProjectsSet.has(project.id)
                                    ? `Remover ${project.code} dos favoritos`
                                    : `Adicionar ${project.code} aos favoritos`
                                }
                                aria-pressed={favoriteProjectsSet.has(project.id)}
                                data-testid={`button-toggle-favorite-${project.id}`}
                              >
                                <Star
                                  className={cn(
                                    'h-4 w-4 transition-colors',
                                    favoriteProjectsSet.has(project.id)
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-muted-foreground hover:text-yellow-400'
                                  )}
                                />
                              </button>
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => toggleProjectExpanded(project.id)}
                                aria-expanded={isExpanded}
                              >
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {project.code} · {project.name}
                                </p>
                                {project.dailyLimitHours ? (
                                  <p className="text-[10px] font-normal text-muted-foreground">
                                    Limite diário: {project.dailyLimitHours}h
                                  </p>
                                ) : null}
                              </button>

                              {/* Único controle do cabeçalho, à direita e com moldura:
                                  é a ação que governa a linha inteira. */}
                              <button
                                type="button"
                                className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-background/70 text-foreground transition-colors hover:bg-background"
                                onClick={() => toggleProjectExpanded(project.id)}
                                aria-expanded={isExpanded}
                                title={isExpanded ? 'Recolher projeto' : 'Expandir projeto'}
                                aria-label={
                                  isExpanded
                                    ? `Recolher ${project.code}`
                                    : `Expandir ${project.code}`
                                }
                                data-testid={`button-toggle-project-${project.id}`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>

                            </div>
                          </td>

                          {days.map((day) => {
                            const dayKey = dateKey(day);
                            const projectDayHours = getProjectDayHours(project.id, dayKey);
                            const exceedsLimit = Boolean(
                              project.dailyLimitHours && projectDayHours > project.dailyLimitHours
                            );

                            return (
                              <td
                                key={`${project.id}-${dayKey}`}
                                className={cn(
                                  'border-l border-border px-1 py-1 text-center text-xs font-medium',
                                  isWeekend(day) && 'bg-muted/30',
                                  exceedsLimit ? 'text-destructive' : 'text-muted-foreground'
                                )}
                              >
                                {!isExpanded && projectDayHours > 0 ? formatHours(projectDayHours) : ''}
                              </td>
                            );
                          })}

                          <td className="border-l border-border px-2 py-1 text-center text-xs font-semibold">
                            {(() => {
                              if (isExpanded) return '';
                              const total = days.reduce(
                                (sum, day) => sum + getProjectDayHours(project.id, dateKey(day)),
                                0
                              );
                              return total > 0 ? formatHours(total) : '';
                            })()}
                          </td>
                        </tr>

                        {isExpanded && rows.map((costCenterId) => {
                          const costCenter = costCenterId === NO_COST_CENTER ? null : costCenterById.get(costCenterId);
                          const rowTotal = days.reduce(
                            (sum, day) => sum + getCellHours(project.id, costCenterId, dateKey(day)),
                            0
                          );

                          return (
                            <tr
                              key={rowKeyOf(project.id, costCenterId)}
                              className="border-b border-border/60 hover:bg-muted/20"
                            >
                              <td className="sticky left-0 z-10 bg-[hsl(var(--card))] px-3 py-1.5">
                                <div className="truncate pl-4 text-xs text-foreground">
                                  {costCenter ? (
                                    // O centro de custo próprio do projeto é criado com o mesmo
                                    // código e nome do projeto, então repetir o rótulo aqui
                                    // duplicaria o cabeçalho logo acima. Essa linha é o destino
                                    // padrão das horas, e é isso que o nome precisa dizer.
                                    costCenter.id === project.costCenter?.id ? (
                                      <span>Horas do projeto</span>
                                    ) : (
                                      `${costCenter.code} · ${costCenter.name}`
                                    )
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Sem centro de custo{' '}
                                      <span className="text-[10px]">(histórico)</span>
                                    </span>
                                  )}
                                </div>
                              </td>

                              {days.map((day) => {
                                const dayKey = dateKey(day);
                                const cellKey = cellKeyOf(project.id, costCenterId, dayKey);
                                const cellEntries = getCellEntries(project.id, costCenterId, dayKey);
                                const cellHours = cellEntries.reduce(
                                  (sum, entry) => sum + Number(entry.hours || 0),
                                  0
                                );
                                const singleEntry = cellEntries.length === 1 ? cellEntries[0] : null;
                                const isFuture = day > startOfDay(new Date());
                                // A linha de histórico existe para mostrar lançamentos
                                // antigos sem centro de custo, não para receber novos.
                                const isHistoryOnlyCell =
                                  costCenterId === NO_COST_CENTER && cellEntries.length === 0;
                                const isLocked =
                                  isFuture ||
                                  isHistoryOnlyCell ||
                                  cellEntries.length > 1 ||
                                  Boolean(singleEntry && singleEntry.status !== 'pending');
                                const draftValue = draftValues[cellKey];
                                const displayValue =
                                  draftValue !== undefined
                                    ? draftValue
                                    : cellHours > 0
                                      ? formatHours(cellHours)
                                      : '';

                                return (
                                  <td
                                    key={cellKey}
                                    className={cn(
                                      'relative border-l border-border p-0',
                                      isWeekend(day) && 'bg-muted/30',
                                      isToday(day) && 'bg-primary/5'
                                    )}
                                  >
                                    <Input
                                      value={displayValue}
                                      onChange={(event) =>
                                        setDraftValues((current) => ({
                                          ...current,
                                          [cellKey]: event.target.value,
                                        }))
                                      }
                                      onBlur={(event) => {
                                        if (draftValues[cellKey] === undefined) return;
                                        void commitCell(project, costCenterId, day, event.target.value);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.currentTarget.blur();
                                        }
                                      }}
                                      onDoubleClick={() => openDetail(project.id, costCenterId, dayKey)}
                                      disabled={isLocked || savingCells[cellKey]}
                                      inputMode="decimal"
                                      placeholder=""
                                      title={
                                        cellEntries.length > 1
                                          ? 'Vários lançamentos neste dia. Duplo clique para ver os detalhes.'
                                          : isFuture
                                            ? 'Não é possível lançar horas em datas futuras.'
                                            : isHistoryOnlyCell
                                              ? 'Linha apenas de histórico. Lance as horas na linha do centro de custo do projeto.'
                                              : singleEntry && singleEntry.status !== 'pending'
                                                ? `Lançamento ${(statusLabels[singleEntry.status] ?? singleEntry.status).toLowerCase()}. Duplo clique para ver os detalhes.`
                                                : 'Digite as horas e pressione Tab. Duplo clique abre os detalhes.'
                                      }
                                      className={cn(
                                        'h-9 rounded-none border-0 bg-transparent px-1 text-center text-sm shadow-none focus-visible:ring-1 focus-visible:ring-inset',
                                        isLocked && 'cursor-default opacity-90'
                                      )}
                                      data-testid={`input-cell-${cellKey}`}
                                    />

                                    {savingCells[cellKey] ? (
                                      <Loader2 className="pointer-events-none absolute right-1 top-1 h-3 w-3 animate-spin text-muted-foreground" />
                                    ) : savedCells[cellKey] ? (
                                      <Check className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-emerald-600" />
                                    ) : cellEntries.length > 0 ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={() => openDetail(project.id, costCenterId, dayKey)}
                                            className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center"
                                            aria-label={`${statusLabels[cellEntries[0].status] ?? cellEntries[0].status} — abrir detalhes do lançamento`}
                                            data-testid={`button-cell-detail-${cellKey}`}
                                          >
                                            <span
                                              className={cn(
                                                'h-1.5 w-1.5 rounded-full',
                                                statusDotClass[cellEntries[0].status] ?? 'bg-muted-foreground'
                                              )}
                                            />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                                          <CellStatusTooltip entries={cellEntries} />
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                  </td>
                                );
                              })}

                              <td className="border-l border-border px-2 py-1.5 text-center text-xs font-semibold">
                                {rowTotal > 0 ? formatHours(rowTotal) : ''}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Subtotal fecha o grupo: some as linhas do projeto por dia,
                            marcando em vermelho o dia que estourou o limite diário. */}
                        {isExpanded ? (
                          <tr className="border-b-2 border-border bg-muted/30">
                            <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                              <div className="pl-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Subtotal do projeto
                              </div>
                            </td>

                            {days.map((day) => {
                              const dayKey = dateKey(day);
                              const projectDayHours = getProjectDayHours(project.id, dayKey);
                              const exceedsLimit = Boolean(
                                project.dailyLimitHours && projectDayHours > project.dailyLimitHours
                              );

                              return (
                                <td
                                  key={`subtotal-${project.id}-${dayKey}`}
                                  className={cn(
                                    'border-l border-border px-1 py-1.5 text-center text-xs font-semibold',
                                    isWeekend(day) && 'bg-muted/30',
                                    exceedsLimit ? 'text-destructive' : 'text-foreground'
                                  )}
                                  title={exceedsLimit ? `Acima do limite diário de ${project.dailyLimitHours}h` : undefined}
                                >
                                  {projectDayHours > 0 ? formatHours(projectDayHours) : ''}
                                </td>
                              );
                            })}

                            <td className="border-l border-border px-2 py-1.5 text-center text-xs font-bold">
                              {(() => {
                                const total = days.reduce(
                                  (sum, day) => sum + getProjectDayHours(project.id, dateKey(day)),
                                  0
                                );
                                return total > 0 ? formatHours(total) : '';
                              })()}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="sticky bottom-0 left-0 z-40 bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total (horas)
                    </td>
                    {days.map((day) => {
                      const dayKey = dateKey(day);
                      const total = getDayTotal(dayKey);
                      return (
                        <td
                          key={`total-${dayKey}`}
                          className={cn(
                            'sticky bottom-0 z-30 border-l border-border bg-muted px-1 py-2 text-center text-xs font-semibold'
                          )}
                        >
                          {total > 0 ? formatHours(total) : ''}
                        </td>
                      );
                    })}
                    <td className="sticky bottom-0 z-30 border-l border-border bg-muted px-2 py-2 text-center text-sm font-bold">
                      {periodTotal > 0 ? formatHours(periodTotal) : '0'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Aguardando aprovação do coordenador
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Aprovado — não editável
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Rejeitado
              </span>
              <span className="ml-auto">Duplo clique numa célula abre descrição, anexos e histórico.</span>
            </div>

            {isLoadingEntries ? (
              <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
                Atualizando lançamentos do período...
              </div>
            ) : null}
          </Card>
        )}

        <Dialog
          open={Boolean(detailContext)}
          onOpenChange={(open) => {
            if (!open && !isSaving) {
              setDetailContext(null);
              setEditingEntryId(null);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {detailProject ? `${detailProject.code} · ${detailProject.name}` : 'Lançamento'}
              </DialogTitle>
            </DialogHeader>

            {detailContext && detailProject ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium capitalize">
                    {format(parseISO(detailContext.dayKey), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                  {isSameDay(parseISO(detailContext.dayKey), new Date()) ? <Badge>Hoje</Badge> : null}
                  {detailProject.dailyLimitHours ? (
                    <span className="ml-auto text-muted-foreground">
                      Lançado no dia: {formatHours(getProjectDayHours(detailProject.id, detailContext.dayKey))}h de{' '}
                      {detailProject.dailyLimitHours}h
                    </span>
                  ) : null}
                </div>

                {detailEntries.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      Lançamentos desta célula
                    </p>
                    {detailEntries.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-border bg-background px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{Number(entry.hours).toFixed(1)}h</p>
                              <Badge
                                className={cn(
                                  'border text-[10px]',
                                  statusBadgeClass[entry.status] ?? 'border-border bg-muted text-foreground'
                                )}
                              >
                                {statusLabels[entry.status] ?? entry.status}
                              </Badge>
                              {entry.attachments && entry.attachments.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Paperclip className="h-3 w-3" />
                                  {entry.attachments.length}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {entry.description || 'Sem descrição'}
                            </p>
                            {entry.status === 'rejected' && entry.rejectionReason ? (
                              <p className="mt-1 text-xs text-rose-600">Motivo: {entry.rejectionReason}</p>
                            ) : null}
                          </div>

                          {entry.status === 'pending' ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => startEditingEntry(entry)}
                                data-testid={`button-edit-entry-${entry.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirmEntryId(entry.id)}
                                data-testid={`button-delete-entry-${entry.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <form onSubmit={handleDetailSubmit} className="space-y-4 border-t border-border pt-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {editingEntryId ? 'Editar lançamento' : 'Novo lançamento neste dia'}
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="detail-hours">Horas *</Label>
                      <Input
                        id="detail-hours"
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="24"
                        value={hoursValue}
                        onChange={(event) => setHoursValue(event.target.value)}
                        placeholder="Ex.: 4"
                        disabled={isSaving}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="detail-cost-center">Centro de custo</Label>
                      <Select
                        value={detailCostCenterId || PROJECT_COST_CENTER_OPTION}
                        onValueChange={(value) =>
                          setDetailCostCenterId(value === PROJECT_COST_CENTER_OPTION ? '' : value)
                        }
                        disabled={isSaving}
                      >
                        <SelectTrigger id="detail-cost-center">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Só existe para não descaracterizar lançamentos antigos
                              que já estão sem centro de custo. */}
                          {!detailCostCenterId ? (
                            <SelectItem value={PROJECT_COST_CENTER_OPTION}>
                              Sem centro de custo (histórico)
                            </SelectItem>
                          ) : null}
                          {getSelectableCostCenters(detailProject).map((costCenter) => (
                            <SelectItem key={costCenter.id} value={costCenter.id}>
                              {costCenter.code} · {costCenter.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="detail-description">Descrição das atividades</Label>
                    <Textarea
                      id="detail-description"
                      value={descriptionValue}
                      onChange={(event) => setDescriptionValue(event.target.value)}
                      placeholder="Descreva o que foi realizado..."
                      disabled={isSaving}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-sm">Anexos</Label>
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
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving || isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Anexar
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
                          <div
                            key={attachment.objectPath}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{attachment.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {Math.max(1, Math.round(attachment.size / 1024))} KB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={() => removeAttachment(attachment.objectPath)}
                              disabled={isSaving || removingAttachmentPath === attachment.objectPath}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {editingEntryId ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetDetailForm}
                        disabled={isSaving}
                        className="flex-1"
                      >
                        Cancelar edição
                      </Button>
                    ) : null}
                    <Button type="submit" disabled={isSaving} className="flex-1">
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : editingEntryId ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Salvar alterações
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar lançamento
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">Projeto não encontrado.</div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deleteConfirmEntryId)}
          onOpenChange={(open) => {
            if (!open) setDeleteConfirmEntryId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O lançamento de horas será removido permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  if (!deleteConfirmEntryId) return;
                  deleteMutation.mutate(deleteConfirmEntryId);
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Sim, excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
