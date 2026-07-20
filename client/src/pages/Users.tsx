import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { api, proposalCategoriesApi, ProposalCategory, User } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const EMAIL_GROUP_OPTIONS = [
  { value: 'ADM', label: 'ADM' },
  { value: 'Área técnica', label: 'Área técnica' },
  { value: 'Comercial', label: 'Comercial' },
  { value: 'DIR', label: 'DIR' },
  { value: 'Escritório de projetos', label: 'Escritório de projetos' },
  { value: 'SSMA', label: 'SSMA' },
];

type SortColumn = 'name' | 'email' | 'category' | 'emailGroup' | 'receivesEmails';
type SortDirection = 'asc' | 'desc';

function UsersTableSkeleton({ showFullColumnsMobile }: { showFullColumnsMobile: boolean }) {
  return (
    <TableBody>
      {Array.from({ length: 10 }).map((_, index) => (
        <TableRow key={`user-skeleton-${index}`}>
          <TableCell className="w-[280px]">
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-56" />
            </div>
          </TableCell>
          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} w-[520px]`}>
            <Skeleton className="h-9 w-full" />
          </TableCell>
          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden md:table-cell'} w-[360px]`}>
            <Skeleton className="h-9 w-full" />
          </TableCell>
          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden lg:table-cell'} w-[180px]`}>
            <Skeleton className="h-9 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const [search, setSearch] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [showFullColumnsMobile, setShowFullColumnsMobile] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: professionals = [], isLoading } = useQuery<User[]>({
    queryKey: ['/api/auth/users'],
    queryFn: () => api.get<User[]>('/auth/users'),
    enabled: hasRole(['admin']),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: categories = [] } = useQuery<ProposalCategory[]>({
    queryKey: ['/api/proposal-categories'],
    queryFn: () => proposalCategoriesApi.getAll(),
    enabled: hasRole(['admin']),
  });

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [categories]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      map.set(category.id, category.name);
    }
    return map;
  }, [categories]);

  const filteredProfessionals = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return professionals;
    return professionals.filter((u) => {
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      );
    });
  }, [professionals, search]);

  const sortedProfessionals = useMemo(() => {
    const getSortValue = (user: User, column: SortColumn): string | number => {
      switch (column) {
        case 'name':
          return user.name || '';
        case 'email':
          return user.email || '';
        case 'category':
          return categoryNameById.get(user.professionalCategoryId || '') || '';
        case 'emailGroup':
          return user.emailGroup || '';
        case 'receivesEmails':
          return user.receivesEmails ? 1 : 0;
        default:
          return '';
      }
    };

    const sorted = [...filteredProfessionals].sort((a, b) => {
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
  }, [filteredProfessionals, sortColumn, sortDirection, categoryNameById]);

  const totalPages = Math.max(1, Math.ceil(sortedProfessionals.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProfessionals = sortedProfessionals.slice(startIndex, endIndex);

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

  const updateProfessionalMutation = useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: {
        professionalCategoryId?: string | null;
        emailGroup?: string | null;
        receivesEmails?: boolean;
      };
    }) => {
      return api.put<{ id: string }>(`/auth/users/${userId}/professional`, data);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData<User[]>(['/api/auth/users'], (old) => {
        if (!old) return old;
        return old.map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
      });
      toast({ title: 'Profissional atualizado', variant: 'success' });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar profissional',
        description: error?.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setSavingUserId(null);
    },
  });

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
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Profissionais da Tec3
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Carregando profissionais...' : `${sortedProfessionals.length} profissionais encontrados`}
            </p>
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
                  placeholder="Buscar por nome ou e-mail..."
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
            <Table className="table-fixed w-full">
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-[280px] text-xs font-medium">
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('name')}>
                      Profissional
                      {renderSortIcon('name')}
                    </Button>
                  </TableHead>
                  <TableHead className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} w-[520px] text-xs font-medium`}>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('category')}>
                      Categoria
                      {renderSortIcon('category')}
                    </Button>
                  </TableHead>
                  <TableHead className={`${showFullColumnsMobile ? '' : 'hidden md:table-cell'} w-[360px] text-xs font-medium`}>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('emailGroup')}>
                      Grupo de e-mail
                      {renderSortIcon('emailGroup')}
                    </Button>
                  </TableHead>
                  <TableHead className={`${showFullColumnsMobile ? '' : 'hidden lg:table-cell'} w-[180px] text-xs font-medium`}>
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-0 font-medium" onClick={() => handleSort('receivesEmails')}>
                      Recebe e-mails?
                      {renderSortIcon('receivesEmails')}
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <UsersTableSkeleton showFullColumnsMobile={showFullColumnsMobile} />
              ) : (
                <TableBody>
                  {sortedProfessionals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={showFullColumnsMobile ? 4 : 1} className="text-muted-foreground">
                        Nenhum profissional encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedProfessionals.map((user) => {
                      const isSaving = savingUserId === user.id && updateProfessionalMutation.isPending;

                      return (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell className="font-medium w-[280px]">
                            <div className="leading-tight">
                              <div>{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </div>
                          </TableCell>

                          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden sm:table-cell'} w-[520px] min-w-0`}>
                            <Select
                              value={user.professionalCategoryId || ''}
                              disabled={isSaving}
                              onValueChange={(value) => {
                                setSavingUserId(user.id);
                                updateProfessionalMutation.mutate({
                                  userId: user.id,
                                  data: { professionalCategoryId: value || null },
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {sortedCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}{!c.isActive ? ' (inativa)' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden md:table-cell'} w-[360px] min-w-0`}>
                            <Select
                              value={user.emailGroup || ''}
                              disabled={isSaving}
                              onValueChange={(value) => {
                                setSavingUserId(user.id);
                                updateProfessionalMutation.mutate({
                                  userId: user.id,
                                  data: { emailGroup: value || null },
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent className="max-h-72">
                                {EMAIL_GROUP_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell className={`${showFullColumnsMobile ? '' : 'hidden lg:table-cell'} w-[180px] min-w-0`}>
                            <Select
                              value={String(Boolean(user.receivesEmails))}
                              disabled={isSaving}
                              onValueChange={(value) => {
                                setSavingUserId(user.id);
                                updateProfessionalMutation.mutate({
                                  userId: user.id,
                                  data: { receivesEmails: value === 'true' },
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">Sim</SelectItem>
                                <SelectItem value="false">Não</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              )}
            </Table>
          </div>
        </Card>

        {isLoading && (
          <div className="fixed bottom-5 right-5 z-50 rounded-full bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando profissionais
            </div>
          </div>
        )}

        {sortedProfessionals.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-20" data-testid="select-users-items-per-page">
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
                data-testid="button-users-prev-page"
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
                      data-testid={`button-users-page-${pageNum}`}
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
                data-testid="button-users-next-page"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
