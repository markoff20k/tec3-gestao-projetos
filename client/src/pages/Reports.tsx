import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { reportsApi, DashboardMetrics } from '@/lib/api';
import { BarChart3, FileText, FolderKanban, Building2, Loader2 } from 'lucide-react';

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`reports-skeleton-${index}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['/api/reports/dashboard'],
  });

  const proposalStats = metrics?.proposals.byStatus || [];
  const projectStats = metrics?.projects.byStatus || [];

  return (
    <Layout>
      <div className="space-y-6">
        {isLoading ? (
          <ReportsSkeleton />
        ) : (
          <>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Relatórios</h1>
          <p className="text-muted-foreground">Visualize métricas e estatísticas do sistema</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Propostas por Status</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {proposalStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma proposta cadastrada</p>
                ) : (
                  proposalStats.map((item: { status: string; count: number }) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.status.replace('_', ' ')}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projetos por Status</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {projectStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum projeto cadastrado</p>
                ) : (
                  projectStats.map((item: { status: string; count: number }) => (
                    <div key={item.status} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{item.status.replace('_', ' ')}</span>
                      <span className="font-semibold">{item.count}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resumo Financeiro</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Propostas Aprovadas</span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      metrics?.financial.approvedProposalsValue || 0
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Horas no Mês</span>
                  <span className="font-semibold">{metrics?.hours.monthlyTotal || 0}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Aprovações Pendentes</span>
                  <span className="font-semibold">{metrics?.hours.pendingApprovals || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total de Clientes</span>
                  <span className="font-semibold">{metrics?.clients.total || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Clientes Ativos</span>
                  <span className="font-semibold">{metrics?.clients.active || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
          </>
        )}

        {isLoading && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando relatórios
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
