import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Project, projectsApi, TimeEntry } from '@/lib/api';
import { cn } from '@/lib/utils';

const statusBadgeClass: Record<string, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
};

function normalizeUserRole(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// entry_date é uma data pura e chega como "2026-08-21T00:00:00.000Z". Interpretar
// o instante UTC no fuso local recuaria um dia no Brasil, mostrando ao coordenador
// uma data diferente da que o colaborador lançou; por isso só a parte da data é lida.
function getEntryDate(entry: TimeEntry) {
  return parseISO(String(entry.entryDate || '').slice(0, 10));
}

type PendingProjectRowProps = {
  project: Project;
  canManageApprovals: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

function TimeApprovalsListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={`time-approvals-project-skeleton-${index}`} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PendingProjectRow({ project, canManageApprovals, isOpen, onOpenChange }: PendingProjectRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectTarget, setRejectTarget] = useState<{ type: 'single'; entryId: string } | { type: 'bulk' } | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const { data: projectEntries = [], isLoading: isLoadingProjectEntries } = useQuery<TimeEntry[]>({
    queryKey: ['/api/projects', project.id, 'time-entries'],
    queryFn: () => projectsApi.getTimeEntries(project.id),
    enabled: isOpen,
  });

  const pendingEntries = useMemo(
    () => projectEntries
      .filter((entry) => entry.status === 'pending')
      .sort((entryA, entryB) => getEntryDate(entryB).getTime() - getEntryDate(entryA).getTime()),
    [projectEntries]
  );

  const pendingHours = useMemo(
    () => pendingEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [pendingEntries]
  );

  const updateEntryStatusMutation = useMutation({
    mutationFn: (data: { entryId: string; status: 'approved' | 'rejected'; rejectionReason?: string | null }) =>
      projectsApi.updateTimeEntryStatus(data.entryId, {
        status: data.status,
        rejectionReason: data.rejectionReason,
      }),
    onSuccess: async (_updatedEntry, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'time-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] }),
      ]);
      toast({
        title: variables.status === 'approved' ? 'Lançamento aprovado com sucesso' : 'Lançamento rejeitado com sucesso',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
    },
  });

  const bulkUpdateEntryStatusMutation = useMutation({
    mutationFn: async (data: { entryIds: string[]; status: 'approved' | 'rejected'; rejectionReason?: string | null }) => {
      await Promise.all(
        data.entryIds.map((entryId) =>
          projectsApi.updateTimeEntryStatus(entryId, {
            status: data.status,
            rejectionReason: data.status === 'rejected' ? (data.rejectionReason ?? null) : undefined,
          })
        )
      );

      return {
        status: data.status,
        count: data.entryIds.length,
      };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/projects', project.id, 'time-entries'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/projects'] }),
      ]);
      toast({
        title:
          result.status === 'approved'
            ? `${result.count} lançamento(s) aprovado(s)`
            : `${result.count} lançamento(s) rejeitado(s)`,
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar lançamentos', description: error.message, variant: 'destructive' });
    },
  });

  const handleApproveEntry = (entryId: string) => {
    updateEntryStatusMutation.mutate({ entryId, status: 'approved' });
  };

  const handleRejectEntry = (entryId: string) => {
    setRejectReasonInput('');
    setRejectTarget({ type: 'single', entryId });
  };

  const handleApproveProjectPending = () => {
    if (pendingEntries.length === 0) return;

    bulkUpdateEntryStatusMutation.mutate({
      entryIds: pendingEntries.map((entry) => entry.id),
      status: 'approved',
    });
  };

  const handleRejectProjectPending = () => {
    if (pendingEntries.length === 0) return;

    setRejectReasonInput('');
    setRejectTarget({ type: 'bulk' });
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    const rejectionReason = rejectReasonInput.trim() || null;

    if (rejectTarget.type === 'single') {
      updateEntryStatusMutation.mutate({
        entryId: rejectTarget.entryId,
        status: 'rejected',
        rejectionReason,
      });
    } else {
      bulkUpdateEntryStatusMutation.mutate({
        entryIds: pendingEntries.map((entry) => entry.id),
        status: 'rejected',
        rejectionReason,
      });
    }

    setRejectTarget(null);
  };

  const disableActions = updateEntryStatusMutation.isPending || bulkUpdateEntryStatusMutation.isPending;

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{project.code} · {project.name}</p>
            <p className="truncate text-xs text-muted-foreground">{project.client?.razaoSocial || 'Sem cliente'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {isOpen ? pendingEntries.length : (Number(project.pendingHours || 0) > 0 ? '–' : 0)} pendente(s)
            </Badge>
            <Badge variant="outline" className="text-xs">
              {isOpen ? pendingHours.toFixed(1) : Number(project.pendingHours || 0).toFixed(1)}h pendentes
            </Badge>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm" data-testid={`button-toggle-project-approvals-${project.id}`}>
                <ChevronDown className={cn('mr-2 h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                {isOpen ? 'Recolher' : 'Ver pendências'}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-4 pb-4 pt-3">
            {!canManageApprovals ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Você não tem permissão para aprovar este projeto.
              </div>
            ) : isLoadingProjectEntries ? (
              <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`pending-entry-skeleton-${index}`} className="rounded-lg border border-border bg-background px-3 py-3">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                Não há pendências neste projeto.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApproveProjectPending}
                    disabled={disableActions}
                    data-testid={`button-approve-project-pending-${project.id}`}
                  >
                    Aprovar pendentes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRejectProjectPending}
                    disabled={disableActions}
                    data-testid={`button-reject-project-pending-${project.id}`}
                  >
                    Rejeitar pendentes
                  </Button>
                </div>

                {pendingEntries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-border bg-background px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">
                            {entry.hours}h · {format(getEntryDate(entry), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                          <Badge className={cn('border text-[10px]', statusBadgeClass[entry.status] ?? 'border-border bg-muted text-foreground')}>
                            {entry.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Colaborador: {entry.collaboratorName || entry.collaboratorId}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{entry.description || 'Sem descrição'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disableActions}
                          onClick={() => handleApproveEntry(entry.id)}
                          data-testid={`button-approve-entry-${entry.id}`}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Aprovar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disableActions}
                          onClick={() => handleRejectEntry(entry.id)}
                          data-testid={`button-reject-entry-${entry.id}`}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejectTarget?.type === 'bulk' ? 'Rejeitar lançamentos pendentes' : 'Rejeitar lançamento'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motivo da rejeição (opcional)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReasonInput}
              onChange={(event) => setRejectReasonInput(event.target.value)}
              placeholder="Explique o motivo da rejeição..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)} disabled={disableActions}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmReject} disabled={disableActions}>
              Confirmar rejeição
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

export default function TimeApprovals() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const userRole = normalizeUserRole(user?.role);
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const projectsWithPending = useMemo(() => {
    return projects
      .filter((project) => Number(project.pendingHours || 0) > 0)
      .filter((project) => {
        if (isAdmin) return true;
        return Boolean(project.coordinatorId) && project.coordinatorId === user?.id;
      })
      .sort((projectA, projectB) => {
        const pendingA = Number(projectA.pendingHours || 0);
        const pendingB = Number(projectB.pendingHours || 0);
        if (pendingA !== pendingB) return pendingB - pendingA;
        return projectA.name.localeCompare(projectB.name, 'pt-BR');
      });
  }, [projects, isAdmin, user?.id]);

  const totalPendingProjects = projectsWithPending.length;
  const totalPendingHours = useMemo(
    () => projectsWithPending.reduce((sum, project) => sum + Number(project.pendingHours || 0), 0),
    [projectsWithPending]
  );

  const totalPages = Math.max(1, Math.ceil(totalPendingProjects / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = projectsWithPending.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  useEffect(() => {
    const queryString = location.includes('?') ? location.split('?')[1] : '';
    if (!queryString || projectsWithPending.length === 0) return;

    const params = new URLSearchParams(queryString);
    const projectIdFromQuery = params.get('projectId') || params.get('projectid');
    if (!projectIdFromQuery) return;

    const targetIndex = projectsWithPending.findIndex((project) => project.id === projectIdFromQuery);
    if (targetIndex < 0) return;

    const targetPage = Math.floor(targetIndex / itemsPerPage) + 1;
    setCurrentPage(targetPage);
    setOpenProjects((current) => ({ ...current, [projectIdFromQuery]: true }));
  }, [location, projectsWithPending, itemsPerPage]);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const visiblePageNumbers = useMemo(() => {
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
      if (totalPages <= 5) return index + 1;
      if (safeCurrentPage <= 3) return index + 1;
      if (safeCurrentPage >= totalPages - 2) return totalPages - 4 + index;
      return safeCurrentPage - 2 + index;
    });
  }, [safeCurrentPage, totalPages]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Aprovação de Horas</h1>
          <p className="text-muted-foreground">
            Lista de projetos com pendências para aprovação. Expanda cada projeto para analisar as linhas pendentes.
          </p>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="grid gap-3 p-5 md:grid-cols-3">
            <Card className="border-border/60 bg-muted/20 shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Projetos com pendência</p>
                {isLoadingProjects ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-2 text-2xl font-semibold text-foreground">{totalPendingProjects}</p>}
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-muted/20 shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Horas pendentes</p>
                {isLoadingProjects ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-2 text-2xl font-semibold text-foreground">{totalPendingHours.toFixed(1)}h</p>}
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-muted/20 shadow-none">
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Escopo</p>
                {isLoadingProjects ? (
                  <Skeleton className="mt-2 h-4 w-56" />
                ) : (
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {isAdmin ? 'Todos os projetos com pendência' : 'Apenas projetos em que você coordena'}
                  </p>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="text-base">Projetos com pendências</CardTitle>
              {totalPendingProjects > 0 ? (
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-muted-foreground">Exibir</Label>
                  <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                    <SelectTrigger className="w-20" data-testid="select-projects-items-per-page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6</SelectItem>
                      <SelectItem value="12">12</SelectItem>
                      <SelectItem value="24">24</SelectItem>
                      <SelectItem value="48">48</SelectItem>
                      <SelectItem value="96">96</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">por página</span>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoadingProjects ? (
              <TimeApprovalsListSkeleton />
            ) : totalPendingProjects === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
                Não há projetos com pendências de aprovação no seu escopo.
              </div>
            ) : (
              <>
                {paginatedProjects.map((project) => {
                  const canManageProjectApprovals = isAdmin || (Boolean(project.coordinatorId) && project.coordinatorId === user?.id);
                  const isOpen = Boolean(openProjects[project.id]);

                  return (
                    <PendingProjectRow
                      key={project.id}
                      project={project}
                      canManageApprovals={canManageProjectApprovals}
                      isOpen={isOpen}
                      onOpenChange={(open) =>
                        setOpenProjects((current) => ({
                          ...current,
                          [project.id]: open,
                        }))
                      }
                    />
                  );
                })}

                <div className="flex flex-col items-center justify-between gap-4 border-t pt-4 sm:flex-row">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {Math.min(startIndex + 1, totalPendingProjects)}-{Math.min(endIndex, totalPendingProjects)} de {totalPendingProjects} projeto(s)
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(safeCurrentPage - 1)}
                      disabled={safeCurrentPage === 1}
                      data-testid="button-projects-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>

                    <div className="flex items-center gap-1">
                      {visiblePageNumbers.map((page) => (
                        <Button
                          key={page}
                          variant={safeCurrentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handlePageChange(page)}
                          data-testid={`button-projects-page-${page}`}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(safeCurrentPage + 1)}
                      disabled={safeCurrentPage === totalPages}
                      data-testid="button-projects-next-page"
                    >
                      Próximo
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {isLoadingProjects && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando aprovações
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
