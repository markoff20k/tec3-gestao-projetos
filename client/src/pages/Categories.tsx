import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { proposalCategoriesApi, ProposalCategory } from '@/lib/api';
import { saveCsvFile } from '@/lib/utils';

type CategoryFormState = {
  id?: string;
  name: string;
  isActive: boolean;
};

type SortColumn = 'name' | 'isActive';
type SortDirection = 'asc' | 'desc';

function CategoriesTableSkeleton({ showFullColumnsMobile }: { showFullColumnsMobile: boolean }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => (
        <TableRow key={`category-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-52" />
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

export default function Categories() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>({ name: '', isActive: true });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const { data: categories = [], isLoading } = useQuery<ProposalCategory[]>({
    queryKey: ['/api/proposal-categories'],
    enabled: hasRole(['admin']),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; isActive: boolean }) => proposalCategoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-categories'] });
      toast({ title: 'Categoria cadastrada com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao cadastrar categoria', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<ProposalCategory> }) =>
      proposalCategoriesApi.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposal-categories'] });
      toast({ title: 'Categoria atualizada com sucesso', variant: 'success' });
      setDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar categoria', description: error.message, variant: 'destructive' });
    },
  });

  const openCreate = () => {
    setForm({ name: '', isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (cat: ProposalCategory) => {
    setForm({ id: cat.id, name: cat.name, isActive: cat.isActive });
    setDialogOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (activeFilter === 'active' && !c.isActive) return false;
      if (activeFilter === 'inactive' && c.isActive) return false;
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q);
    });
  }, [categories, search, activeFilter]);

  const sortedCategories = useMemo(() => {
    const getSortValue = (category: ProposalCategory, column: SortColumn): string | number => {
      switch (column) {
        case 'name':
          return category.name || '';
        case 'isActive':
          return category.isActive ? 1 : 0;
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

  const totalPages = Math.max(1, Math.ceil(sortedCategories.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCategories = sortedCategories.slice(startIndex, endIndex);

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

  const downloadTemplate = async () => {
    const content = ['categoria;ativo', 'Administrativo;Sim'].join('\n');
    await saveCsvFile('template_categorias.csv', content);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = String(evt.target?.result || '');
        const lines = text.split(/\r?\n/).filter(Boolean);
        const dataLines = lines.length > 0 ? lines.slice(1) : [];

        let created = 0;
        for (const line of dataLines) {
          const [nameRaw, activeRaw] = line.split(';');
          const name = (nameRaw || '').trim();
          if (!name) continue;
          const activeText = (activeRaw || '').trim().toLowerCase();
          const isActive = activeText === 'sim' || activeText === 's' || activeText === '1' || activeText === 'true';
          await proposalCategoriesApi.create({ name, isActive });
          created++;
        }

        queryClient.invalidateQueries({ queryKey: ['/api/proposal-categories'] });
        toast({ title: `${created} categorias importadas`, variant: 'success' });
      } catch (error: any) {
        toast({ title: 'Erro ao importar arquivo', description: error?.message || 'Falha ao importar', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-semibold">Categorias</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Carregando categorias...' : `${sortedCategories.length} categorias encontradas`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={openCreate} data-testid="button-create-category">Cadastrar novo</Button>
          </div>
        </div>

        <Card className="flex-shrink-0 mt-4">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                  placeholder="Buscar por categoria..."
                  data-testid="input-search-category"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Filtro:</Label>
                <Select
                  value={activeFilter}
                  onValueChange={(v) => setActiveFilter(v as 'all' | 'active' | 'inactive')}
                >
                  <SelectTrigger className="w-44" data-testid="select-filter-active">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="active">Ativas</SelectItem>
                    <SelectItem value="inactive">Inativas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 sm:ml-auto">
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                  Template para importação
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => importInputRef.current?.click()}
                >
                  Acesso ao arquivo
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportFile(file);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 min-h-0 overflow-hidden mt-4">
          <div className="sm:hidden px-4 pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowFullColumnsMobile((prev) => !prev)}
            >
              {showFullColumnsMobile ? 'Visão compacta' : 'Ver colunas completas'}
            </Button>
          </div>
          <div className="h-full overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs font-medium">
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('name')}>
                      Categoria
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
                  <CategoriesTableSkeleton showFullColumnsMobile={showFullColumnsMobile} />
                ) : sortedCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showFullColumnsMobile ? 3 : 2} className="text-muted-foreground">
                      Nenhuma categoria encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCategories.map((cat) => (
                    <TableRow key={cat.id} data-testid={`row-category-${cat.id}`}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} text-center`}>
                        <Badge
                          variant={cat.isActive ? 'default' : 'destructive'}
                          className="w-14 justify-center"
                        >
                          {cat.isActive ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(cat)}
                          data-testid={`button-edit-category-${cat.id}`}
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
              Carregando categorias
            </div>
          </div>
        )}

        {sortedCategories.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-20" data-testid="select-categories-items-per-page">
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
                data-testid="button-categories-prev-page"
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
                      data-testid={`button-categories-page-${pageNum}`}
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
                data-testid="button-categories-next-page"
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
              <DialogTitle>{form.id ? 'Editar categoria' : 'Cadastrar categoria'}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  data-testid="input-category-name"
                />
              </div>

              <div className="space-y-2">
                <Label>Ativo?</Label>
                <Select
                  value={form.isActive ? 'Sim' : 'Não'}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, isActive: v === 'Sim' }))}
                >
                  <SelectTrigger data-testid="select-category-active">
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
                    const name = form.name.trim();
                    if (!name) {
                      toast({ title: 'Categoria é obrigatória', variant: 'destructive' });
                      return;
                    }

                    if (form.id) {
                      updateMutation.mutate({
                        id: form.id,
                        updates: { name, isActive: form.isActive },
                      });
                    } else {
                      createMutation.mutate({ name, isActive: form.isActive });
                    }
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-category"
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
