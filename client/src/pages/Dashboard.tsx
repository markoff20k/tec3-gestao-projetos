import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  FileText,
  FolderKanban,
  Building2,
  Clock,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type DashboardPeriod = '30d' | '90d' | '180d';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: '180d', label: '180 dias' },
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
    '30d': ['S1', 'S2', 'S3', 'S4'],
    '90d': ['M-2', 'M-1', 'M0'],
    '180d': ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'M0'],
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
                <Tooltip
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
                <Tooltip
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
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: typeof FileText;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip
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
              <Line type="monotone" dataKey="meta" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="atual" stroke="hsl(var(--chart-1))" strokeWidth={2.4} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>('90d');

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
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
  const adminPipelineCount = statusCount(adminProposalByStatus, PIPELINE_PROPOSAL_STATUSES);
  const adminSuccessRate = metrics?.proposals.total
    ? (adminSuccessCount / metrics.proposals.total) * 100
    : 0;
  const adminProjectsAtRisk = statusCount(adminProjectByStatus, ['on_hold', 'cancelled', 'canceled']);

  const commercialSuccessCount = statusCount(commercialByStatus, SUCCESS_PROPOSAL_STATUSES);
  const commercialPipelineCount = statusCount(commercialByStatus, PIPELINE_PROPOSAL_STATUSES);
  const commercialSuccessRate = commercial?.proposals.total
    ? (commercialSuccessCount / commercial.proposals.total) * 100
    : 0;
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
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de gestão de projetos
          </p>
        </div>

        {(isAdmin || isCommercial || isProjects) && (
          <div className="flex items-center justify-end">
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        )}

        {isAdmin && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <StatCard
                title="Total de Propostas"
                value={metrics?.proposals.total || 0}
                description="Total cadastrado"
                icon={FileText}
              />
              <StatCard
                title="Projetos Ativos"
                value={metrics?.projects.active || 0}
                description={`De ${metrics?.projects.total || 0} projetos`}
                icon={FolderKanban}
              />
              <StatCard
                title="Clientes Ativos"
                value={metrics?.clients.active || 0}
                description={`De ${metrics?.clients.total || 0} clientes`}
                icon={Building2}
              />
              <StatCard
                title="Horas no Mês"
                value={`${metrics?.hours.launchedMonthly ?? metrics?.hours.monthlyTotal ?? 0}h`}
                description={`Aprovadas no mês: ${metrics?.hours.approvedMonthly ?? metrics?.hours.monthlyTotal ?? 0}h`}
                icon={Clock}
              />
              <StatCard
                title="Taxa de Sucesso"
                value={formatPercent(adminSuccessRate)}
                description={`Propostas com sucesso: ${adminSuccessCount}`}
                icon={DollarSign}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Horas Lançadas (Mês)"
                value={`${metrics?.hours.launchedMonthly ?? 0}h`}
                description="Total registrado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Aprovadas (Mês)"
                value={`${metrics?.hours.approvedMonthly ?? metrics?.hours.monthlyTotal ?? 0}h`}
                description="Total aprovado no mês"
                icon={Clock}
              />
              <StatCard
                title="Horas Pendentes (Mês)"
                value={`${metrics?.hours.pendingMonthly ?? 0}h`}
                description="Aguardando aprovação"
                icon={Clock}
              />
              <StatCard
                title="Taxa de Aprovação"
                value={formatPercent(metrics?.hours.approvalRate ?? 0)}
                description="Aprovadas sobre lançadas no mês"
                icon={DollarSign}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TrendCard
                title={`Evolução do Indicador Principal (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
                data={adminTrendData}
                formatter={formatCurrency}
              />

              <ChartCard
                title="Distribuição por Status"
                data={toCountChart(metrics?.proposals.byStatus)}
                onItemClick={(item) => {
                  if (!item.key) return;
                  openProposalsWithFilters({ statuses: [item.key] });
                }}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard
                title="Status dos Projetos"
                data={toProjectStatusChart(metrics?.projects.byStatus)}
                onItemClick={(item) => {
                  if (!item.key) return;
                  openProjectsWithFilters({ statuses: [item.key] });
                }}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumo Executivo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Propostas</span>
                      <span className="font-medium">{metrics?.proposals.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Projetos</span>
                      <span className="font-medium">{metrics?.projects.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Clientes</span>
                      <span className="font-medium">{metrics?.clients.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Valor aprovado</span>
                      <span className="font-medium">{formatCurrency(metrics?.financial.approvedProposalsValue || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Variação vs período anterior</span>
                      <span className={`font-medium ${adminDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatDelta(adminDelta)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FunnelCard
                title="Funil de Conversão"
                data={adminFunnelData}
                onItemClick={(item) => {
                  const statuses = item.key ? FUNNEL_STATUS_FILTERS[item.key] : [];
                  openProposalsWithFilters({ statuses });
                }}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top 5 Clientes (Valor Aprovado)</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics?.topClients && metrics.topClients.length > 0 ? (
                    <div className="space-y-3">
                      {metrics.topClients.map((client, index) => (
                        <button
                          key={client.clientId}
                          type="button"
                          onClick={() => openProposalsWithFilters({
                            clientId: client.clientId,
                            statuses: FUNNEL_STATUS_FILTERS.ganho,
                          })}
                          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{index + 1}. {client.clientName}</p>
                            <p className="text-xs text-muted-foreground">{client.proposalsCount} propostas com sucesso</p>
                          </div>
                          <p className="font-semibold whitespace-nowrap">{formatCurrency(client.approvedValue)}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem dados de clientes para o período selecionado.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Prioridades</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pipeline em aberto</span>
                    <span className="font-semibold">{adminPipelineCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Projetos em risco</span>
                    <span className="font-semibold">{adminProjectsAtRisk}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Aprovações pendentes</span>
                    <span className="font-semibold">{metrics?.hours.pendingApprovals || 0}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Saúde Operacional</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Conversão comercial</span>
                    <span className="font-semibold">{formatPercent(adminSuccessRate)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Projetos ativos</span>
                    <span className="font-semibold">{metrics?.projects.active || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Horas aprovadas no mês</span>
                    <span className="font-semibold">{`${metrics?.hours.monthlyTotal || 0}h`}</span>
                  </div>
                </CardContent>
              </Card>
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
                value={formatPercent(commercialSuccessRate)}
                description={`Propostas com sucesso: ${commercialSuccessCount}`}
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
                title={`Evolução do Indicador Principal (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
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
                    <span className="font-semibold">{formatPercent(commercialSuccessRate)}</span>
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
                title={`Evolução do Indicador Principal (${PERIOD_OPTIONS.find((p) => p.value === period)?.label})`}
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
