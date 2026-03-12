import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, ChevronsUpDown } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { projectsApi, Project, TimeEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
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

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );

  const canLaunchHours =
    !!selectedProject && (selectedProject.status === 'in_progress' || selectedProject.status === 'active');

  const requiresApproval = !!selectedProject?.requiresApproval;

  const projectEntries = useMemo(
    () =>
      timeEntries.filter((entry) =>
        statusFilter === 'all' ? true : entry.status === statusFilter
      ),
    [timeEntries, statusFilter]
  );

  const summary = useMemo(() => {
    const launchedHours = timeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    const approvedHours = timeEntries
      .filter((entry) => entry.status === 'approved')
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
    const pendingCount = timeEntries.filter((entry) => entry.status === 'pending').length;

    return {
      launchedHours,
      approvedHours,
      pendingCount,
      totalEntries: timeEntries.length,
    };
  }, [timeEntries]);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((projectA, projectB) => {
      const isProjectAActive = projectA.status === 'in_progress' || projectA.status === 'active';
      const isProjectBActive = projectB.status === 'in_progress' || projectB.status === 'active';

      if (isProjectAActive !== isProjectBActive) {
        return isProjectAActive ? -1 : 1;
      }

      return projectA.name.localeCompare(projectB.name, 'pt-BR');
    });
  }, [projects]);

  const selectedFormProject = useMemo(
    () => projects.find((project) => project.id === formData.projectId),
    [projects, formData.projectId]
  );

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

    const project = projects.find((p) => p.id === formData.projectId);

    if (project && !(project.status === 'in_progress' || project.status === 'active')) {
      toast({
        title: 'Projeto não permite lançamento',
        description: 'Somente projetos ativos permitem lançamento de horas.',
        variant: 'destructive',
      });
      return;
    }

    const requestedHours = parseFloat(formData.hours) || 0;
    const projectDailyLimit = project?.dailyLimitHours ?? selectedProject?.dailyLimitHours;

    if (projectDailyLimit && requestedHours > 0) {
      const hoursAlreadyLaunchedInDay = timeEntries
        .filter((entry) => entry.entryDate === formData.entryDate)
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

      if (hoursAlreadyLaunchedInDay + requestedHours > projectDailyLimit) {
        toast({
          title: 'Limite diário excedido',
          description: `Limite diário do projeto: ${projectDailyLimit}h. Já lançado no dia: ${hoursAlreadyLaunchedInDay}h.`,
          variant: 'destructive',
        });
        return;
      }
    }

    createMutation.mutate({
      ...formData,
      hours: requestedHours,
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
                  {selectedFormProject && (
                    <p className="text-xs text-muted-foreground">
                      Limite diário: {selectedFormProject.dailyLimitHours ? `${selectedFormProject.dailyLimitHours}h` : 'não definido'} ·
                      {' '}Aprovação do coordenador: {selectedFormProject.requiresApproval ? 'obrigatória' : 'não obrigatória'}
                    </p>
                  )}
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

        <div className="space-y-2 max-w-2xl">
          <Label className="block">Selecione um projeto para ver os lançamentos</Label>
          <Popover open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={projectFilterOpen}
                data-testid="select-filter-project"
                className="w-full justify-between"
              >
                <span className="truncate text-left">
                  {selectedProject
                    ? `${selectedProject.code} · ${selectedProject.name}`
                    : 'Selecione um projeto'}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(92vw,44rem)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por código ou nome..." />
                <CommandList className="max-h-[280px]">
                  <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
                  <CommandGroup>
                    {sortedProjects.map((project) => {
                      const isSelected = selectedProjectId === project.id;

                      return (
                        <CommandItem
                          key={project.id}
                          value={`${project.code} ${project.name}`}
                          onSelect={() => {
                            setSelectedProjectId(project.id);
                            setProjectFilterOpen(false);
                          }}
                          className="items-start data-[selected=true]:bg-primary/20 data-[selected=true]:text-foreground [&_[data-project-name]]:opacity-80 data-[selected=true]:[&_[data-project-name]]:opacity-100"
                        >
                          <Check
                            className={cn(
                              'mr-2 mt-0.5 h-4 w-4 shrink-0',
                              isSelected ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <div className="min-w-0">
                            <p data-project-code className="truncate text-sm font-medium">{project.code}</p>
                            <p data-project-name className="truncate text-xs">{project.name}</p>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {!selectedProjectId ? (
          <div className="text-center py-8 text-muted-foreground">
            Selecione um projeto para visualizar os lançamentos
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : timeEntries.length === 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">HH lançadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.launchedHours.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">HH aprovadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.approvedHours.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.pendingCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Regra do projeto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>Limite diário: {selectedProject?.dailyLimitHours ? `${selectedProject.dailyLimitHours}h` : 'Não definido'}</p>
                  <p>Aprovação coord.: {requiresApproval ? 'Obrigatória' : 'Não obrigatória'}</p>
                  <p>Lançamento: {canLaunchHours ? 'Permitido' : 'Não permitido'}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lançamentos do projeto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum lançamento encontrado para este projeto
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">HH lançadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.launchedHours.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">HH aprovadas</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.approvedHours.toFixed(1)}h</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{summary.pendingCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Regra do projeto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>Limite diário: {selectedProject?.dailyLimitHours ? `${selectedProject.dailyLimitHours}h` : 'Não definido'}</p>
                  <p>Aprovação coord.: {requiresApproval ? 'Obrigatória' : 'Não obrigatória'}</p>
                  <p>Lançamento: {canLaunchHours ? 'Permitido' : 'Não permitido'}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Lançamentos do projeto</CardTitle>
                <div className="w-full sm:w-56">
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                    <SelectTrigger data-testid="select-time-entry-status-filter">
                      <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="approved">Aprovado</SelectItem>
                      <SelectItem value="rejected">Rejeitado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {projectEntries.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum lançamento para o filtro selecionado
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">HH</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Descrição</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectEntries.map((entry) => (
                        <TableRow key={entry.id} data-testid={`row-time-entry-${entry.id}`}>
                          <TableCell>{formatDate(entry.entryDate)}</TableCell>
                          <TableCell className="text-right font-medium">{entry.hours}h</TableCell>
                          <TableCell>
                            <Badge className={`text-xs text-white ${statusColors[entry.status]}`}>
                              {statusLabels[entry.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[36rem] truncate text-muted-foreground">
                            {entry.description || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
