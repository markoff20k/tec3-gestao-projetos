import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { activitiesApi, Activity } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type ActivityFormState = {
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
};

type SortColumn = 'code' | 'name' | 'isActive';
type SortDirection = 'asc' | 'desc';

function ActivitiesTableSkeleton({ showFullColumnsMobile }: { showFullColumnsMobile: boolean }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => (
        <TableRow key={`activity-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-64" />
          </TableCell>
          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} text-center`}>
            <div className="flex justify-center">
              <Skeleton className="h-6 w-14" />
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end">
              <Skeleton className="h-8 w-16" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function Activities() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ActivityFormState>({ code: '', name: '', isActive: true });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [sortColumn, setSortColumn] = useState<SortColumn>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: ['/api/activities'],
    queryFn: () => activitiesApi.getAll(),
    enabled: hasRole(['admin']),
  });

  const createMutation = useMutation({
    mutationFn: (data: { code: string; name: string; isActive: boolean }) => activitiesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({ title: 'Atividade cadastrada com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao cadastrar atividade', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Activity> }) => activitiesApi.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/activities'] });
      toast({ title: 'Atividade atualizada com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar atividade', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setForm({ code: '', name: '', isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (activity: Activity) => {
    setForm({ id: activity.id, code: activity.code, name: activity.name, isActive: activity.isActive });
    setDialogOpen(true);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter((activity) => {
      if (activeFilter === 'active' && !activity.isActive) return false;
      if (activeFilter === 'inactive' && activity.isActive) return false;
      if (!query) return true;
      return activity.name.toLowerCase().includes(query) || activity.code.toLowerCase().includes(query);
    });
  }, [activities, search, activeFilter]);

  const sortedActivities = useMemo(() => {
    const getSortValue = (activity: Activity, column: SortColumn): string | number => {
      switch (column) {
        case 'code':
          return activity.code || '';
        case 'name':
          return activity.name || '';
        case 'isActive':
          return activity.isActive ? 1 : 0;
        default:
          return '';
      }
    };

    const sorted = [...filtered].sort((a, b) => {
      const aValue = getSortValue(a, sortColumn);
      const bValue = getSortValue(b, sortColumn);

      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue), 'pt-BR', { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filtered, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedActivities.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedActivities = sortedActivities.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  if (!hasRole(['admin'])) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Acesso não autorizado</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-4 flex-shrink-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Atividades</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Carregando atividades...' : `${sortedActivities.length} atividades encontradas`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={openCreate} data-testid="button-create-activity">Cadastrar novo</Button>
          </div>
        </div>

        <Card className="mt-4 flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 items-start sm:flex-row sm:items-center">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-10"
                  placeholder="Buscar por sigla ou nome..."
                  data-testid="input-search-activity"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Filtro:</Label>
                <Select
                  value={activeFilter}
                  onValueChange={(value) => setActiveFilter(value as 'all' | 'active' | 'inactive')}
                >
                  <SelectTrigger className="w-44" data-testid="select-filter-activity-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4 flex-1 min-h-0 overflow-hidden">
          <div className="px-4 pt-4 sm:hidden">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowFullColumnsMobile((current) => !current)}
            >
              {showFullColumnsMobile ? 'Visão compacta' : 'Ver colunas completas'}
            </Button>
          </div>
          <div className="h-full overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[140px] text-xs font-medium">
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('code')}>
                      Sigla
                      {renderSortIcon('code')}
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('name')}>
                      Atividade
                      {renderSortIcon('name')}
                    </Button>
                  </TableHead>
                  <TableHead className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} w-[140px] text-center text-xs font-medium`}>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('isActive')}>
                      Ativo?
                      {renderSortIcon('isActive')}
                    </Button>
                  </TableHead>
                  <TableHead className="w-[120px] text-right text-xs font-medium">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <ActivitiesTableSkeleton showFullColumnsMobile={showFullColumnsMobile} />
                ) : sortedActivities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showFullColumnsMobile ? 4 : 3} className="text-muted-foreground">
                      Nenhum atividade encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedActivities.map((activity) => (
                    <TableRow key={activity.id} data-testid={`row-activity-${activity.id}`}>
                      <TableCell className="font-medium">{activity.code}</TableCell>
                      <TableCell>{activity.name}</TableCell>
                      <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} text-center`}>
                        <Badge variant={activity.isActive ? 'default' : 'destructive'} className="w-14 justify-center">
                          {activity.isActive ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(activity)}
                          data-testid={`button-edit-activity-${activity.id}`}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {isLoading && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando atividades
            </div>
          </div>
        )}

        {sortedActivities.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-20" data-testid="select-activitys-items-per-page">
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

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(safeCurrentPage - 1)}
                disabled={safeCurrentPage === 1}
                data-testid="button-activitys-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage <= 3) {
                    pageNum = i + 1;
                  } else if (safeCurrentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = safeCurrentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={safeCurrentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      data-testid={`button-activitys-page-${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(safeCurrentPage + 1)}
                disabled={safeCurrentPage === totalPages}
                data-testid="button-activitys-next-page"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Editar atividade' : 'Cadastrar atividade'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sigla</Label>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  data-testid="input-activity-code"
                />
              </div>

              <div className="space-y-2">
                <Label>Atividade</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  data-testid="input-activity-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Ativo?</Label>
                <Select
                  value={form.isActive ? 'Sim' : 'Não'}
                  onValueChange={(value) => setForm((current) => ({ ...current, isActive: value === 'Sim' }))}
                >
                  <SelectTrigger data-testid="select-activity-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sim">Sim</SelectItem>
                    <SelectItem value="Não">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const code = form.code.trim();
                    const name = form.name.trim();

                    if (!code || !name) {
                      toast({ title: 'Nome e sigla são obrigatórios', variant: 'destructive' });
                      return;
                    }

                    if (form.id) {
                      updateMutation.mutate({
                        id: form.id,
                        updates: { code, name, isActive: form.isActive },
                      });
                      return;
                    }

                    createMutation.mutate({ code, name, isActive: form.isActive });
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-activity"
                >
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}