import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, ArrowRight, ChevronLeft, ChevronRight, Pencil, Filter, X, Calendar, DollarSign, SlidersHorizontal, ChevronDown, RotateCcw } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { proposalsApi, clientsApi, Proposal, Client } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500',
  in_review: 'bg-yellow-500',
  sent: 'bg-blue-500',
  negotiating: 'bg-purple-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
  cancelled: 'bg-gray-400',
  converted: 'bg-teal-500',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  in_review: 'Em Revisão',
  sent: 'Enviada',
  negotiating: 'Negociação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  converted: 'Convertida',
};

const typeLabels: Record<string, string> = {
  fixed_price: 'Preço Fixo',
  appropriation: 'Apropriação',
  umbrella: 'Guarda-Chuva',
  service_order: 'Ordem de Serviço',
  additive: 'Aditivo',
};

export default function Proposals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    type: 'fixed_price',
    totalValue: '',
    estimatedHours: '',
    coordinatorName: '',
  });
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    type: 'fixed_price',
    status: 'draft',
    totalValue: '',
    estimatedHours: '',
    coordinatorName: '',
  });

  // Filter states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [coordinatorFilter, setCoordinatorFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  const { data: proposals = [], isLoading } = useQuery<Proposal[]>({
    queryKey: ['/api/proposals'],
    queryFn: () => proposalsApi.getAll(),
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Proposal>) => proposalsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Proposta criada com sucesso' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar proposta', description: error.message, variant: 'destructive' });
    },
  });

  const convertMutation = useMutation({
    mutationFn: (proposalId: string) => proposalsApi.convert(proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Proposta convertida em projeto com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao converter proposta', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Proposal> }) => proposalsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proposals'] });
      toast({ title: 'Proposta atualizada com sucesso' });
      setEditDialogOpen(false);
      setSelectedProposal(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar proposta', description: error.message, variant: 'destructive' });
    },
  });

  const handleViewProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setViewDialogOpen(true);
  };

  const handleEditProposal = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setEditFormData({
      title: proposal.title || '',
      description: proposal.description || '',
      clientId: proposal.clientId || '',
      type: proposal.type || 'fixed_price',
      status: proposal.status || 'draft',
      totalValue: String(proposal.totalValue || 0),
      estimatedHours: String(proposal.estimatedHours || 0),
      coordinatorName: proposal.coordinatorName || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;
    updateMutation.mutate({
      id: selectedProposal.id,
      data: {
        ...editFormData,
        totalValue: parseFloat(editFormData.totalValue) || 0,
        estimatedHours: parseInt(editFormData.estimatedHours) || 0,
      },
    });
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      clientId: '',
      type: 'fixed_price',
      totalValue: '',
      estimatedHours: '',
      coordinatorName: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      totalValue: parseFloat(formData.totalValue) || 0,
      estimatedHours: parseInt(formData.estimatedHours) || 0,
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  // Get unique coordinators for filter dropdown
  const uniqueCoordinators = useMemo(() => {
    const coords = new Set<string>();
    proposals.forEach((p) => {
      if (p.coordinatorName) coords.add(p.coordinatorName);
    });
    return Array.from(coords).sort();
  }, [proposals]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilters.length > 0) count++;
    if (typeFilters.length > 0) count++;
    if (dateFrom || dateTo) count++;
    if (valueMin || valueMax) count++;
    if (coordinatorFilter) count++;
    if (clientFilter) count++;
    return count;
  }, [statusFilters, typeFilters, dateFrom, dateTo, valueMin, valueMax, coordinatorFilter, clientFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilters([]);
    setTypeFilters([]);
    setDateFrom('');
    setDateTo('');
    setValueMin('');
    setValueMax('');
    setCoordinatorFilter('');
    setClientFilter('');
    setSearch('');
    setCurrentPage(1);
  };

  // Toggle filter helpers
  const toggleStatusFilter = (status: string) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
    setCurrentPage(1);
  };

  const toggleTypeFilter = (type: string) => {
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setCurrentPage(1);
  };

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      // Text search
      const searchMatch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        p.client?.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
        p.client?.cnpj?.toLowerCase().includes(search.toLowerCase());

      // Status filter
      const statusMatch = statusFilters.length === 0 || statusFilters.includes(p.status);

      // Type filter
      const typeMatch = typeFilters.length === 0 || typeFilters.includes(p.type);

      // Date range filter
      const createdDate = p.createdAt ? new Date(p.createdAt) : null;
      const dateFromMatch = !dateFrom || (createdDate && createdDate >= new Date(dateFrom));
      const dateToMatch = !dateTo || (createdDate && createdDate <= new Date(dateTo + 'T23:59:59'));

      // Value range filter
      const value = p.totalValue || 0;
      const valueMinMatch = !valueMin || value >= parseFloat(valueMin);
      const valueMaxMatch = !valueMax || value <= parseFloat(valueMax);

      // Coordinator filter
      const coordMatch =
        !coordinatorFilter ||
        p.coordinatorName?.toLowerCase().includes(coordinatorFilter.toLowerCase());

      // Client filter
      const clientMatch =
        !clientFilter ||
        p.client?.razaoSocial?.toLowerCase().includes(clientFilter.toLowerCase()) ||
        p.clientId === clientFilter;

      return (
        searchMatch &&
        statusMatch &&
        typeMatch &&
        dateFromMatch &&
        dateToMatch &&
        valueMinMatch &&
        valueMaxMatch &&
        coordMatch &&
        clientMatch
      );
    });
  }, [proposals, search, statusFilters, typeFilters, dateFrom, dateTo, valueMin, valueMax, coordinatorFilter, clientFilter]);

  const totalPages = Math.ceil(filteredProposals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProposals = filteredProposals.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Propostas</h1>
            <p className="text-muted-foreground">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredProposals.length)} de {filteredProposals.length} registros
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-proposal">
                <Plus className="h-4 w-4 mr-2" />
                Nova Proposta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Proposta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    data-testid="input-proposal-title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    data-testid="input-proposal-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select
                      value={formData.clientId}
                      onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                    >
                      <SelectTrigger data-testid="select-proposal-client">
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.razaoSocial}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger data-testid="select-proposal-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed_price">Preço Fixo</SelectItem>
                        <SelectItem value="appropriation">Apropriação</SelectItem>
                        <SelectItem value="umbrella">Guarda-Chuva</SelectItem>
                        <SelectItem value="service_order">Ordem de Serviço</SelectItem>
                        <SelectItem value="additive">Aditivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalValue">Valor Total (R$)</Label>
                    <Input
                      id="totalValue"
                      type="number"
                      step="0.01"
                      data-testid="input-proposal-value"
                      value={formData.totalValue}
                      onChange={(e) => setFormData({ ...formData, totalValue: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedHours">Horas Estimadas</Label>
                    <Input
                      id="estimatedHours"
                      type="number"
                      data-testid="input-proposal-hours"
                      value={formData.estimatedHours}
                      onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coordinatorName">Coordenador</Label>
                  <Input
                    id="coordinatorName"
                    data-testid="input-proposal-coordinator"
                    value={formData.coordinatorName}
                    onChange={(e) => setFormData({ ...formData, coordinatorName: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="button-save-proposal" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filter Bar */}
        <Card className="border-muted">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Search Row */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="input-search-proposals"
                    placeholder="Buscar por código, título, cliente ou CNPJ..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filtersOpen ? 'default' : 'outline'}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    data-testid="button-toggle-filters"
                    className="relative"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filtros
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-primary text-primary-foreground">
                        {activeFilterCount}
                      </Badge>
                    )}
                    <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
                  </Button>
                  {(activeFilterCount > 0 || search) && (
                    <Button
                      variant="ghost"
                      onClick={clearAllFilters}
                      data-testid="button-clear-all-filters"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Limpar
                    </Button>
                  )}
                </div>
              </div>

              {/* Active Filter Chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {statusFilters.map((status) => (
                    <Badge
                      key={status}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => toggleStatusFilter(status)}
                    >
                      <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                      {statusLabels[status]}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {typeFilters.map((type) => (
                    <Badge
                      key={type}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => toggleTypeFilter(type)}
                    >
                      {typeLabels[type]}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                  {(dateFrom || dateTo) && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      <Calendar className="h-3 w-3" />
                      {dateFrom && dateTo
                        ? `${new Date(dateFrom).toLocaleDateString('pt-BR')} - ${new Date(dateTo).toLocaleDateString('pt-BR')}`
                        : dateFrom
                        ? `A partir de ${new Date(dateFrom).toLocaleDateString('pt-BR')}`
                        : `Até ${new Date(dateTo).toLocaleDateString('pt-BR')}`}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {(valueMin || valueMax) && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => {
                        setValueMin('');
                        setValueMax('');
                      }}
                    >
                      <DollarSign className="h-3 w-3" />
                      {valueMin && valueMax
                        ? `${formatCurrency(parseFloat(valueMin))} - ${formatCurrency(parseFloat(valueMax))}`
                        : valueMin
                        ? `Mín: ${formatCurrency(parseFloat(valueMin))}`
                        : `Máx: ${formatCurrency(parseFloat(valueMax))}`}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {coordinatorFilter && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => setCoordinatorFilter('')}
                    >
                      Coord: {coordinatorFilter}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                  {clientFilter && (
                    <Badge
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1 cursor-pointer hover-elevate"
                      onClick={() => setClientFilter('')}
                    >
                      Cliente: {clients.find((c) => c.id === clientFilter)?.razaoSocial || clientFilter}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  )}
                </div>
              )}

              {/* Expandable Filter Panel */}
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleContent className="space-y-4">
                  <Separator className="my-2" />

                  {/* Status Filters */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Status</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={statusFilters.includes(key) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleStatusFilter(key)}
                          data-testid={`filter-status-${key}`}
                          className={`gap-2 ${statusFilters.includes(key) ? '' : 'text-muted-foreground'}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusColors[key]}`} />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Type Filters */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Tipo de Proposta</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(typeLabels).map(([key, label]) => (
                        <Button
                          key={key}
                          variant={typeFilters.includes(key) ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => toggleTypeFilter(key)}
                          data-testid={`filter-type-${key}`}
                          className={typeFilters.includes(key) ? '' : 'text-muted-foreground'}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Date and Value Range */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Date Range */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Data Inicial</Label>
                      </div>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setCurrentPage(1);
                        }}
                        data-testid="filter-date-from"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Data Final</Label>
                      </div>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setCurrentPage(1);
                        }}
                        data-testid="filter-date-to"
                      />
                    </div>

                    {/* Value Range */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Valor Mínimo</Label>
                      </div>
                      <Input
                        type="number"
                        placeholder="R$ 0,00"
                        value={valueMin}
                        onChange={(e) => {
                          setValueMin(e.target.value);
                          setCurrentPage(1);
                        }}
                        data-testid="filter-value-min"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <Label className="font-medium">Valor Máximo</Label>
                      </div>
                      <Input
                        type="number"
                        placeholder="R$ 999.999,00"
                        value={valueMax}
                        onChange={(e) => {
                          setValueMax(e.target.value);
                          setCurrentPage(1);
                        }}
                        data-testid="filter-value-max"
                      />
                    </div>
                  </div>

                  {/* Coordinator and Client */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="font-medium">Coordenador</Label>
                      <Select
                        value={coordinatorFilter}
                        onValueChange={(v) => {
                          setCoordinatorFilter(v === '_all' ? '' : v);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-coordinator">
                          <SelectValue placeholder="Todos os coordenadores" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Todos os coordenadores</SelectItem>
                          {uniqueCoordinators.map((coord) => (
                            <SelectItem key={coord} value={coord}>
                              {coord}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="font-medium">Cliente</Label>
                      <Select
                        value={clientFilter}
                        onValueChange={(v) => {
                          setClientFilter(v === '_all' ? '' : v);
                          setCurrentPage(1);
                        }}
                      >
                        <SelectTrigger data-testid="filter-client">
                          <SelectValue placeholder="Todos os clientes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">Todos os clientes</SelectItem>
                          {clients.slice(0, 100).map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.razaoSocial}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filteredProposals.length === proposals.length
              ? `${proposals.length} propostas`
              : `${filteredProposals.length} de ${proposals.length} propostas`}
          </span>
          {activeFilterCount > 0 && (
            <span className="text-primary">
              {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo{activeFilterCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredProposals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Nenhuma proposta encontrada</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[2400px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[100px] sticky left-0 bg-muted/50 z-10">Cód. Proposta</TableHead>
                  <TableHead className="w-[50px]">Rev</TableHead>
                  <TableHead className="w-[100px]">Tipo Proposta</TableHead>
                  <TableHead className="w-[120px]">Tipo Atividade</TableHead>
                  <TableHead className="w-[100px]">Guarda-chuva</TableHead>
                  <TableHead className="w-[180px]">Cliente</TableHead>
                  <TableHead className="w-[250px]">Título</TableHead>
                  <TableHead className="w-[100px]">Dt. Atualização</TableHead>
                  <TableHead className="w-[120px]">Utilidade</TableHead>
                  <TableHead className="w-[100px]">Dt. Envio</TableHead>
                  <TableHead className="w-[100px]">Usuário/Enviou</TableHead>
                  <TableHead className="w-[100px]">Situação</TableHead>
                  <TableHead className="w-[120px]">Especialista</TableHead>
                  <TableHead className="w-[120px]">Tipo Principal</TableHead>
                  <TableHead className="w-[60px] text-right">Qtn</TableHead>
                  <TableHead className="w-[100px] text-right">Justif. Horas</TableHead>
                  <TableHead className="w-[100px] text-right">Reabilitação</TableHead>
                  <TableHead className="w-[100px] text-right">Subcontratada</TableHead>
                  <TableHead className="w-[100px] text-right">Liv. Pagto</TableHead>
                  <TableHead className="w-[100px] text-right">Despesa</TableHead>
                  <TableHead className="w-[100px] text-right">Aditivo</TableHead>
                  <TableHead className="w-[100px] text-right">Recurso</TableHead>
                  <TableHead className="w-[120px] text-right">Valor Proposta</TableHead>
                  <TableHead className="w-[80px]">OAs</TableHead>
                  <TableHead className="w-[100px] sticky right-0 bg-muted/50 z-10">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProposals.map((proposal) => (
                  <TableRow key={proposal.id} data-testid={`row-proposal-${proposal.id}`}>
                    <TableCell className="font-medium sticky left-0 bg-background z-10">{proposal.code}</TableCell>
                    <TableCell>{proposal.revision || 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {typeLabels[proposal.type] || proposal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{proposal.activityType || '-'}</TableCell>
                    <TableCell className="text-xs">{proposal.umbrellaRef || '-'}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs" title={proposal.client?.razaoSocial}>
                      {proposal.client?.razaoSocial || '-'}
                    </TableCell>
                    <TableCell className="max-w-[250px] truncate text-xs" title={proposal.title}>
                      {proposal.title}
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(proposal.updatedAt)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{proposal.utility || '-'}</TableCell>
                    <TableCell className="text-xs">{formatDate(proposal.sentDate)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[100px]">{proposal.sentByName || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs text-white whitespace-nowrap ${statusColors[proposal.status]}`}>
                        {statusLabels[proposal.status] || proposal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{proposal.specialist || '-'}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{proposal.mainType || '-'}</TableCell>
                    <TableCell className="text-xs text-right">{proposal.quantity || 0}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.hourJustification || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.rehabilitation || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.subcontracted || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.paymentBook || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.expense || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.additiveValue || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{Number(proposal.resource || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium text-xs">
                      {formatCurrency(proposal.totalValue)}
                    </TableCell>
                    <TableCell className="text-xs">{proposal.workOrders || '-'}</TableCell>
                    <TableCell className="sticky right-0 bg-background z-10">
                      <div className="flex gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          data-testid={`button-view-proposal-${proposal.id}`}
                          onClick={() => handleViewProposal(proposal)}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          data-testid={`button-edit-proposal-${proposal.id}`}
                          onClick={() => handleEditProposal(proposal)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {proposal.status === 'approved' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`button-convert-proposal-${proposal.id}`}
                            onClick={() => convertMutation.mutate(proposal.id)}
                            disabled={convertMutation.isPending}
                            title="Converter em Projeto"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredProposals.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Exibir</span>
              <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                <SelectTrigger className="w-20" data-testid="select-items-per-page">
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
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      data-testid={`button-page-${pageNum}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Proposta</DialogTitle>
            </DialogHeader>
            {selectedProposal && (
              <div className="space-y-6">
                {/* Informações Básicas */}
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">Informações Básicas</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Código</Label>
                      <p className="font-medium">{selectedProposal.code}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Revisão</Label>
                      <p className="font-medium">{selectedProposal.revision || 0}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Status</Label>
                      <Badge className={`text-white ${statusColors[selectedProposal.status]}`}>
                        {statusLabels[selectedProposal.status] || selectedProposal.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Título e Descrição */}
                <div>
                  <div className="mb-3">
                    <Label className="text-muted-foreground text-xs">Título</Label>
                    <p className="font-medium">{selectedProposal.title}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Descrição</Label>
                    <p className="text-sm">{selectedProposal.description || '-'}</p>
                  </div>
                </div>

                <Separator />

                {/* Cliente e Tipos */}
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">Cliente e Classificação</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Cliente</Label>
                      <p className="font-medium">{selectedProposal.client?.razaoSocial || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">CNPJ</Label>
                      <p className="font-medium">{selectedProposal.client?.cnpj || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Tipo Proposta</Label>
                      <Badge variant="outline">{typeLabels[selectedProposal.type] || selectedProposal.type}</Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Tipo Atividade</Label>
                      <p className="font-medium">{selectedProposal.activityType || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Guarda-chuva</Label>
                      <p className="font-medium">{selectedProposal.umbrellaRef || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Tipo Principal</Label>
                      <p className="font-medium">{selectedProposal.mainType || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Utilidade</Label>
                      <p className="font-medium">{selectedProposal.utility || '-'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Responsáveis */}
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">Responsáveis</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Coordenador</Label>
                      <p className="font-medium">{selectedProposal.coordinatorName || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Especialista</Label>
                      <p className="font-medium">{selectedProposal.specialist || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Enviado por</Label>
                      <p className="font-medium">{selectedProposal.sentByName || '-'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Datas */}
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">Datas</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Data de Criação</Label>
                      <p className="font-medium">{formatDate(selectedProposal.createdAt)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Última Atualização</Label>
                      <p className="font-medium">{formatDate(selectedProposal.updatedAt)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Data de Envio</Label>
                      <p className="font-medium">{formatDate(selectedProposal.sentDate)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">OAs</Label>
                      <p className="font-medium">{selectedProposal.workOrders || '-'}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Valores Financeiros */}
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">Valores Financeiros</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Valor Proposta</Label>
                      <p className="font-medium text-lg">{formatCurrency(selectedProposal.totalValue)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Horas Estimadas</Label>
                      <p className="font-medium">{selectedProposal.estimatedHours || 0}h</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Quantidade</Label>
                      <p className="font-medium">{selectedProposal.quantity || 0}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Justif. Horas</Label>
                      <p className="font-medium">{Number(selectedProposal.hourJustification || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Reabilitação</Label>
                      <p className="font-medium">{Number(selectedProposal.rehabilitation || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Subcontratada</Label>
                      <p className="font-medium">{Number(selectedProposal.subcontracted || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Liv. Pagto</Label>
                      <p className="font-medium">{Number(selectedProposal.paymentBook || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Despesa</Label>
                      <p className="font-medium">{Number(selectedProposal.expense || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Aditivo</Label>
                      <p className="font-medium">{Number(selectedProposal.additiveValue || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Recurso</Label>
                      <p className="font-medium">{Number(selectedProposal.resource || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Proposta {selectedProposal?.code}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Título *</Label>
                <Input
                  id="edit-title"
                  data-testid="input-edit-proposal-title"
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Descrição</Label>
                <Textarea
                  id="edit-description"
                  data-testid="input-edit-proposal-description"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={editFormData.clientId}
                    onValueChange={(v) => setEditFormData({ ...editFormData, clientId: v })}
                  >
                    <SelectTrigger data-testid="select-edit-client">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.razaoSocial}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={editFormData.type}
                    onValueChange={(v) => setEditFormData({ ...editFormData, type: v })}
                  >
                    <SelectTrigger data-testid="select-edit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_price">Preço Fixo</SelectItem>
                      <SelectItem value="appropriation">Apropriação</SelectItem>
                      <SelectItem value="umbrella">Guarda-Chuva</SelectItem>
                      <SelectItem value="service_order">Ordem de Serviço</SelectItem>
                      <SelectItem value="additive">Aditivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(v) => setEditFormData({ ...editFormData, status: v })}
                  >
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="in_review">Em Revisão</SelectItem>
                      <SelectItem value="sent">Enviada</SelectItem>
                      <SelectItem value="negotiating">Negociação</SelectItem>
                      <SelectItem value="approved">Aprovada</SelectItem>
                      <SelectItem value="rejected">Rejeitada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                      <SelectItem value="converted">Convertida</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-coordinator">Coordenador</Label>
                  <Input
                    id="edit-coordinator"
                    data-testid="input-edit-coordinator"
                    value={editFormData.coordinatorName}
                    onChange={(e) => setEditFormData({ ...editFormData, coordinatorName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-value">Valor Total (R$)</Label>
                  <Input
                    id="edit-value"
                    type="number"
                    step="0.01"
                    data-testid="input-edit-value"
                    value={editFormData.totalValue}
                    onChange={(e) => setEditFormData({ ...editFormData, totalValue: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-hours">Horas Estimadas</Label>
                  <Input
                    id="edit-hours"
                    type="number"
                    data-testid="input-edit-hours"
                    value={editFormData.estimatedHours}
                    onChange={(e) => setEditFormData({ ...editFormData, estimatedHours: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-proposal">
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
