import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  FolderKanban,
  Building2,
  Clock,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi, reportsApi, type CommercialDashboardMetrics, type DashboardMetrics, type ProjectsDashboardMetrics } from '@/lib/api';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function toCountChart(items?: Array<{ status: string; count: number }> | null) {
  return (items ?? []).map((item) => ({
    status: String(item.status ?? '').replaceAll('_', ' '),
    count: item.count,
  }));
}

function ChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<{ status: string; count: number }>;
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
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="hsl(var(--chart-1))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
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

export default function Dashboard() {
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isCommercial = user?.role === 'commercial';
  const isProjects = user?.role === 'projects';

  const adminQuery = useQuery<DashboardMetrics>({
    queryKey: ['/api/reports/dashboard'],
    queryFn: () => reportsApi.getDashboard(),
    enabled: isAdmin,
  });

  const commercialQuery = useQuery<CommercialDashboardMetrics>({
    queryKey: ['/api/dashboard/commercial'],
    queryFn: () => dashboardApi.getCommercial(),
    enabled: isCommercial,
  });

  const projectsQuery = useQuery<ProjectsDashboardMetrics>({
    queryKey: ['/api/dashboard/projects'],
    queryFn: () => dashboardApi.getProjects(),
    enabled: isProjects,
  });

  const isLoading = adminQuery.isLoading || commercialQuery.isLoading || projectsQuery.isLoading;
  const error = adminQuery.error || commercialQuery.error || projectsQuery.error;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Carregando...</div>
        </div>
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);

  const metrics = adminQuery.data;
  const commercial = commercialQuery.data;
  const projects = projectsQuery.data;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de gestão de projetos
          </p>
        </div>

        {isAdmin && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Total de Propostas"
                value={metrics?.proposals.total || 0}
                description="Propostas cadastradas"
                icon={FileText}
              />
              <StatCard
                title="Projetos Ativos"
                value={metrics?.projects.active || 0}
                description={`de ${metrics?.projects.total || 0} projetos`}
                icon={FolderKanban}
              />
              <StatCard
                title="Clientes Ativos"
                value={metrics?.clients.active || 0}
                description={`de ${metrics?.clients.total || 0} clientes`}
                icon={Building2}
              />
              <StatCard
                title="Horas no Mês"
                value={`${metrics?.hours.monthlyTotal || 0}h`}
                description={`${metrics?.hours.pendingApprovals || 0} aguardando aprovação`}
                icon={Clock}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Valor de Propostas Aprovadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <DollarSign className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-3xl font-bold">
                        {formatCurrency(metrics?.financial.approvedProposalsValue || 0)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Total em propostas aprovadas e convertidas
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ChartCard
                title="Status das Propostas"
                data={toCountChart(metrics?.proposals.byStatus)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard
                title="Status dos Projetos"
                data={toCountChart(metrics?.projects.byStatus)}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Resumo</CardTitle>
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
                description="Propostas cadastradas"
                icon={FileText}
              />
              <StatCard
                title="Clientes Ativos"
                value={commercial?.clients.active || 0}
                description={`de ${commercial?.clients.total || 0} clientes`}
                icon={Building2}
              />
              <StatCard
                title="Valor Aprovado"
                value={formatCurrency(commercial?.financial.approvedProposalsValue || 0)}
                description="Propostas aprovadas e convertidas"
                icon={DollarSign}
              />
              <StatCard
                title="Propostas por Status"
                value={commercial?.proposals.byStatus.length || 0}
                description="Status distintos"
                icon={FileText}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Valor de Propostas Aprovadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <DollarSign className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-3xl font-bold">
                        {formatCurrency(commercial?.financial.approvedProposalsValue || 0)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Total em propostas aprovadas e convertidas
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ChartCard
                title="Status das Propostas"
                data={toCountChart(commercial?.proposals.byStatus)}
              />
            </div>
          </>
        )}

        {isProjects && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Projetos Ativos"
                value={projects?.projects.active || 0}
                description={`de ${projects?.projects.total || 0} projetos`}
                icon={FolderKanban}
              />
              <StatCard
                title="Total de Projetos"
                value={projects?.projects.total || 0}
                description="Projetos cadastrados"
                icon={FolderKanban}
              />
              <StatCard
                title="Clientes"
                value={projects?.clients.total || 0}
                description="Clientes com projetos"
                icon={Building2}
              />
              <StatCard
                title="Horas no Mês"
                value={`${projects?.hours.monthlyApprovedHours || 0}h`}
                description={`${projects?.hours.pendingCount || 0} pendentes`}
                icon={Clock}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Horas Aprovadas no Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Clock className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-3xl font-bold">
                        {projects?.hours.monthlyApprovedHours || 0}h
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {projects?.hours.pendingCount || 0} lançamentos pendentes
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ChartCard
                title="Status dos Projetos"
                data={toCountChart(projects?.projects.byStatus)}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
