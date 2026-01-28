import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Building2, MapPin, Users, ChevronLeft, ChevronRight } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { clientsApi, Client } from '@/lib/api';

const formatCNPJ = (value: string): string => {
  const numbers = value.replace(/\D/g, '').slice(0, 14);
  return numbers
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const validateCNPJ = (cnpj: string): boolean => {
  const numbers = cnpj.replace(/\D/g, '');
  if (numbers.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(numbers)) return false;

  let sum = 0;
  let weight = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 12; i++) {
    sum += parseInt(numbers[i]) * weight[i];
  }
  let digit1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(numbers[12]) !== digit1) return false;

  sum = 0;
  weight = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (let i = 0; i < 13; i++) {
    sum += parseInt(numbers[i]) * weight[i];
  }
  let digit2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(numbers[13]) !== digit2) return false;

  return true;
};

const ESTADOS_BRASIL = [
  { value: 'AC', label: 'Acre' },
  { value: 'AL', label: 'Alagoas' },
  { value: 'AP', label: 'Amapá' },
  { value: 'AM', label: 'Amazonas' },
  { value: 'BA', label: 'Bahia' },
  { value: 'CE', label: 'Ceará' },
  { value: 'DF', label: 'Distrito Federal' },
  { value: 'ES', label: 'Espírito Santo' },
  { value: 'GO', label: 'Goiás' },
  { value: 'MA', label: 'Maranhão' },
  { value: 'MT', label: 'Mato Grosso' },
  { value: 'MS', label: 'Mato Grosso do Sul' },
  { value: 'MG', label: 'Minas Gerais' },
  { value: 'PA', label: 'Pará' },
  { value: 'PB', label: 'Paraíba' },
  { value: 'PR', label: 'Paraná' },
  { value: 'PE', label: 'Pernambuco' },
  { value: 'PI', label: 'Piauí' },
  { value: 'RJ', label: 'Rio de Janeiro' },
  { value: 'RN', label: 'Rio Grande do Norte' },
  { value: 'RS', label: 'Rio Grande do Sul' },
  { value: 'RO', label: 'Rondônia' },
  { value: 'RR', label: 'Roraima' },
  { value: 'SC', label: 'Santa Catarina' },
  { value: 'SP', label: 'São Paulo' },
  { value: 'SE', label: 'Sergipe' },
  { value: 'TO', label: 'Tocantins' },
];

const emptyFormData = {
  cnpj: '',
  razaoSocial: '',
  nomeFantasia: '',
  pais: 'Brasil',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  nomeComercial: '',
  emailComercial: '',
  telefoneComercial: '',
  nomeMedicao: '',
  emailMedicao: '',
  telefoneMedicao: '',
  nomeTecnico: '',
  emailTecnico: '',
  telefoneTecnico: '',
};

