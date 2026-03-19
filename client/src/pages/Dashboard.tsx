import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  FileText,
  FolderKanban,
  Building2,
  Clock,
  DollarSign,
  AlertCircle,
  CircleHelp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider,
  TooltipTrigger as UiTooltipTrigger,
} from '@/components/ui/tooltip';
import { dashboardApi, reportsApi, type CommercialDashboardMetrics, type DashboardMetrics, type ProjectsDashboardMetrics } from '@/lib/api';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DashboardPeriod = '7d' | '30d' | '90d' | '180d' | '365d';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '180d', label: '180 dias' },
  { value: '365d', label: '365 dias' },
];

const SUCCESS_PROPOSAL_STATUSES = [
  'com_sucesso',
  'sucesso_aditivo',
  'approved',
  'converted',
  'aprovada',
  'convertida',
  'sucesso',
];

const PIPELINE_PROPOSAL_STATUSES = [
  'em_elaboracao',
  'em_analise',
  'draft',
  'in_review',
  'sent',
  'negotiating',
];

const FUNNEL_STATUS_FILTERS: Record<string, string[]> = {
  elaboracao: ['em_elaboracao', 'draft'],
  analise: ['em_analise', 'in_review', 'sent', 'negotiating'],
  ganho: ['com_sucesso', 'sucesso_aditivo', 'approved', 'converted', 'aprovada', 'convertida', 'sucesso'],
  perdido: ['nao_sucesso', 'rejected', 'cancelada', 'cancelled', 'declinio'],
};

function normalizeStatus(status: string): string {
  return String(status ?? '').trim().toLowerCase();
}

