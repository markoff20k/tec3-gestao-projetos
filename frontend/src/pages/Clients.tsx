import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { clientsApi, Client } from '@/lib/api';

export default function Clients() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    tradeName: '',
    document: '',
    email: '',
    phone: '',
    segment: '',
  });

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    queryFn: () => clientsApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Client>) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({ title: 'Cliente criado com sucesso' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar cliente', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Client> }) =>
      clientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({ title: 'Cliente atualizado com sucesso' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar cliente', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({ title: 'Cliente excluído com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingClient(null);
    setFormData({ name: '', tradeName: '', document: '', email: '', phone: '', segment: '' });
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      tradeName: client.tradeName || '',
      document: client.document || '',
      email: client.email || '',
      phone: client.phone || '',
      segment: client.segment || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Clientes</h1>
            <p className="text-muted-foreground">Gerencie os clientes do sistema</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-client">
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    data-testid="input-client-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tradeName">Nome Fantasia</Label>
                  <Input
                    id="tradeName"
                    data-testid="input-client-tradename"
                    value={formData.tradeName}
                    onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="document">CNPJ/CPF</Label>
                    <Input
                      id="document"
                      data-testid="input-client-document"
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="segment">Segmento</Label>
                    <Input
                      id="segment"
                      data-testid="input-client-segment"
                      value={formData.segment}
                      onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      data-testid="input-client-email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      data-testid="input-client-phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-save-client"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="input-search-clients"
            placeholder="Buscar clientes..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum cliente encontrado
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <Card key={client.id} data-testid={`card-client-${client.id}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <CardTitle className="text-lg">{client.name}</CardTitle>
                    {client.tradeName && (
                      <p className="text-sm text-muted-foreground">{client.tradeName}</p>
                    )}
                  </div>
                  <Badge variant={client.isActive ? 'default' : 'secondary'} className="text-xs">
                    {client.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {client.segment && <p>Segmento: {client.segment}</p>}
                    {client.email && <p>E-mail: {client.email}</p>}
                    {client.phone && <p>Telefone: {client.phone}</p>}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-edit-client-${client.id}`}
                      onClick={() => openEditDialog(client)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid={`button-delete-client-${client.id}`}
                      onClick={() => {
                        if (confirm('Deseja excluir este cliente?')) {
                          deleteMutation.mutate(client.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
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
