import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Clock } from 'lucide-react';
import { useLocation } from 'wouter';
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
import { projectsApi, Project, TimeEntry } from '@/lib/api';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
};

export default function TimeEntries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showFullCardsMobile, setShowFullCardsMobile] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [formData, setFormData] = useState({
    projectId: '',
    collaboratorId: '',
    entryDate: new Date().toISOString().split('T')[0],
    hours: '',
    description: '',
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  useEffect(() => {
    const queryString = location.includes('?') ? location.split('?')[1] : '';
    if (!queryString) return;

    const params = new URLSearchParams(queryString);
    const projectIdFromQuery = params.get('projectId');
    if (projectIdFromQuery) {
      setSelectedProjectId(projectIdFromQuery);
      setFormData((prev) => ({ ...prev, projectId: projectIdFromQuery }));
    }
  }, [location]);

  const { data: timeEntries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['/api/projects', selectedProjectId, 'time-entries'],
    queryFn: () => projectsApi.getTimeEntries(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  useEffect(() => {
    setShowFullCardsMobile(false);
  }, [selectedProjectId]);

  const createMutation = useMutation({
    mutationFn: (data: Partial<TimeEntry>) => projectsApi.createTimeEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', selectedProjectId, 'time-entries'] });
      toast({ title: 'Horas lançadas com sucesso', variant: 'success' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Erro ao lançar horas', description: error.message, variant: 'destructive' });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setFormData({
      projectId: '',
      collaboratorId: '',
      entryDate: new Date().toISOString().split('T')[0],
      hours: '',
      description: '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      hours: parseFloat(formData.hours) || 0,
    });
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('pt-BR');

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Lançamento de Horas</h1>
            <p className="text-muted-foreground">Registre suas horas trabalhadas</p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-time-entry">
                <Plus className="h-4 w-4 mr-2" />
                Lançar Horas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Lançar Horas</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Projeto *</Label>
                  <Select
                    value={formData.projectId}
                    onValueChange={(value) => setFormData({ ...formData, projectId: value })}
                  >
                    <SelectTrigger data-testid="select-time-entry-project">
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects
                        .filter((p) => p.status === 'in_progress' || p.status === 'active')
                        .map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entryDate">Data *</Label>
                    <Input
                      id="entryDate"
                      type="date"
                      data-testid="input-time-entry-date"
                      value={formData.entryDate}
                      onChange={(e) => setFormData({ ...formData, entryDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hours">Horas *</Label>
                    <Input
                      id="hours"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      data-testid="input-time-entry-hours"
                      value={formData.hours}
                      onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    data-testid="input-time-entry-description"
                    placeholder="Descreva as atividades realizadas..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeDialog} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50">
                    Cancelar
                  </Button>
                  <Button type="submit" data-testid="button-save-time-entry" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-2">
          <Label>Selecione um projeto para ver os lançamentos</Label>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger data-testid="select-filter-project" className="w-full max-w-xs">
              <SelectValue placeholder="Selecione um projeto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedProjectId ? (
          <div className="text-center py-8 text-muted-foreground">
            Selecione um projeto para visualizar os lançamentos
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : timeEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum lançamento encontrado para este projeto
          </div>
        ) : (
          <div className="space-y-4">
            <div className="sm:hidden flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowFullCardsMobile((prev) => !prev)}
              >
                {showFullCardsMobile ? 'Visão compacta' : 'Ver detalhes completos'}
              </Button>
            </div>
            {timeEntries.map((entry) => (
              <Card key={entry.id} data-testid={`card-time-entry-${entry.id}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {formatDate(entry.entryDate)}
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {entry.hours}h
                    </div>
                  </div>
                  <Badge className={`text-xs text-white ${statusColors[entry.status]}`}>
                    {statusLabels[entry.status]}
                  </Badge>
                </CardHeader>
                {entry.description && (
                  <CardContent className={showFullCardsMobile ? 'block' : 'hidden sm:block'}>
                    <p className="text-sm text-muted-foreground">{entry.description}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