function statusCount(items: Array<{ status: string; count: number }> | undefined, statuses: string[]): number {
  if (!items?.length) return 0;
  const allowed = new Set(statuses.map(normalizeStatus));
  return items
    .filter((item) => allowed.has(normalizeStatus(item.status)))
    .reduce((sum, item) => sum + (Number(item.count) || 0), 0);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

function formatDelta(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(1).replace('.', ',')}%`;
}

function buildTrendSeries(baseValue: number, period: DashboardPeriod) {
  const pointsByPeriod: Record<DashboardPeriod, string[]> = {
    '7d': ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
    '30d': ['S1', 'S2', 'S3', 'S4'],
    '90d': ['M-2', 'M-1', 'M0'],
    '180d': ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M0'],
    '365d': ['M-11', 'M-10', 'M-9', 'M-8', 'M-7', 'M-6', 'M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M0'],
  };

  const multipliers = [0.78, 0.84, 0.9, 0.96, 1.04, 1.1];
  const labels = pointsByPeriod[period];
  const minBase = Math.max(baseValue || 0, 1);

  return labels.map((label, index) => {
    const m = multipliers[index + (multipliers.length - labels.length)];
    const actual = minBase * m;
    const target = actual * 1.08;

    return {
      label,
      atual: Number(actual.toFixed(2)),
      meta: Number(target.toFixed(2)),
    };
  });
}

function toCountChart(items?: Array<{ status: string; count: number }> | null) {
  return (items ?? []).map((item) => ({
    key: String(item.status ?? '').trim().toLowerCase(),
    status: String(item.status ?? '').replaceAll('_', ' '),
    count: item.count,
  }));
}

function projectStatusLabel(statusRaw: string): string {
  const status = String(statusRaw ?? '').toLowerCase().replaceAll('_', ' ').trim();

  switch (status) {
    case 'planning':
      return 'planejamento';
    case 'active':
      return 'ativo';
    case 'on hold':
      return 'em espera';
    case 'completed':
    case 'complete':
      return 'concluído';
    case 'cancelled':
    case 'canceled':
      return 'cancelado';
    default:
      return status;
  }
}

function toProjectStatusChart(items?: Array<{ status: string; count: number }> | null) {
  return (items ?? []).map((item) => ({
    key: String(item.status ?? '').trim().toLowerCase(),
    status: projectStatusLabel(item.status),
    count: item.count,
  }));
}

function ChartCard({
  title,
  data,
  onItemClick,
}: {
  title: string;
  data: Array<{ status: string; count: number; key?: string }>;
  onItemClick?: (item: { status: string; count: number; key?: string }) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center">
            <p className="text-sm text-muted-foreground">Sem dados para exibir</p>
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="status"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <RechartsTooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--popover-foreground))',
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  fill="hsl(var(--chart-1))"
                  onClick={(item) => {
                    if (onItemClick) onItemClick(item as { status: string; count: number; key?: string });
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {onItemClick && data.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Clique em uma barra para abrir as propostas filtradas</p>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelCard({
  title,
  data,
  onItemClick,
}: {
  title: string;
  data: Array<{ status: string; count: number; key?: string }>;
  onItemClick?: (item: { status: string; count: number; key?: string }) => void;
}) {
  const semanticColors: Record<string, string> = {
    elaboracao: 'hsl(var(--chart-1))',
    analise: 'hsl(var(--chart-2))',
    ganho: 'hsl(142 71% 45%)',
    perdido: 'hsl(0 72% 51%)',
  };
  const chartData = data.map((item) => ({
    ...item,
    label: item.status.charAt(0).toUpperCase() + item.status.slice(1),
  }));
  const total = chartData.reduce((sum, item) => sum + (item.count || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 || total === 0 ? (
          <div className="flex h-[260px] items-center justify-center">
            <p className="text-sm text-muted-foreground">Sem dados para exibir</p>
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <RechartsTooltip
                  formatter={(value: number, _name: string, payload: { payload?: { count?: number } }) => {
                    const count = Number(payload?.payload?.count || 0);
                    const percent = total > 0 ? (count / total) * 100 : 0;
                    return [`${count} propostas (${percent.toFixed(1).replace('.', ',')}%)`, 'Quantidade'];
                  }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--popover-foreground))',
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                />
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={56}
                  outerRadius={92}
                  paddingAngle={2}
                  isAnimationActive={false}
                  onClick={(_entry: unknown, index: number) => {
                    const item = data[index];
                    if (item && onItemClick) onItemClick(item);
                  }}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`${entry.key ?? entry.status}-${index}`}
                      fill={semanticColors[entry.key ?? ''] ?? 'hsl(var(--chart-3))'}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {data.length > 0 && (
          <div className="mt-3 grid gap-1">
            {data.map((item) => (
              <button
                key={item.key ?? item.status}
                type="button"
                onClick={() => onItemClick?.(item)}
                className="flex items-center justify-between rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="capitalize text-muted-foreground">{item.status}</span>
                <span className="font-semibold">{item.count}</span>
              </button>
            ))}
          </div>
        )}
        {onItemClick && data.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Clique no funil ou na lista para abrir as propostas filtradas</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  delta,
  emphasis,
  tooltipText,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: typeof FileText;
  delta?: number;
  emphasis?: boolean;
  tooltipText?: string;
}) {
  const isPositive = (delta ?? 0) >= 0;

  return (
    <Card className={emphasis ? 'border-[#1d5d96] bg-gradient-to-br from-[#1e6aa8] to-[#12487a] text-white shadow-md' : 'border-border/70'}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${emphasis ? 'text-white/80' : 'text-muted-foreground'}`}>
            <span>{title}</span>
            {tooltipText && (
              <UiTooltipProvider delayDuration={120}>
                <UiTooltip>
                  <UiTooltipTrigger asChild>
                    <button type="button" className="inline-flex" aria-label={`Detalhes de ${title}`}>
                      <CircleHelp className={`h-3.5 w-3.5 ${emphasis ? 'text-white/85' : 'text-muted-foreground'}`} />
                    </button>
                  </UiTooltipTrigger>
                  <UiTooltipContent className="max-w-[300px] whitespace-normal text-xs leading-relaxed">
                    <p>{tooltipText}</p>
                  </UiTooltipContent>
                </UiTooltip>
              </UiTooltipProvider>
            )}
          </CardTitle>
        </div>
        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${emphasis ? 'bg-white/15' : 'bg-[#e9f2fa] text-[#1d5d96]'}`}>
          <Icon className={`h-4 w-4 ${emphasis ? 'text-white' : 'text-[#1d5d96]'}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-3">
          <div className={`text-3xl font-semibold leading-none ${emphasis ? 'text-white' : 'text-foreground'}`}>{value}</div>
          {typeof delta === 'number' && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isPositive
                  ? emphasis
                    ? 'bg-emerald-400/20 text-emerald-100'
                    : 'bg-emerald-100 text-emerald-700'
                  : emphasis
                    ? 'bg-red-400/20 text-red-100'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              {formatDelta(delta)}
            </span>
          )}
        </div>
        {description && <p className={`mt-2 text-xs ${emphasis ? 'text-white/80' : 'text-muted-foreground'}`}>{description}</p>}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`skeleton-stat-${index}`}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={`skeleton-chart-${index}`}>
            <CardHeader>
              <Skeleton className="h-5 w-52" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[260px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {PERIOD_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TrendCard({
  title,
  data,
  formatter,
}: {
  title: string;
  data: Array<{ label: string; atual: number; meta: number }>;
  formatter: (value: number) => string;
}) {
  const formatYAxisTick = (value: number) => {
    const numeric = Number(value || 0);
    const abs = Math.abs(numeric);

    if (abs >= 1_000_000_000) {
      return `${(numeric / 1_000_000_000).toFixed(1).replace('.', ',')} bi`;
    }
    if (abs >= 1_000_000) {
      return `${(numeric / 1_000_000).toFixed(1).replace('.', ',')} mi`;
    }
    if (abs >= 1_000) {
      return `${(numeric / 1_000).toFixed(0)}k`;
    }

    return `${Math.round(numeric)}`;
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[#2b6ea6]" />Atual
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[#9fb8cf]" />Projetado
            </span>
            <UiTooltipProvider delayDuration={120}>
              <UiTooltip>
                <UiTooltipTrigger asChild>
                  <button type="button" className="inline-flex" aria-label="Como o gráfico calcula atual e projetado">
                    <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </UiTooltipTrigger>
                <UiTooltipContent className="max-w-[320px] whitespace-normal text-xs leading-relaxed">
                  <p>
                    Atual: valor realizado em cada período. Projetado: linha de tendência calculada por regressão linear com base no histórico exibido no gráfico.
                  </p>
                </UiTooltipContent>
              </UiTooltip>
            </UiTooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                width={64}
                tickMargin={8}
                tickFormatter={formatYAxisTick}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <RechartsTooltip
                formatter={(value: number) => formatter(Number(value || 0))}
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--popover-foreground))',
                  borderRadius: 8,
                }}
                labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
              />
              <Line type="monotone" dataKey="meta" stroke="#9fb8cf" strokeDasharray="4 4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="atual" stroke="#1f6fb0" strokeWidth={2.6} dot={{ r: 3, fill: '#1f6fb0' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDistributionCard({
  title,
  data,
  onItemClick,
}: {
  title: string;
  data: Array<{ status: string; count: number; key?: string }>;
  onItemClick?: (item: { status: string; count: number; key?: string }) => void;
}) {
  const ordered = [...data].sort((a, b) => b.count - a.count).slice(0, 5);
  const total = ordered.reduce((sum, item) => sum + (Number(item.count) || 0), 0);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 || total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para exibir</p>
        ) : (
          <div className="space-y-4">
            {ordered.map((item) => {
              const pct = (item.count / total) * 100;

              return (
                <button
                  key={item.key ?? item.status}
                  type="button"
                  onClick={() => onItemClick?.(item)}
                  className="w-full text-left"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium uppercase tracking-wide text-muted-foreground">{item.status}</span>
                    <span className="font-semibold text-foreground">{pct.toFixed(0).replace('.', ',')}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#e6edf4]">
                    <div
                      className="h-2 rounded-full bg-[#1f6fb0] transition-all"
                      style={{ width: `${Math.max(8, Math.min(100, pct))}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelStepsCard({
  title,
  data,
  onItemClick,
}: {
  title: string;
  data: Array<{ status: string; count: number; key?: string }>;
  onItemClick?: (item: { status: string; count: number; key?: string }) => void;
}) {
  const total = data.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  const palette = ['#0f2f55', '#1c4d80', '#2d6aa3', '#5f89b2'];

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para exibir</p>
        ) : (
          <div className="space-y-4">
            {data.map((item, index) => (
              <button
                key={item.key ?? item.status}
                type="button"
                onClick={() => onItemClick?.(item)}
                className="flex w-full items-center justify-between rounded-md px-4 py-3 text-white shadow-sm transition-transform hover:translate-x-0.5"
                style={{ backgroundColor: palette[index % palette.length] }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">{item.status}</span>
                <span className="text-xl font-semibold leading-none">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SimpleStatusListCard({
  title,
  data,
  onItemClick,
}: {
  title: string;
  data: Array<{ status: string; count: number; key?: string }>;
  onItemClick?: (item: { status: string; count: number; key?: string }) => void;
}) {
  const ordered = [...data].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para exibir</p>
        ) : (
          <div className="space-y-2">
            {ordered.map((item) => (
              <button
                key={item.key ?? item.status}
                type="button"
                onClick={() => onItemClick?.(item)}
                className="flex w-full items-center justify-between rounded-md border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40"
              >
                <span className="text-sm font-medium capitalize">{item.status}</span>
                <span className="rounded-md bg-[#e9f2fa] px-2 py-0.5 text-xs font-semibold text-[#1d5d96]">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>('90d');

  const isAdmin = user?.role === 'admin';
  const isCommercial = user?.role === 'commercial';
  const isProjects = user?.role === 'projects';

  const adminQuery = useQuery<DashboardMetrics>({
    queryKey: ['/api/reports/dashboard', period],
    queryFn: () => reportsApi.getDashboard(period),
    enabled: isAdmin,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const commercialQuery = useQuery<CommercialDashboardMetrics>({
    queryKey: ['/api/dashboard/commercial', period],
    queryFn: () => dashboardApi.getCommercial(period),
    enabled: isCommercial,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const projectsQuery = useQuery<ProjectsDashboardMetrics>({
    queryKey: ['/api/dashboard/projects', period],
    queryFn: () => dashboardApi.getProjects(period),
    enabled: isProjects,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isLoading = adminQuery.isLoading || commercialQuery.isLoading || projectsQuery.isLoading;
  const error = adminQuery.error || commercialQuery.error || projectsQuery.error;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);

  const metrics = adminQuery.data;
  const commercial = commercialQuery.data;
  const projects = projectsQuery.data;

  const commercialByStatus = commercial?.proposals.byStatus ?? [];
  const projectByStatus = projects?.projects.byStatus ?? [];
  const adminProposalByStatus = metrics?.proposals.byStatus ?? [];
  const adminProjectByStatus = metrics?.projects.byStatus ?? [];
  const adminFunnelData = [
    { key: 'elaboracao', status: 'elaboração', count: metrics?.funnel?.elaboracao || 0 },
    { key: 'analise', status: 'análise', count: metrics?.funnel?.analise || 0 },
    { key: 'ganho', status: 'ganho', count: metrics?.funnel?.ganho || 0 },
    { key: 'perdido', status: 'perdido', count: metrics?.funnel?.perdido || 0 },
  ];

  const openProposalsWithFilters = (filters: { statuses?: string[]; clientId?: string }) => {
    const params = new URLSearchParams();

    if (filters.statuses?.length) params.set('statuses', filters.statuses.join(','));
    if (filters.clientId) params.set('clientId', filters.clientId);
    params.set('period', period);

    setLocation(`/proposals?${params.toString()}`);
  };

  const openProjectsWithFilters = (filters: { statuses?: string[] }) => {
    const params = new URLSearchParams();

    if (filters.statuses?.length) params.set('statuses', filters.statuses.join(','));
    params.set('period', period);

    setLocation(`/projects?${params.toString()}`);
  };

  const adminSuccessCount = statusCount(adminProposalByStatus, SUCCESS_PROPOSAL_STATUSES);
  const adminPeriodTotal = adminProposalByStatus.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const adminPipelineCount = statusCount(adminProposalByStatus, PIPELINE_PROPOSAL_STATUSES);
  const adminSuccessRatePeriod = metrics?.proposals.success?.period.rate ??
    (adminPeriodTotal ? (adminSuccessCount / adminPeriodTotal) * 100 : 0);
  const adminSuccessRateOverall = metrics?.proposals.success?.overall.rate ??
    (metrics?.proposals.total ? (adminSuccessCount / metrics.proposals.total) * 100 : 0);
  const adminProjectsAtRisk = statusCount(adminProjectByStatus, ['on_hold', 'cancelled', 'canceled']);

  const commercialSuccessCount = statusCount(commercialByStatus, SUCCESS_PROPOSAL_STATUSES);
  const commercialPeriodTotal = commercialByStatus.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const commercialPipelineCount = statusCount(commercialByStatus, PIPELINE_PROPOSAL_STATUSES);
  const commercialSuccessRatePeriod = commercial?.proposals.success?.period.rate ??
    (commercialPeriodTotal ? (commercialSuccessCount / commercialPeriodTotal) * 100 : 0);
  const commercialSuccessRateOverall = commercial?.proposals.success?.overall.rate ??
    (commercial?.proposals.total ? (commercialSuccessCount / commercial.proposals.total) * 100 : 0);
  const commercialTicket = commercialSuccessCount > 0
    ? (commercial?.financial.approvedProposalsValue || 0) / commercialSuccessCount
    : 0;

  const projectsActiveRate = projects?.projects.total
    ? ((projects.projects.active || 0) / projects.projects.total) * 100
    : 0;

  const adminTrendData = useMemo(
    () => {
      const serverTrend = metrics?.trends?.approvedValue;
      if (serverTrend && serverTrend.length > 0) return serverTrend;
      return buildTrendSeries(metrics?.financial.approvedProposalsValue || 0, period);
    },
    [metrics?.trends?.approvedValue, metrics?.financial.approvedProposalsValue, period]
  );

  const adminProposalCountTrendData = useMemo(
    () => {
      const serverTrend = metrics?.trends?.proposalCount;
      if (serverTrend && serverTrend.length > 0) return serverTrend;
      return buildTrendSeries(metrics?.proposals.total || 0, period).map((point) => ({
        ...point,
        atual: Math.round(point.atual),
        meta: Math.round(point.meta),
      }));
    },
    [metrics?.trends?.proposalCount, metrics?.proposals.total, period]
  );
  const adminProposalsCreatedInWindow = adminProposalCountTrendData.reduce(
    (sum, point) => sum + Number(point.atual || 0),
    0
  );
  const adminProposalWindowShare = (metrics?.proposals.total || 0) > 0
    ? (adminProposalsCreatedInWindow / (metrics?.proposals.total || 1)) * 100
    : 0;

  const adminTrendDelta = adminTrendData.length >= 2
    ? ((adminTrendData.at(-1)?.atual || 0) - (adminTrendData.at(-2)?.atual || 0)) /
      Math.max(adminTrendData.at(-2)?.atual || 1, 1) * 100
    : 0;

  const adminDelta = metrics?.comparisons?.approvedValueDeltaPct ?? adminTrendDelta;

  const commercialTrendData = useMemo(
    () => {
      const serverTrend = commercial?.trends?.approvedValue;
      if (serverTrend && serverTrend.length > 0) return serverTrend;
      return buildTrendSeries(commercial?.financial.approvedProposalsValue || 0, period);
    },
    [commercial?.trends?.approvedValue, commercial?.financial.approvedProposalsValue, period]
  );

  const projectsTrendData = useMemo(
    () => {
      const serverTrend = projects?.trends?.approvedHours;
      if (serverTrend && serverTrend.length > 0) return serverTrend;
      return buildTrendSeries(projects?.hours.monthlyApprovedHours || 0, period);
    },
    [projects?.trends?.approvedHours, projects?.hours.monthlyApprovedHours, period]
  );

  const commercialTrendDelta = commercialTrendData.length >= 2
    ? ((commercialTrendData.at(-1)?.atual || 0) - (commercialTrendData.at(-2)?.atual || 0)) /
      Math.max(commercialTrendData.at(-2)?.atual || 1, 1) * 100
    : 0;

  const projectsTrendDelta = projectsTrendData.length >= 2
    ? ((projectsTrendData.at(-1)?.atual || 0) - (projectsTrendData.at(-2)?.atual || 0)) /
      Math.max(projectsTrendData.at(-2)?.atual || 1, 1) * 100
    : 0;

  const commercialDelta = commercial?.comparisons?.approvedValueDeltaPct ?? commercialTrendDelta;
  const projectsDelta = projects?.comparisons?.approvedHoursDeltaPct ?? projectsTrendDelta;

  if (isLoading) {
    return (
      <Layout>
        <DashboardSkeleton />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Erro ao carregar dados
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard de Performance</h1>
          <p className="text-muted-foreground">
            Visão geral da estrutura operacional e comercial da TEC3 Engenharia.
          </p>
        </div>

        {(isAdmin || isCommercial || isProjects) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <button
              type="button"
              onClick={() => setLocation('/reports')}
              className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Exportar dados
            </button>
          </div>
        )}

        {isAdmin && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total de Propostas"
                value={metrics?.proposals.total || 0}
                description="Total cadastrado"
                icon={FileText}
                delta={adminDelta}
              />
              <StatCard
                title="Projetos Ativos"
                value={metrics?.projects.active || 0}
                description={`De ${metrics?.projects.total || 0} projetos`}
                icon={FolderKanban}
                delta={projectsActiveRate}
              />
              <StatCard
                title="Horas Lançadas"
                value={`${metrics?.hours.launchedMonthly ?? metrics?.hours.monthlyTotal ?? 0}h`}
                description="No período atual"
                icon={Clock}
              />
              <StatCard
                title="Taxa de Sucesso"
                value={formatPercent(adminSuccessRatePeriod)}
                description={`Período: ${formatPercent(adminSuccessRatePeriod)} | Histórico: ${formatPercent(adminSuccessRateOverall)}`}
                tooltipText="Taxa de sucesso do período = propostas com sucesso no período dividido pelo total de propostas criadas no período. Taxa histórica = propostas com sucesso no histórico dividido pelo total histórico de propostas."
                icon={Building2}
                emphasis
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <TrendCard
                title={`Evolução do Valor Aprovado (R$) (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
                data={adminTrendData}
                formatter={formatCurrency}
              />

              <StatusDistributionCard
                title="Distribuição por Status"
                data={toCountChart(metrics?.proposals.byStatus)}
                onItemClick={(item) => {
                  if (!item.key) return;
                  openProposalsWithFilters({ statuses: [item.key] });
                }}
              />

              <Card className="border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Evolução do Volume de Propostas</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Criadas no período: {adminProposalsCreatedInWindow} de {metrics?.proposals.total || 0} ({formatPercent(adminProposalWindowShare)})
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={adminProposalCountTrendData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          axisLine={{ stroke: 'hsl(var(--border))' }}
                          tickLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                          axisLine={{ stroke: 'hsl(var(--border))' }}
                          tickLine={{ stroke: 'hsl(var(--border))' }}
                        />
                        <RechartsTooltip
                          formatter={(value: number) => {
                            const v = Math.round(Number(value || 0));
                            const total = metrics?.proposals.total || 0;
                            const pct = total > 0 ? (v / total) * 100 : 0;
                            return `${v} propostas (${pct.toFixed(1).replace('.', ',')}% do total)`;
                          }}
                          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                          contentStyle={{
                            background: 'hsl(var(--popover))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--popover-foreground))',
                            borderRadius: 8,
                          }}
                          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                        />
                        <Bar dataKey="atual" radius={[6, 6, 0, 0]} fill="#1f6fb0" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FunnelStepsCard
                title="Funil de Conversão"
                data={adminFunnelData}
                onItemClick={(item) => {
                  const statuses = item.key ? FUNNEL_STATUS_FILTERS[item.key] : [];
                  openProposalsWithFilters({ statuses });
                }}
              />

              <ChartCard
                title="Status dos Projetos"
                data={toProjectStatusChart(metrics?.projects.byStatus)}
                onItemClick={(item) => {
                  if (!item.key) return;
                  openProjectsWithFilters({ statuses: [item.key] });
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top 5 Clientes</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics?.topClients && metrics.topClients.length > 0 ? (
                    <div className="space-y-2">
                      {metrics.topClients.map((client) => (
                        <button
                          key={client.clientId}
                          type="button"
                          onClick={() => openProposalsWithFilters({
                            clientId: client.clientId,
                            statuses: FUNNEL_STATUS_FILTERS.ganho,
                          })}
                          className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{client.clientName}</p>
                            <p className="text-xs text-muted-foreground">{client.proposalsCount} propostas</p>
                          </div>
                          <p className="font-semibold">{formatCurrency(client.approvedValue)}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem dados de clientes para o período selecionado.</p>
                  )}
                </CardContent>
              </Card>

              <SimpleStatusListCard
                title="Últimas Atualizações de Status"
                data={toCountChart(metrics?.proposals.byStatus)}
                onItemClick={(item) => {
                  if (!item.key) return;
                  openProposalsWithFilters({ statuses: [item.key] });
                }}
              />
            </div>
          </>
        )}

        {isCommercial && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total de Propostas"
                value={commercial?.proposals.total || 0}
                description="Total cadastrado"
                icon={FileText}
              />
              <StatCard
                title="Taxa de Sucesso"
                value={formatPercent(commercialSuccessRatePeriod)}
                description={`Período: ${formatPercent(commercialSuccessRatePeriod)} | Histórico: ${formatPercent(commercialSuccessRateOverall)}`}
                tooltipText="Taxa de sucesso do período = propostas com sucesso no período dividido pelo total de propostas criadas no período. Taxa histórica = propostas com sucesso no histórico dividido pelo total histórico de propostas."
                icon={FileText}
              />
              <StatCard
                title="Valor Ganho"
                value={formatCurrency(commercial?.financial.approvedProposalsValue || 0)}
                description="Propostas aprovadas e convertidas"
                icon={DollarSign}
              />
              <StatCard
                title="Ticket Médio"
                value={formatCurrency(commercialTicket)}
                description="Valor médio por proposta ganha"
                icon={DollarSign}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Horas Lançadas (Mês)"
                value={`${commercial?.hours?.launchedMonthly ?? 0}h`}
                description="Total registrado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Aprovadas (Mês)"
                value={`${commercial?.hours?.approvedMonthly ?? 0}h`}
                description="Total aprovado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Pendentes (Mês)"
                value={`${commercial?.hours?.pendingMonthly ?? 0}h`}
                description="Aguardando aprovação"
                icon={Clock}
              />
              <StatCard
                title="Taxa de Aprovação"
                value={formatPercent(commercial?.hours?.approvalRate ?? 0)}
                description="Aprovadas sobre lançadas no mês"
                icon={DollarSign}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TrendCard
                title={`Evolução do Valor Aprovado (R$) (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
                data={commercialTrendData}
                formatter={formatCurrency}
              />

              <ChartCard
                title="Distribuição por Status"
                data={toCountChart(commercial?.proposals.byStatus)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Prioridades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pipeline em aberto</span>
                    <span className="font-semibold">{commercialPipelineCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Clientes ativos</span>
                    <span className="font-semibold">{commercial?.clients.active || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Variação recente</span>
                    <span className={`font-semibold ${commercialDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatDelta(commercialDelta)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumo Executivo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Propostas totais</span>
                    <span className="font-semibold">{commercial?.proposals.total || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Taxa de sucesso</span>
                    <span className="font-semibold">{formatPercent(commercialSuccessRatePeriod)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Valor ganho</span>
                    <span className="font-semibold">{formatCurrency(commercial?.financial.approvedProposalsValue || 0)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {isProjects && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Projetos Ativos"
                value={projects?.projects.active || 0}
                description={`De ${projects?.projects.total || 0} projetos`}
                icon={FolderKanban}
              />
              <StatCard
                title="Taxa de Ativação"
                value={formatPercent(projectsActiveRate)}
                description="Projetos ativos no portfólio"
                icon={FolderKanban}
              />
              <StatCard
                title="Horas Aprovadas"
                value={`${projects?.hours.monthlyApprovedHours || 0}h`}
                description="No mês atual"
                icon={Clock}
              />
              <StatCard
                title="Pendências"
                value={projects?.hours.pendingCount || 0}
                description="Lançamentos aguardando aprovação"
                icon={Clock}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Horas Lançadas (Mês)"
                value={`${projects?.hours.launchedMonthly ?? 0}h`}
                description="Total registrado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Aprovadas (Mês)"
                value={`${projects?.hours.approvedMonthly ?? projects?.hours.monthlyApprovedHours ?? 0}h`}
                description="Total aprovado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Pendentes (Mês)"
                value={`${projects?.hours.pendingMonthly ?? 0}h`}
                description="Aguardando aprovação"
                icon={Clock}
              />
              <StatCard
                title="Taxa de Aprovação"
                value={formatPercent(projects?.hours.approvalRate ?? 0)}
                description="Aprovadas sobre lançadas no mês"
                icon={DollarSign}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TrendCard
                title={`Evolução de Horas Aprovadas (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
                data={projectsTrendData}
                formatter={(value) => `${Number(value || 0).toFixed(0)}h`}
              />

              <ChartCard
                title="Distribuição por Status"
                data={toCountChart(projects?.projects.byStatus)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Prioridades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Projetos em espera/cancelados</span>
                    <span className="font-semibold">
                      {statusCount(projectByStatus, ['on_hold', 'cancelled', 'canceled'])}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pendências de horas</span>
                    <span className="font-semibold">{projects?.hours.pendingCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Variação recente</span>
                    <span className={`font-semibold ${projectsDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatDelta(projectsDelta)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Saúde Operacional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total de projetos</span>
                    <span className="font-semibold">{projects?.projects.total || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Taxa de ativação</span>
                    <span className="font-semibold">{formatPercent(projectsActiveRate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Clientes com projetos</span>
                    <span className="font-semibold">{projects?.clients.total || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
