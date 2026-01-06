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
import { reportsApi, DashboardMetrics } from '@/lib/api';
import { Layout } from '@/components/Layout';

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
  const { data: metrics, isLoading, error } = useQuery<DashboardMetrics>({
    queryKey: ['/api/reports/dashboard'],
    queryFn: () => reportsApi.getDashboard(),
  });

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

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão geral do sistema de gestão de projetos
          </p>
        </div>

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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status dos Projetos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics?.projects.byStatus.map((item) => (
                  <div
                    key={item.status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize">{item.status.replace('_', ' ')}</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
