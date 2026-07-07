import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  ArcElement,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Check, ChevronsUpDown, Download, Flame, GripVertical, MoveDown, MoveUp, PieChart, Plus, Save, Wallet, Trash2 } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { projectsApi, type Project } from '@/lib/api';
import { cn } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

type WidgetType = 'kpi' | 'status' | 'budget' | 'burn' | 'risk' | 'ceo';
type WidgetSize = 'sm' | 'md' | 'lg';

type WidgetInstance = {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  height: number;
};

type TimeRange = '30' | '90' | '180' | '365';

type LayoutPreset = {
  id: string;
  name: string;
  widgets: WidgetInstance[];
  createdAt: string;
};

const STORAGE_WIDGETS_KEY = 'tec3:project-indicators:widgets:v1';
const STORAGE_FILTERS_KEY = 'tec3:project-indicators:filters:v1';
const STORAGE_PRESETS_KEY = 'tec3:project-indicators:presets:v1';

const defaultWidgets: WidgetInstance[] = [
  { id: 'kpi-overview', type: 'kpi', size: 'lg', height: 230 },
  { id: 'ceo-executive', type: 'ceo', size: 'lg', height: 420 },
  { id: 'status-distribution', type: 'status', size: 'md', height: 330 },
  { id: 'budget-vs-consumed', type: 'budget', size: 'lg', height: 350 },
  { id: 'burn-trend', type: 'burn', size: 'md', height: 350 },
  { id: 'risk-matrix', type: 'risk', size: 'md', height: 350 },
];

const widgetCatalog: Array<{ type: WidgetType; label: string; defaultSize: WidgetSize }> = [
  { type: 'kpi', label: 'KPIs gerais', defaultSize: 'lg' },
  { type: 'status', label: 'Distribuição por status', defaultSize: 'md' },
  { type: 'budget', label: 'Orçado x consumido', defaultSize: 'lg' },
  { type: 'burn', label: 'Tendência de consumo', defaultSize: 'md' },
  { type: 'risk', label: 'Mapa de risco operacional', defaultSize: 'md' },
  { type: 'ceo', label: 'Visão executiva CEO', defaultSize: 'lg' },
];

const trendPalette = {
  silver: '#a8b3c2',
  blue: '#0b76c5',
  blueDeep: '#0a4f8a',
  axisBlue: '#0077B6',
};

const statusLabelMap: Record<string, string> = {
  planning: 'Planejamento',
  in_progress: 'Em andamento',
  active: 'Em andamento',
  on_hold: 'Pausado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const baseChartOptions: ChartOptions<'bar' | 'line' | 'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 1200,
    easing: 'easeOutQuart',
    delay(context) {
      if (context.type === 'data') {
        return context.dataIndex * 80;
      }
      return 0;
    },
  },
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    tooltip: {
      backgroundColor: 'rgba(255, 255, 255, 0.97)',
      borderColor: 'rgba(203, 213, 225, 0.9)',
      borderWidth: 1,
      titleColor: '#0f172a',
      bodyColor: '#334155',
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
    },
    legend: {
      labels: {
        color: 'rgb(71, 85, 105)',
        font: {
          family: 'ui-sans-serif, system-ui, sans-serif',
          size: 10,
        },
      },
    },
  },
  elements: {
    bar: {
      borderRadius: 6,
      borderSkipped: false,
      hoverBorderWidth: 1,
    },
    line: {
      borderWidth: 2,
      tension: 0.35,
      capBezierPoints: true,
    },
    point: {
      radius: 4,
      hoverRadius: 5,
      hitRadius: 10,
    },
    arc: {
      borderWidth: 2,
    },
  },
  scales: {
    x: {
      ticks: { color: '#666', font: { size: 12 } },
      grid: { color: 'rgba(204, 204, 204, 0.30)', borderDash: [3, 3] },
    },
    y: {
      ticks: { color: '#666', font: { size: 10 } },
      grid: { color: 'rgba(204, 204, 204, 0.30)', borderDash: [3, 3] },
      beginAtZero: true,
    },
  },
};

function safeNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function getWidgetTitle(type: WidgetType) {
  return widgetCatalog.find((item) => item.type === type)?.label || 'Widget';
}

function getWidgetSpan(size: WidgetSize) {
  if (size === 'lg') return 'xl:col-span-3';
  if (size === 'md') return 'xl:col-span-2';
  return 'xl:col-span-1';
}

function isChartWidget(type: WidgetType) {
  return type !== 'kpi';
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildGradient(
  chart: { ctx: CanvasRenderingContext2D; chartArea?: { left: number; right: number; top: number; bottom: number } },
  colors: { from: string; to: string; horizontal?: boolean },
  fallback: string
) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return fallback;

  const gradient = colors.horizontal
    ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
    : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);

  gradient.addColorStop(0, colors.from);
  gradient.addColorStop(1, colors.to);

  return gradient;
}

function stepSize(base: WidgetSize, step: number): WidgetSize {
  const order: WidgetSize[] = ['sm', 'md', 'lg'];
  const index = order.indexOf(base);
  return order[clamp(index + step, 0, order.length - 1)];
}

