import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
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
import { costCentersApi, CostCenter } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type CostCenterFormState = {
  id?: string;
  code: string;
  name: string;
  isActive: boolean;
};

function CostCentersTableSkeleton({ showFullColumnsMobile }: { showFullColumnsMobile: boolean }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => (
        <TableRow key={`cost-center-skeleton-${index}`}>
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

export default function CostCenters() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CostCenterFormState>({ code: '', name: '', isActive: true });

  const { data: costCenters = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
    queryFn: () => costCentersApi.getAll(),
    enabled: hasRole(['admin']),
  });

  const createMutation = useMutation({
    mutationFn: (data: { code: string; name: string; isActive: boolean }) => costCentersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
      toast({ title: 'Centro de custo cadastrado com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao cadastrar centro de custo', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<CostCenter> }) => costCentersApi.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
      toast({ title: 'Centro de custo atualizado com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar centro de custo', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setForm({ code: '', name: '', isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (costCenter: CostCenter) => {
    setForm({ id: costCenter.id, code: costCenter.code, name: costCenter.name, isActive: costCenter.isActive });
    setDialogOpen(true);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return costCenters.filter((costCenter) => {
      if (activeFilter === 'active' && !costCenter.isActive) return false;
      if (activeFilter === 'inactive' && costCenter.isActive) return false;
      if (!query) return true;
      return costCenter.name.toLowerCase().includes(query) || costCenter.code.toLowerCase().includes(query);
    });
  }, [costCenters, search, activeFilter]);

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
            <h1 className="text-2xl font-semibold">Centros de Custo</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Carregando centros de custo...' : `${filtered.length} centros de custo encontrados`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={openCreate} data-testid="button-create-cost-center">Cadastrar novo</Button>
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
                  data-testid="input-search-cost-center"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Filtro:</Label>
                <Select
                  value={activeFilter}
                  onValueChange={(value) => setActiveFilter(value as 'all' | 'active' | 'inactive')}
                >
                  <SelectTrigger className="w-44" data-testid="select-filter-cost-center-active">
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
                  <TableHead className="w-[140px] text-xs font-medium">Sigla</TableHead>
                  <TableHead className="text-xs font-medium">Centro de custo</TableHead>
                  <TableHead className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} w-[140px] text-center text-xs font-medium`}>Ativo?</TableHead>
                  <TableHead className="w-[120px] text-right text-xs font-medium">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <CostCentersTableSkeleton showFullColumnsMobile={showFullColumnsMobile} />
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showFullColumnsMobile ? 4 : 3} className="text-muted-foreground">
                      Nenhum centro de custo encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((costCenter) => (
                    <TableRow key={costCenter.id} data-testid={`row-cost-center-${costCenter.id}`}>
                      <TableCell className="font-medium">{costCenter.code}</TableCell>
                      <TableCell>{costCenter.name}</TableCell>
                      <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} text-center`}>
                        <Badge variant={costCenter.isActive ? 'default' : 'destructive'} className="w-14 justify-center">
                          {costCenter.isActive ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(costCenter)}
                          data-testid={`button-edit-cost-center-${costCenter.id}`}
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
              Carregando centros de custo
            </div>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{form.id ? 'Editar centro de custo' : 'Cadastrar centro de custo'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sigla</Label>
                <Input
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                  data-testid="input-cost-center-code"
                />
              </div>

              <div className="space-y-2">
                <Label>Centro de custo</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  data-testid="input-cost-center-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Ativo?</Label>
                <Select
                  value={form.isActive ? 'Sim' : 'Não'}
                  onValueChange={(value) => setForm((current) => ({ ...current, isActive: value === 'Sim' }))}
                >
                  <SelectTrigger data-testid="select-cost-center-active">
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
                  data-testid="button-save-cost-center"
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