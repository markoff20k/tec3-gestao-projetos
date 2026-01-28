import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, ArrowRight, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
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

  const filteredProposals = proposals.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.client?.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
      p.client?.cnpj?.toLowerCase().includes(search.toLowerCase())
  );

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

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-proposals"
            placeholder="Buscar propostas..."
            className="pl-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredProposals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Nenhuma proposta encontrada</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead className="w-[50px]">Rev</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[120px]">Tipo Proposta</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]">Data</TableHead>
                  <TableHead className="w-[100px]">Coordenador</TableHead>
                  <TableHead className="w-[120px] text-right">Valor</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProposals.map((proposal) => (
                  <TableRow key={proposal.id} data-testid={`row-proposal-${proposal.id}`}>
                    <TableCell className="font-medium">{proposal.code}</TableCell>
                    <TableCell>{proposal.revision || 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {typeLabels[proposal.type] || proposal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={proposal.client?.razaoSocial}>
                      {proposal.client?.razaoSocial || '-'}
                    </TableCell>
                    <TableCell className="text-xs">{proposal.client?.cnpj || '-'}</TableCell>
                    <TableCell className="max-w-[250px] truncate" title={proposal.title}>
                      {proposal.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[proposal.type] || proposal.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs text-white ${statusColors[proposal.status]}`}>
                        {statusLabels[proposal.status] || proposal.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(proposal.createdAt)}</TableCell>
                    <TableCell className="text-xs truncate max-w-[100px]" title={proposal.coordinatorName || '-'}>
                      {proposal.coordinatorName || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(proposal.totalValue)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-view-proposal-${proposal.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-edit-proposal-${proposal.id}`}>
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
      </div>
    </Layout>
  );
}
