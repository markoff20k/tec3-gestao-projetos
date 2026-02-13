import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Eye, ArrowRight } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  fixed_price: 'Preço fechado',
  appropriation: 'Preço sob demanda',
  umbrella: 'Guarda-chuva',
  service_order: 'Ordem de serviço (consequente do contrato Guarda-chuva)',
  additive: 'Aditivo',
};

export default function Proposals() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    type: 'fixed_price',
    totalValue: '',
    estimatedHours: '',
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

  const filteredProposals = proposals.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Propostas</h1>
            <p className="text-muted-foreground">Gerencie as propostas comerciais</p>
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
                            {client.name}
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
                        <SelectItem value="fixed_price">Preço fechado</SelectItem>
                        <SelectItem value="appropriation">Preço sob demanda</SelectItem>
                        <SelectItem value="umbrella">Guarda-chuva</SelectItem>
                        <SelectItem value="service_order">Ordem de serviço (consequente do contrato Guarda-chuva)</SelectItem>
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredProposals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Nenhuma proposta encontrada</div>
        ) : (
          <div className="space-y-4">
            {filteredProposals.map((proposal) => (
              <Card key={proposal.id} data-testid={`card-proposal-${proposal.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{proposal.title}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {proposal.code}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {proposal.client?.name} | {typeLabels[proposal.type] || proposal.type}
                    </p>
                  </div>
                  <Badge className={`text-xs text-white ${statusColors[proposal.status]}`}>
                    {statusLabels[proposal.status] || proposal.status}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Valor:</span>{' '}
                        <span className="font-medium">{formatCurrency(proposal.totalValue)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Horas:</span>{' '}
                        <span className="font-medium">{proposal.estimatedHours}h</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" data-testid={`button-view-proposal-${proposal.id}`}>
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                      {proposal.status === 'approved' && (
                        <Button
                          size="sm"
                          data-testid={`button-convert-proposal-${proposal.id}`}
                          onClick={() => convertMutation.mutate(proposal.id)}
                          disabled={convertMutation.isPending}
                        >
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Converter em Projeto
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