export default function Clients() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

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
    setFormData(emptyFormData);
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setFormData({
      cnpj: client.cnpj || '',
      razaoSocial: client.razaoSocial,
      nomeFantasia: client.nomeFantasia || '',
      pais: client.pais || 'Brasil',
      cep: client.cep || '',
      rua: client.rua || '',
      numero: client.numero || '',
      complemento: client.complemento || '',
      bairro: client.bairro || '',
      cidade: client.cidade || '',
      estado: client.estado || '',
      nomeComercial: client.nomeComercial || '',
      emailComercial: client.emailComercial || '',
      telefoneComercial: client.telefoneComercial || '',
      nomeMedicao: client.nomeMedicao || '',
      emailMedicao: client.emailMedicao || '',
      telefoneMedicao: client.telefoneMedicao || '',
      nomeTecnico: client.nomeTecnico || '',
      emailTecnico: client.emailTecnico || '',
      telefoneTecnico: client.telefoneTecnico || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.razaoSocial.trim()) {
      toast({ title: 'Razão Social é obrigatória', variant: 'destructive' });
      return;
    }
    if (formData.cnpj && formData.cnpj.replace(/\D/g, '').length > 0) {
      if (formData.cnpj.replace(/\D/g, '').length !== 14) {
        toast({ title: 'CNPJ deve ter 14 dígitos', variant: 'destructive' });
        return;
      }
      if (!validateCNPJ(formData.cnpj)) {
        toast({ title: 'CNPJ inválido', description: 'Verifique os dígitos do CNPJ informado', variant: 'destructive' });
        return;
      }
    }
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const filteredClients = clients.filter(
    (client) =>
      client.razaoSocial.toLowerCase().includes(search.toLowerCase()) ||
      client.nomeFantasia?.toLowerCase().includes(search.toLowerCase()) ||
      client.cnpj?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
            <h1 className="text-2xl font-semibold">Clientes</h1>
            <p className="text-muted-foreground">
              Mostrando {startIndex + 1} a {Math.min(endIndex, filteredClients.length)} de {filteredClients.length} registros
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-client">
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <Tabs defaultValue="dados" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="dados" className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Dados
                    </TabsTrigger>
                    <TabsTrigger value="endereco" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Endereço
                    </TabsTrigger>
                    <TabsTrigger value="contatos" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Contatos
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dados" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cnpj">CNPJ</Label>
                        <Input
                          id="cnpj"
                          data-testid="input-client-cnpj"
                          value={formData.cnpj}
                          onChange={(e) => updateField('cnpj', formatCNPJ(e.target.value))}
                          placeholder="00.000.000/0000-00"
                          maxLength={18}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="razaoSocial">Razão Social *</Label>
                        <Input
                          id="razaoSocial"
                          data-testid="input-client-razao-social"
                          value={formData.razaoSocial}
                          onChange={(e) => updateField('razaoSocial', e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
                        <Input
                          id="nomeFantasia"
                          data-testid="input-client-nome-fantasia"
                          value={formData.nomeFantasia}
                          onChange={(e) => updateField('nomeFantasia', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="pais">País</Label>
                        <Input
                          id="pais"
                          data-testid="input-client-pais"
                          value={formData.pais}
                          onChange={(e) => updateField('pais', e.target.value)}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="endereco" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cep">CEP</Label>
                        <Input
                          id="cep"
                          data-testid="input-client-cep"
                          value={formData.cep}
                          onChange={(e) => updateField('cep', e.target.value)}
                          placeholder="00000-000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rua">Rua/Avenida</Label>
                        <Input
                          id="rua"
                          data-testid="input-client-rua"
                          value={formData.rua}
                          onChange={(e) => updateField('rua', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="numero">Número</Label>
                        <Input
                          id="numero"
                          data-testid="input-client-numero"
                          value={formData.numero}
                          onChange={(e) => updateField('numero', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="complemento">Complemento</Label>
                        <Input
                          id="complemento"
                          data-testid="input-client-complemento"
                          value={formData.complemento}
                          onChange={(e) => updateField('complemento', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bairro">Bairro</Label>
                        <Input
                          id="bairro"
                          data-testid="input-client-bairro"
                          value={formData.bairro}
                          onChange={(e) => updateField('bairro', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cidade">Cidade</Label>
                        <Input
                          id="cidade"
                          data-testid="input-client-cidade"
                          value={formData.cidade}
                          onChange={(e) => updateField('cidade', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estado">Estado</Label>
                      <Select
                        value={formData.estado}
                        onValueChange={(value) => updateField('estado', value)}
                      >
                        <SelectTrigger data-testid="select-client-estado">
                          <SelectValue placeholder="Selecione o estado" />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS_BRASIL.map((estado) => (
                            <SelectItem key={estado.value} value={estado.value}>
                              {estado.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  <TabsContent value="contatos" className="space-y-6 mt-4">
                    <div className="space-y-4">
                      <h3 className="font-medium text-sm text-muted-foreground">Contato Comercial</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="nomeComercial">Nome completo (comercial)</Label>
                          <Input
                            id="nomeComercial"
                            data-testid="input-client-nome-comercial"
                            value={formData.nomeComercial}
                            onChange={(e) => updateField('nomeComercial', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emailComercial">E-mail (comercial)</Label>
                          <Input
                            id="emailComercial"
                            type="email"
                            data-testid="input-client-email-comercial"
                            value={formData.emailComercial}
                            onChange={(e) => updateField('emailComercial', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefoneComercial">Nro. contato (comercial)</Label>
                        <Input
                          id="telefoneComercial"
                          data-testid="input-client-telefone-comercial"
                          value={formData.telefoneComercial}
                          onChange={(e) => updateField('telefoneComercial', e.target.value)}
                          placeholder="Cel. ou fixo"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-medium text-sm text-muted-foreground">Contato Medição</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="nomeMedicao">Nome completo (medição)</Label>
                          <Input
                            id="nomeMedicao"
                            data-testid="input-client-nome-medicao"
                            value={formData.nomeMedicao}
                            onChange={(e) => updateField('nomeMedicao', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emailMedicao">E-mail (medição)</Label>
                          <Input
                            id="emailMedicao"
                            type="email"
                            data-testid="input-client-email-medicao"
                            value={formData.emailMedicao}
                            onChange={(e) => updateField('emailMedicao', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefoneMedicao">Nro. contato (medição)</Label>
                        <Input
                          id="telefoneMedicao"
                          data-testid="input-client-telefone-medicao"
                          value={formData.telefoneMedicao}
                          onChange={(e) => updateField('telefoneMedicao', e.target.value)}
                          placeholder="Cel. ou fixo"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-medium text-sm text-muted-foreground">Contato Técnico</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="nomeTecnico">Nome completo (técnico)</Label>
                          <Input
                            id="nomeTecnico"
                            data-testid="input-client-nome-tecnico"
                            value={formData.nomeTecnico}
                            onChange={(e) => updateField('nomeTecnico', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emailTecnico">E-mail (técnico)</Label>
                          <Input
                            id="emailTecnico"
                            type="email"
                            data-testid="input-client-email-tecnico"
                            value={formData.emailTecnico}
                            onChange={(e) => updateField('emailTecnico', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefoneTecnico">Nro. contato (técnico)</Label>
                        <Input
                          id="telefoneTecnico"
                          data-testid="input-client-telefone-tecnico"
                          value={formData.telefoneTecnico}
                          onChange={(e) => updateField('telefoneTecnico', e.target.value)}
                          placeholder="Cel. ou fixo"
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="destructive" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-save-client"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Confirmar'}
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
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
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
            {paginatedClients.map((client) => (
              <Card key={client.id} data-testid={`card-client-${client.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{client.razaoSocial}</CardTitle>
                  {client.nomeFantasia && (
                    <p className="text-sm text-muted-foreground">{client.nomeFantasia}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    {client.cnpj && <p><span className="text-muted-foreground">CNPJ:</span> {client.cnpj}</p>}
                    {client.cidade && client.estado && (
                      <p><span className="text-muted-foreground">Cidade:</span> {client.cidade}/{client.estado}</p>
                    )}
                    {client.emailComercial && (
                      <p><span className="text-muted-foreground">Email:</span> {client.emailComercial}</p>
                    )}
                    {client.telefoneComercial && (
                      <p><span className="text-muted-foreground">Tel:</span> {client.telefoneComercial}</p>
                    )}
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

        {filteredClients.length > 0 && (
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