function normalizeWidgets(input: Array<Partial<WidgetInstance>>, seed: number) {
  return input.map((item, index) => {
    const fallback = defaultWidgets[index % defaultWidgets.length];
    return {
      id: String(item.id || `${fallback.type}-${seed}-${index}`),
      type: (item.type as WidgetType) || fallback.type,
      size: (item.size as WidgetSize) || fallback.size,
      height: clamp(Number(item.height || fallback.height), 220, 560),
    };
  });
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function sparklinePoints(values: number[], width = 120, height = 32) {
  if (!values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function ProjectIndicators() {
  const [widgetDraftType, setWidgetDraftType] = useState<WidgetType>('status');
  const [widgets, setWidgets] = useState<WidgetInstance[]>(defaultWidgets);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dropTargetWidgetId, setDropTargetWidgetId] = useState<string | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ height: number; size: WidgetSize } | null>(null);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('none');
  const [layoutPresets, setLayoutPresets] = useState<LayoutPreset[]>([]);
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [timeRangeDays, setTimeRangeDays] = useState<TimeRange>('90');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [search, setSearch] = useState('');
  const [cardsAnimated, setCardsAnimated] = useState(false);
  const [isWideScreen, setIsWideScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : true));
  const chartContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  useEffect(() => {
    const savedWidgets = localStorage.getItem(STORAGE_WIDGETS_KEY);
    if (savedWidgets) {
      try {
        const parsed = JSON.parse(savedWidgets) as Array<Partial<WidgetInstance>>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(normalizeWidgets(parsed, Date.now()));
        }
      } catch {
      }
    }

    const savedPresets = localStorage.getItem(STORAGE_PRESETS_KEY);
    if (savedPresets) {
      try {
        const parsed = JSON.parse(savedPresets) as Array<Partial<LayoutPreset>>;
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item) => item && item.id && item.name && Array.isArray(item.widgets))
            .map((item, index) => ({
              id: String(item.id),
              name: String(item.name),
              widgets: normalizeWidgets(item.widgets as Array<Partial<WidgetInstance>>, Date.now() + index),
              createdAt: String(item.createdAt || new Date().toISOString()),
            }));
          setLayoutPresets(normalized);
        }
      } catch {
      }
    }

    const savedFilters = localStorage.getItem(STORAGE_FILTERS_KEY);
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters) as {
          timeRangeDays?: TimeRange;
          statusFilter?: string;
          selectedProjectId?: string;
          search?: string;
        };
        if (parsed.timeRangeDays) setTimeRangeDays(parsed.timeRangeDays);
        if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
        if (parsed.selectedProjectId) setSelectedProjectId(parsed.selectedProjectId);
        if (parsed.search) setSearch(parsed.search);
      } catch {
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_WIDGETS_KEY, JSON.stringify(widgets));
  }, [widgets]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_FILTERS_KEY,
      JSON.stringify({
        timeRangeDays,
        statusFilter,
        selectedProjectId,
        search,
      })
    );
  }, [timeRangeDays, statusFilter, selectedProjectId, search]);

  useEffect(() => {
    localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(layoutPresets));
  }, [layoutPresets]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCardsAnimated(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onResize = () => setIsWideScreen(window.innerWidth >= 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const filteredProjects = useMemo(() => {
    const now = Date.now();
    const windowStart = now - Number(timeRangeDays) * 24 * 60 * 60 * 1000;
    const query = search.trim().toLowerCase();

    return projects.filter((project) => {
      const start = toTimestamp(project.startDate) ?? toTimestamp(project.createdAt) ?? 0;
      const end = toTimestamp(project.endDate) ?? now;
      const withinWindow = end >= windowStart && start <= now;

      const status = normalizeStatus(project.status);
      const statusMatch = statusFilter === 'all' ? true : status === statusFilter;
      const projectMatch = selectedProjectId === 'all' ? true : project.id === selectedProjectId;

      const text = `${project.code || ''} ${project.name || ''} ${project.client?.razaoSocial || ''}`.toLowerCase();
      const searchMatch = query ? text.includes(query) : true;

      return withinWindow && statusMatch && projectMatch && searchMatch;
    });
  }, [projects, timeRangeDays, statusFilter, selectedProjectId, search]);

  const kpis = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const totalBudgetHours = filteredProjects.reduce((sum, project) => sum + safeNumber(project.budgetHours), 0);
    const totalConsumedHours = filteredProjects.reduce((sum, project) => sum + safeNumber(project.consumedHours), 0);
    const totalPendingHours = filteredProjects.reduce((sum, project) => sum + safeNumber(project.pendingHours), 0);
    const activeProjects = filteredProjects.filter((project) => {
      const status = normalizeStatus(project.status);
      return status === 'active' || status === 'in_progress';
    }).length;

    const consumptionRate = totalBudgetHours > 0 ? (totalConsumedHours / totalBudgetHours) * 100 : 0;

    return {
      totalProjects,
      totalBudgetHours,
      totalConsumedHours,
      totalPendingHours,
      activeProjects,
      consumptionRate,
    };
  }, [filteredProjects]);

  const statusChartData = useMemo<ChartData<'doughnut'>>(() => {
    const statusCount = new Map<string, number>();
    filteredProjects.forEach((project) => {
      const status = normalizeStatus(project.status);
      statusCount.set(status, (statusCount.get(status) || 0) + 1);
    });

    const labels = Array.from(statusCount.keys()).map((status) => statusLabelMap[status] || status || 'Indefinido');
    const values = Array.from(statusCount.values());

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: ['#1d4ed8', '#0891b2', '#16a34a', '#f59e0b', '#7c3aed', '#64748b'],
          hoverBackgroundColor: ['#1e40af', '#0e7490', '#15803d', '#d97706', '#6d28d9', '#475569'],
          borderColor: 'rgba(255,255,255,0.92)',
          borderWidth: 2,
          spacing: 1,
          hoverOffset: 12,
        },
      ],
    };
  }, [filteredProjects]);

  const budgetVsConsumedData = useMemo<ChartData<'bar'>>(() => {
    const top = [...filteredProjects]
      .sort((a, b) => safeNumber(b.budgetHours) - safeNumber(a.budgetHours))
      .slice(0, 8);

    return {
      labels: top.map((project) => project.code || project.name),
      datasets: [
        {
          label: 'Horas orcadas',
          data: top.map((project) => safeNumber(project.budgetHours)),
          backgroundColor: ({ chart }) =>
            buildGradient(
              chart,
              { from: 'rgba(226, 232, 240, 0.72)', to: 'rgba(148, 163, 184, 0.95)' },
              'rgba(148, 163, 184, 0.9)'
            ),
          borderColor: 'rgba(100, 116, 139, 0.9)',
          borderWidth: 1,
        },
        {
          label: 'Horas consumidas',
          data: top.map((project) => safeNumber(project.consumedHours)),
          backgroundColor: ({ chart }) =>
            buildGradient(
              chart,
              { from: 'rgba(147, 197, 253, 0.42)', to: 'rgba(2, 132, 199, 0.95)' },
              'rgba(14, 116, 144, 0.86)'
            ),
          borderColor: 'rgba(8, 145, 178, 0.95)',
          borderWidth: 1,
        },
      ],
    };
  }, [filteredProjects]);

  const burnTrendData = useMemo<ChartData<'line'>>(() => {
    const sortedByDate = [...filteredProjects].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    let cumulativeConsumed = 0;
    let cumulativeBudget = 0;

    const labels: string[] = [];
    const consumedSeries: number[] = [];
    const budgetSeries: number[] = [];

    sortedByDate.forEach((project) => {
      cumulativeConsumed += safeNumber(project.consumedHours);
      cumulativeBudget += safeNumber(project.budgetHours);
      labels.push(project.code || project.name || 'Projeto');
      consumedSeries.push(cumulativeConsumed);
      budgetSeries.push(cumulativeBudget);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Consumo acumulado',
          data: consumedSeries,
          borderColor: trendPalette.axisBlue,
          backgroundColor: ({ chart }) =>
            buildGradient(chart, { from: 'rgba(0, 119, 182, 0.80)', to: 'rgba(0, 119, 182, 0.10)' }, 'rgba(0, 119, 182, 0.45)'),
          fill: true,
          pointBackgroundColor: trendPalette.axisBlue,
          pointBorderColor: trendPalette.axisBlue,
          pointBorderWidth: 2,
          pointRadius: 4,
          cubicInterpolationMode: 'monotone',
        },
        {
          label: 'Orçamento acumulado',
          data: budgetSeries,
          borderColor: trendPalette.silver,
          backgroundColor: ({ chart }) =>
            buildGradient(chart, { from: 'rgba(168, 179, 194, 0.30)', to: 'rgba(168, 179, 194, 0.04)' }, 'rgba(168, 179, 194, 0.14)'),
          borderDash: [5, 4],
          fill: false,
          pointBackgroundColor: trendPalette.silver,
          pointBorderColor: trendPalette.silver,
          pointBorderWidth: 1.5,
          pointRadius: 3,
          cubicInterpolationMode: 'monotone',
        },
      ],
    };
  }, [filteredProjects]);

  const riskData = useMemo<ChartData<'bar'>>(() => {
    const topRisk = [...filteredProjects]
      .map((project) => {
        const budget = safeNumber(project.budgetHours);
        const consumed = safeNumber(project.consumedHours);
        const pending = safeNumber(project.pendingHours);
        const overBudgetRatio = budget > 0 ? consumed / budget : 0;
        const riskScore = overBudgetRatio * 65 + pending * 2.5;

        return {
          label: project.code || project.name,
          riskScore,
          pending,
          overBudgetRatio: overBudgetRatio * 100,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8);

    return {
      labels: topRisk.map((item) => item.label),
      datasets: [
        {
          label: 'Score de risco',
          data: topRisk.map((item) => Number(item.riskScore.toFixed(2))),
          backgroundColor: ({ chart }) => {
            const { ctx, chartArea } = chart;
            if (!chartArea) return 'rgba(11, 118, 197, 0.78)';
            const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
            gradient.addColorStop(0, 'rgba(168, 179, 194, 0.72)');
            gradient.addColorStop(0.56, 'rgba(11, 118, 197, 0.85)');
            gradient.addColorStop(1, 'rgba(10, 79, 138, 0.92)');
            return gradient;
          },
          borderColor: 'rgba(10, 79, 138, 0.96)',
          borderWidth: 1,
        },
      ],
    };
  }, [filteredProjects]);

  const ceoExecutive = useMemo(() => {
    const financialBase = filteredProjects.reduce(
      (acc, project) => {
        const budgetValue = safeNumber(project.budgetValue);
        const budgetHours = safeNumber(project.budgetHours);
        if (budgetValue > 0 && budgetHours > 0) {
          acc.totalValue += budgetValue;
          acc.totalHours += budgetHours;
        }
        return acc;
      },
      { totalValue: 0, totalHours: 0 }
    );

    const fallbackHourRate = financialBase.totalHours > 0 ? financialBase.totalValue / financialBase.totalHours : 1;

    const projects = filteredProjects
      .map((project) => {
        const budgetValueRaw = safeNumber(project.budgetValue);
        const budgetHours = safeNumber(project.budgetHours);
        const consumedHours = safeNumber(project.consumedHours);
        const pendingHours = safeNumber(project.pendingHours);
        const hourRate = budgetHours > 0 && budgetValueRaw > 0 ? budgetValueRaw / budgetHours : fallbackHourRate;
        const budgetValue = budgetValueRaw > 0 ? budgetValueRaw : budgetHours * hourRate;
        const actualEstimated = consumedHours * hourRate;
        const pendingEstimated = pendingHours * hourRate;
        const eac = Math.max(budgetValue, actualEstimated + pendingEstimated);
        const varianceValue = eac - budgetValue;
        const variancePct = budgetValue > 0 ? (varianceValue / budgetValue) * 100 : 0;
        const status = variancePct <= 5 ? 'ok' : variancePct <= 12 ? 'attention' : 'critical';

        return {
          id: project.id,
          label: project.code || project.name,
          budgetValue,
          actualEstimated,
          eac,
          varianceValue,
          variancePct,
          status,
        };
      })
      .filter((project) => project.budgetValue > 0 || project.actualEstimated > 0 || project.eac > 0);

    const totalBudget = projects.reduce((sum, project) => sum + project.budgetValue, 0);
    const totalActual = projects.reduce((sum, project) => sum + project.actualEstimated, 0);
    const totalEac = projects.reduce((sum, project) => sum + project.eac, 0);
    const totalVariance = totalEac - totalBudget;
    const totalVariancePct = totalBudget > 0 ? (totalVariance / totalBudget) * 100 : 0;

    const highlighted = [...projects]
      .sort((a, b) => {
        const scoreA = Math.abs(a.variancePct) > 0 ? Math.abs(a.variancePct) : Math.abs(a.varianceValue);
        const scoreB = Math.abs(b.variancePct) > 0 ? Math.abs(b.variancePct) : Math.abs(b.varianceValue);
        return scoreB - scoreA;
      })
      .slice(0, 10);

    const varianceChartData: ChartData<'bar'> = {
      labels: highlighted.map((project) => project.label),
      datasets: [
        {
          label: 'Desvio estimado (%)',
          data: highlighted.map((project) => Number(project.variancePct.toFixed(2))),
          backgroundColor: highlighted.map((project) => {
            if (project.status === 'critical') return 'rgba(220, 38, 38, 0.9)';
            if (project.status === 'attention') return 'rgba(245, 158, 11, 0.9)';
            return 'rgba(11, 118, 197, 0.9)';
          }),
          borderColor: highlighted.map((project) => {
            if (project.status === 'critical') return 'rgba(185, 28, 28, 1)';
            if (project.status === 'attention') return 'rgba(217, 119, 6, 1)';
            return 'rgba(10, 79, 138, 1)';
          }),
          borderWidth: 1,
        },
      ],
    };

    return {
      totalBudget,
      totalActual,
      totalEac,
      totalVariance,
      totalVariancePct,
      highlighted,
      varianceChartData,
    };
  }, [filteredProjects]);

  const addWidget = () => {
    const catalogItem = widgetCatalog.find((item) => item.type === widgetDraftType);
    if (!catalogItem) return;

    const nextId = `${widgetDraftType}-${Date.now()}`;
    setWidgets((current) => [
      ...current,
      {
        id: nextId,
        type: widgetDraftType,
        size: catalogItem.defaultSize,
        height: widgetDraftType === 'kpi' ? 230 : 350,
      },
    ]);
  };

  const removeWidget = (id: string) => {
    setWidgets((current) => current.filter((widget) => widget.id !== id));
  };

  const moveWidget = (id: string, direction: 'up' | 'down') => {
    setWidgets((current) => {
      const index = current.findIndex((widget) => widget.id === id);
      if (index < 0) return current;

      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;

      const cloned = [...current];
      const [picked] = cloned.splice(index, 1);
      cloned.splice(target, 0, picked);
      return cloned;
    });
  };

  const moveWidgetToTarget = (sourceId: string, targetId: string) => {
    setWidgets((current) => {
      const sourceIndex = current.findIndex((widget) => widget.id === sourceId);
      const targetIndex = current.findIndex((widget) => widget.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;

      const cloned = [...current];
      const [picked] = cloned.splice(sourceIndex, 1);
      cloned.splice(targetIndex, 0, picked);
      return cloned;
    });
  };

  const clearDragState = () => {
    setDraggedWidgetId(null);
    setDropTargetWidgetId(null);
  };

  const handleWidgetDragStart = (event: DragEvent<HTMLElement>, widgetId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', widgetId);
    setDraggedWidgetId(widgetId);
  };

  const handleWidgetDragOver = (event: DragEvent<HTMLElement>, widgetId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (widgetId !== draggedWidgetId) {
      setDropTargetWidgetId(widgetId);
    }
  };

  const handleWidgetDrop = (event: DragEvent<HTMLElement>, widgetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggedWidgetId;
    if (!sourceId || sourceId === widgetId) {
      clearDragState();
      return;
    }

    moveWidgetToTarget(sourceId, widgetId);
    clearDragState();
  };

  const changeWidgetSize = (id: string, size: WidgetSize) => {
    setWidgets((current) => current.map((widget) => (widget.id === id ? { ...widget, size } : widget)));
  };

  const setWidgetHeight = (id: string, height: number) => {
    setWidgets((current) => current.map((widget) => (widget.id === id ? { ...widget, height } : widget)));
  };

  const handleResizeStart = (event: ReactMouseEvent<HTMLButtonElement>, widget: WidgetInstance) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startHeight = widget.height;
    const startSize = widget.size;

    setResizingWidgetId(widget.id);

    const onMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaX = moveEvent.clientX - startX;
      const height = clamp(startHeight + deltaY, 220, 560);
      const sizeStep = Math.round(deltaX / 180);
      const nextSize = stepSize(startSize, sizeStep);

      setWidgetHeight(widget.id, height);
      if (nextSize !== startSize) {
        changeWidgetSize(widget.id, nextSize);
      }
    };

    const onUp = () => {
      setResizingWidgetId(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const saveWidgetAsImage = (widgetId: string, widgetTitle: string) => {
    const container = chartContainerRefs.current[widgetId];
    const canvas = container?.querySelector('canvas');
    if (!canvas) {
      return;
    }

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${sanitizeFileName(widgetTitle)}-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
  };

  const resetLayout = () => {
    setWidgets(defaultWidgets);
  };

  const statusOptions = useMemo(() => {
    const values = new Set(projects.map((project) => normalizeStatus(project.status)).filter(Boolean));
    return ['all', ...Array.from(values)];
  }, [projects]);

  const projectOptions = useMemo(
    () =>
      [...projects].sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'pt-BR')).map((project) => ({
        id: project.id,
        label: `${project.code || 'Sem código'} - ${project.name}`,
      })),
    [projects]
  );

  const selectedProjectLabel = useMemo(() => {
    if (selectedProjectId === 'all') return 'Todos os projetos';
    return projectOptions.find((project) => project.id === selectedProjectId)?.label || 'Selecionar projeto';
  }, [projectOptions, selectedProjectId]);

  const topRiskScore = useMemo(() => {
    const dataset = riskData.datasets[0]?.data || [];
    if (!dataset.length) return 0;
    return Number(dataset[0] || 0);
  }, [riskData]);

  const kpiSparks = useMemo(() => {
    const projects = [Math.max(kpis.totalProjects * 0.55, 1), Math.max(kpis.totalProjects * 0.78, 1), Math.max(kpis.totalProjects, 1)];
    const consumed = [Math.max(kpis.totalConsumedHours * 0.38, 0.5), Math.max(kpis.totalConsumedHours * 0.72, 0.5), Math.max(kpis.totalConsumedHours, 0.5)];
    const pending = [Math.max(kpis.totalPendingHours * 0.95, 0.5), Math.max(kpis.totalPendingHours * 1.15, 0.5), Math.max(kpis.totalPendingHours, 0.5)];
    const rate = [Math.max(kpis.consumptionRate * 0.45, 1), Math.max(kpis.consumptionRate * 0.7, 1), Math.max(kpis.consumptionRate, 1)];
    return {
      projects: sparklinePoints(projects),
      consumed: sparklinePoints(consumed),
      pending: sparklinePoints(pending),
      rate: sparklinePoints(rate),
    };
  }, [kpis]);

  return (
    <Layout>
      <div className="space-y-4 bg-[#edf3fa] p-2 sm:p-3">
        <div className="rounded-lg border border-[#d7e1ee] bg-[#f4f7fb] p-3.5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0b5fad]">
                <BarChart3 className="h-3.5 w-3.5" />
                Indicadores de Projetos
              </div>
              <h1 className="mt-2 text-lg font-semibold text-[#24476c]">Dashboard dinâmico de KPIs e correlações</h1>
              <p className="mt-1 text-xs text-[#5f7288]">
                Monte seu painel com widgets, reorganize os blocos e explore tendências operacionais com visualizações em Chart.js.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={resetLayout}>
                Resetar layout
              </Button>
            </div>
          </div>
        </div>

        <Card className="border-[#d7e1ee] bg-[#f6f9fc] shadow-none">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-2">
              <Label className="text-[#4f6177]">Buscar projeto</Label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Código, nome ou cliente"
                data-testid="input-project-indicators-search"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[#4f6177]">Projeto</Label>
              <Popover open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={projectFilterOpen}
                    className="w-full justify-between"
                    data-testid="select-project-indicators-project-filter"
                  >
                    <span className="truncate text-left">{selectedProjectLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar projeto por código ou nome..." />
                    <CommandList>
                      <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="Todos os projetos"
                          onSelect={() => {
                            setSelectedProjectId('all');
                            setProjectFilterOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', selectedProjectId === 'all' ? 'opacity-100' : 'opacity-0')} />
                          Todos os projetos
                        </CommandItem>
                        {projectOptions.map((project) => (
                          <CommandItem
                            key={project.id}
                            value={project.label}
                            onSelect={() => {
                              setSelectedProjectId(project.id);
                              setProjectFilterOpen(false);
                            }}
                          >
                            <Check
                              className={cn('mr-2 h-4 w-4', selectedProjectId === project.id ? 'opacity-100' : 'opacity-0')}
                            />
                            {project.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-[#4f6177]">Janela de análise</Label>
              <Select value={timeRangeDays} onValueChange={(value) => setTimeRangeDays(value as TimeRange)}>
                <SelectTrigger data-testid="select-project-indicators-time-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="180">180 dias</SelectItem>
                  <SelectItem value="365">365 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#4f6177]">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-project-indicators-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status === 'all' ? 'Todos os status' : (statusLabelMap[status] || status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[#4f6177]">Adicionar widget</Label>
              <div className="flex items-center gap-2">
                <Select value={widgetDraftType} onValueChange={(value) => setWidgetDraftType(value as WidgetType)}>
                  <SelectTrigger data-testid="select-project-indicators-widget-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {widgetCatalog.map((item) => (
                      <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addWidget} data-testid="button-project-indicators-add-widget">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-3">
          {widgets.map((widget, index) => {
            const title = getWidgetTitle(widget.type);

            return (
              <Card
                key={widget.id}
                className={cn(
                  'border-[#d4e0ed] bg-white shadow-none transition-all duration-700 ease-out',
                  getWidgetSpan(widget.size),
                  cardsAnimated ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                  draggedWidgetId === widget.id && 'opacity-65 ring-2 ring-[#0b5fad]/35',
                  resizingWidgetId === widget.id && 'border-[#0b5fad]/50 ring-2 ring-[#0b5fad]/30',
                  dropTargetWidgetId === widget.id && draggedWidgetId !== widget.id && 'border-[#0b5fad]/50 ring-2 ring-[#0b5fad]/30'
                )}
                style={{ transitionDelay: `${Math.min(index * 60, 320)}ms` }}
                onDragOver={(event) => handleWidgetDragOver(event, widget.id)}
                onDrop={(event) => handleWidgetDrop(event, widget.id)}
              >
                <CardHeader className="pb-2 border-b border-[#e3e9f1]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">{title}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="outline"
                        className="flex cursor-grab select-none items-center gap-1 text-[10px] active:cursor-grabbing"
                        draggable
                        onDragStart={(event) => handleWidgetDragStart(event, widget.id)}
                        onDragEnd={clearDragState}
                      >
                        <GripVertical className="h-3 w-3" />
                        Widget
                      </Badge>
                      <Select
                        value={widget.size}
                        onValueChange={(value) => changeWidgetSize(widget.id, value as WidgetSize)}
                      >
                        <SelectTrigger className="h-8 w-[92px]" data-testid={`select-widget-size-${widget.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sm">Compacto</SelectItem>
                          <SelectItem value="md">Médio</SelectItem>
                          <SelectItem value="lg">Largo</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveWidget(widget.id, 'up')}
                        disabled={index === 0}
                        data-testid={`button-widget-up-${widget.id}`}
                      >
                        <MoveUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveWidget(widget.id, 'down')}
                        disabled={index === widgets.length - 1}
                        data-testid={`button-widget-down-${widget.id}`}
                      >
                        <MoveDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-600 hover:text-rose-700"
                        onClick={() => removeWidget(widget.id)}
                        data-testid={`button-widget-remove-${widget.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {isChartWidget(widget.type) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[#0b5fad] hover:text-[#084a86]"
                          onClick={() => saveWidgetAsImage(widget.id, title)}
                          data-testid={`button-widget-save-image-${widget.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative" style={{ minHeight: widget.height }}>
                  {widget.type === 'kpi' ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border border-[#dbe4ef] bg-[#f8fbff] p-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-[#6a7f96]">Projetos no recorte</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="tabular-nums text-2xl font-semibold text-[#1f3f63]">{kpis.totalProjects}</p>
                          <svg viewBox="0 0 120 32" className="h-8 w-[90px] text-[#2563eb]">
                            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={kpiSparks.projects} />
                          </svg>
                        </div>
                      </div>
                      <div className="rounded-md border border-[#dbe4ef] bg-[#f8fbff] p-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-[#6a7f96]">Horas consumidas</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="tabular-nums text-2xl font-semibold text-[#1f3f63]">{kpis.totalConsumedHours.toFixed(1)}h</p>
                          <svg viewBox="0 0 120 32" className="h-8 w-[90px] text-[#2563eb]">
                            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={kpiSparks.consumed} />
                          </svg>
                        </div>
                      </div>
                      <div className="rounded-md border border-[#dbe4ef] bg-[#f8fbff] p-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-[#6a7f96]">Horas pendentes</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="tabular-nums text-2xl font-semibold text-[#1f3f63]">{kpis.totalPendingHours.toFixed(1)}h</p>
                          <svg viewBox="0 0 120 32" className="h-8 w-[90px] text-[#2563eb]">
                            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={kpiSparks.pending} />
                          </svg>
                        </div>
                      </div>
                      <div className="rounded-md border border-[#dbe4ef] bg-[#f8fbff] p-3">
                        <p className="text-xs uppercase tracking-[0.08em] text-[#6a7f96]">Taxa de consumo</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="tabular-nums text-2xl font-semibold text-[#1f3f63]">{kpis.consumptionRate.toFixed(1)}%</p>
                          <svg viewBox="0 0 120 32" className="h-8 w-[90px] text-[#2563eb]">
                            <polyline fill="none" stroke="currentColor" strokeWidth="2" points={kpiSparks.rate} />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {widget.type === 'status' ? (
                    <div
                      className="h-full rounded-md border border-[#f1f5f9] bg-[#ffffff] shadow-sm p-2"
                      style={{ height: Math.max(widget.height - 60, 230) }}
                      ref={(element) => {
                        chartContainerRefs.current[widget.id] = element;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#5f7288]">
                          <PieChart className="h-3.5 w-3.5" />
                          Status
                        </div>
                        <div className="tabular-nums text-xs font-semibold text-[#264a72]">{kpis.totalProjects} projetos</div>
                      </div>
                      <div className="h-[calc(100%-26px)]">
                        {isLoading ? (
                          <div className="h-full animate-pulse rounded-md border border-dashed border-[#cfdae8] bg-gradient-to-br from-[#f2f6fb] to-[#e8eef6]" />
                        ) : statusChartData.labels && statusChartData.labels.length > 0 ? (
                          <Doughnut
                            data={statusChartData}
                            key={`status-${timeRangeDays}-${statusFilter}-${selectedProjectId}-${search}-${statusChartData.labels?.length || 0}`}
                            options={{
                              ...baseChartOptions,
                              cutout: '62%',
                              radius: '94%',
                              animation: {
                                ...baseChartOptions.animation,
                                animateRotate: true,
                                animateScale: true,
                              },
                              plugins: {
                                ...baseChartOptions.plugins,
                                legend: {
                                  position: 'bottom',
                                  labels: {
                                    color: 'rgb(94, 105, 126)',
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    boxWidth: 8,
                                    padding: 12,
                                  },
                                },
                              },
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                            Sem dados para o filtro atual.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {widget.type === 'budget' ? (
                    <div
                      className="h-full rounded-md border border-[#f1f5f9] bg-[#ffffff] shadow-sm p-2"
                      style={{ height: Math.max(widget.height - 60, 240) }}
                      ref={(element) => {
                        chartContainerRefs.current[widget.id] = element;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#5f7288]">
                          <Wallet className="h-3.5 w-3.5" />
                          Orçado x consumido
                        </div>
                        <div className="tabular-nums text-xs font-semibold text-[#264a72]">{compactNumber(kpis.totalConsumedHours)}h</div>
                      </div>
                      <div className="h-[calc(100%-26px)]">
                        {isLoading ? (
                          <div className="h-full animate-pulse rounded-md border border-dashed border-[#cfdae8] bg-gradient-to-br from-[#f2f6fb] to-[#e8eef6]" />
                        ) : budgetVsConsumedData.labels && budgetVsConsumedData.labels.length > 0 ? (
                          <Bar
                            data={budgetVsConsumedData}
                            key={`budget-${timeRangeDays}-${statusFilter}-${selectedProjectId}-${search}-${budgetVsConsumedData.labels?.length || 0}`}
                            options={{
                              ...baseChartOptions,
                              scales: {
                                x: {
                                  ticks: { color: 'rgb(94, 105, 126)' },
                                  grid: { color: 'rgba(148, 163, 184, 0.10)' },
                                },
                                y: {
                                  ticks: { color: 'rgb(94, 105, 126)' },
                                  grid: { color: 'rgba(148, 163, 184, 0.18)' },
                                  beginAtZero: true,
                                },
                              },
                              plugins: {
                                ...baseChartOptions.plugins,
                                legend: {
                                  position: 'bottom',
                                  labels: {
                                    color: 'rgb(94, 105, 126)',
                                    padding: 10,
                                  },
                                },
                              },
                              animation: {
                                ...baseChartOptions.animation,
                                delay(context) {
                                  if (context.type === 'data') return context.dataIndex * 70;
                                  return 0;
                                },
                              },
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                            Sem projetos suficientes para comparação.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {widget.type === 'burn' ? (
                    <div
                      className="h-full rounded-md border border-[#f1f5f9] bg-[#ffffff] shadow-sm p-2"
                      style={{ height: Math.max(widget.height - 60, 240) }}
                      ref={(element) => {
                        chartContainerRefs.current[widget.id] = element;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#5f7288]">
                          <Flame className="h-3.5 w-3.5" />
                          Tendência
                        </div>
                        <div className="tabular-nums text-xs font-semibold text-[#264a72]">{kpis.consumptionRate.toFixed(1)}%</div>
                      </div>
                      <div className="h-[calc(100%-26px)]">
                        {isLoading ? (
                          <div className="h-full animate-pulse rounded-md border border-dashed border-[#cfdae8] bg-gradient-to-br from-[#f2f6fb] to-[#e8eef6]" />
                        ) : burnTrendData.labels && burnTrendData.labels.length > 1 ? (
                          <Line
                            data={burnTrendData}
                            key={`burn-${timeRangeDays}-${statusFilter}-${selectedProjectId}-${search}-${burnTrendData.labels?.length || 0}`}
                            options={{
                              ...baseChartOptions,
                              elements: {
                                ...baseChartOptions.elements,
                                line: { borderWidth: 2 },
                                point: {
                                  radius: isWideScreen ? 2.2 : 1.4,
                                  hoverRadius: isWideScreen ? 5.2 : 3.5,
                                  hitRadius: isWideScreen ? 10 : 7,
                                },
                                line: {
                                  borderWidth: isWideScreen ? 2.4 : 1.8,
                                  tension: 0.35,
                                },
                              },
                              plugins: {
                                ...baseChartOptions.plugins,
                                legend: {
                                  position: 'bottom',
                                  labels: {
                                    color: 'rgb(94, 105, 126)',
                                    padding: 10,
                                  },
                                },
                              },
                              animation: {
                                ...baseChartOptions.animation,
                                delay(context) {
                                  if (context.type === 'data') return context.dataIndex * 55;
                                  return 0;
                                },
                              },
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                            Sem série histórica suficiente para tendência.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {widget.type === 'risk' ? (
                    <div
                      className="h-full rounded-md border border-[#f1f5f9] bg-[#ffffff] shadow-sm p-2"
                      style={{ height: Math.max(widget.height - 60, 240) }}
                      ref={(element) => {
                        chartContainerRefs.current[widget.id] = element;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#5f7288]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Risco operacional
                        </div>
                        <div className="tabular-nums text-xs font-semibold text-[#264a72]">Top {topRiskScore.toFixed(1)}</div>
                      </div>
                      <div className="h-[calc(100%-26px)]">
                        {isLoading ? (
                          <div className="h-full animate-pulse rounded-md border border-dashed border-[#cfdae8] bg-gradient-to-br from-[#f2f6fb] to-[#e8eef6]" />
                        ) : riskData.labels && riskData.labels.length > 0 ? (
                          <Bar
                            data={riskData}
                            key={`risk-${timeRangeDays}-${statusFilter}-${selectedProjectId}-${search}-${riskData.labels?.length || 0}`}
                            options={{
                              ...baseChartOptions,
                              indexAxis: 'y',
                              scales: {
                                x: {
                                  ticks: { color: 'rgb(94, 105, 126)' },
                                  grid: { color: 'rgba(148, 163, 184, 0.16)' },
                                  beginAtZero: true,
                                },
                                y: {
                                  ticks: { color: 'rgb(94, 105, 126)' },
                                  grid: { display: false },
                                },
                              },
                              plugins: {
                                ...baseChartOptions.plugins,
                                legend: {
                                  display: false,
                                },
                              },
                              elements: {
                                ...baseChartOptions.elements,
                                bar: {
                                  borderRadius: 10,
                                  borderSkipped: false,
                                },
                              },
                              animation: {
                                ...baseChartOptions.animation,
                                delay(context) {
                                  if (context.type === 'data') return context.dataIndex * 75;
                                  return 0;
                                },
                              },
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                            Sem dados de risco para o recorte atual.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {widget.type === 'ceo' ? (
                    <div
                      className="h-full rounded-md border border-[#f1f5f9] bg-[#ffffff] shadow-sm p-2"
                      style={{ height: Math.max(widget.height - 60, 290) }}
                      ref={(element) => {
                        chartContainerRefs.current[widget.id] = element;
                      }}
                    >
                      <div className="mb-2 flex items-center justify-between px-1">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-[#5f7288]">
                          <Wallet className="h-3.5 w-3.5" />
                          Visão financeira executiva
                        </div>
                        <div className="tabular-nums text-xs font-semibold text-[#264a72]">
                          Desvio total: {ceoExecutive.totalVariancePct.toFixed(1)}%
                        </div>
                      </div>

                      <div className="mb-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border border-[#dbe4ef] bg-white p-2">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6a7f96]">Budget portfólio</p>
                          <p className="tabular-nums mt-1 text-sm font-semibold text-[#1f3f63]">{formatCurrencyBRL(ceoExecutive.totalBudget)}</p>
                        </div>
                        <div className="rounded-md border border-[#dbe4ef] bg-white p-2">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6a7f96]">Atual estimado</p>
                          <p className="tabular-nums mt-1 text-sm font-semibold text-[#1f3f63]">{formatCurrencyBRL(ceoExecutive.totalActual)}</p>
                        </div>
                        <div className="rounded-md border border-[#dbe4ef] bg-white p-2">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6a7f96]">EAC estimado</p>
                          <p className="tabular-nums mt-1 text-sm font-semibold text-[#1f3f63]">{formatCurrencyBRL(ceoExecutive.totalEac)}</p>
                        </div>
                        <div className="rounded-md border border-[#dbe4ef] bg-white p-2">
                          <p className="text-[10px] uppercase tracking-[0.08em] text-[#6a7f96]">Desvio previsto</p>
                          <p className={cn('tabular-nums mt-1 text-sm font-semibold', ceoExecutive.totalVariance > 0 ? 'text-[#b91c1c]' : 'text-[#0a4f8a]')}>
                            {formatCurrencyBRL(ceoExecutive.totalVariance)}
                          </p>
                        </div>
                      </div>

                      <div className="h-[calc(100%-120px)]">
                        {isLoading ? (
                          <div className="h-full animate-pulse rounded-md border border-dashed border-[#cfdae8] bg-gradient-to-br from-[#f2f6fb] to-[#e8eef6]" />
                        ) : ceoExecutive.varianceChartData.labels && ceoExecutive.varianceChartData.labels.length > 0 ? (
                          <Bar
                            data={ceoExecutive.varianceChartData}
                            key={`ceo-${timeRangeDays}-${statusFilter}-${selectedProjectId}-${search}-${ceoExecutive.varianceChartData.labels?.length || 0}`}
                            options={{
                              ...baseChartOptions,
                              scales: {
                                x: {
                                  ticks: { color: 'rgb(94, 105, 126)' },
                                  grid: { color: 'rgba(148, 163, 184, 0.10)' },
                                },
                                y: {
                                  ticks: {
                                    color: 'rgb(94, 105, 126)',
                                    callback(value) {
                                      return `${value}%`;
                                    },
                                  },
                                  grid: { color: 'rgba(148, 163, 184, 0.16)' },
                                },
                              },
                              plugins: {
                                ...baseChartOptions.plugins,
                                legend: {
                                  display: false,
                                },
                              },
                              animation: {
                                ...baseChartOptions.animation,
                                delay(context) {
                                  if (context.type === 'data') return context.dataIndex * 70;
                                  return 0;
                                },
                              },
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                            Sem base financeira suficiente para análise executiva.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onMouseDown={(event) => handleResizeStart(event, widget)}
                    className="absolute bottom-3 right-3 h-4 w-4 cursor-nwse-resize rounded-sm border border-border/80 bg-background/85"
                    aria-label={`Redimensionar widget ${title}`}
                    data-testid={`button-widget-resize-${widget.id}`}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center text-muted-foreground">
            Carregando indicadores...
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
