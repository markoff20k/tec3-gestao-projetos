import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  Paperclip,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import {
  format,
  isToday,
  parseISO,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUpload } from '@/hooks/use-upload';
import { costCentersApi, CostCenter, projectsApi, Project, TimeEntry, TimeEntryAttachment } from '@/lib/api';
import { cn } from '@/lib/utils';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const PROJECT_COST_CENTER_OPTION = 'project';

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function getEntryDate(entry: TimeEntry) {
  return parseISO(entry.entryDate);
}

function getEntryDateKey(entry: TimeEntry) {
  const parsedDate = getEntryDate(entry);
  if (!Number.isNaN(parsedDate.getTime())) {
    return dateKey(parsedDate);
  }
  return String(entry.entryDate || '').slice(0, 10);
}

function buildDaySummary(entries: TimeEntry[]) {
  const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const approvedHours = entries
    .filter((entry) => entry.status === 'approved')
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;

  return {
    totalHours,
    approvedHours,
    pendingCount,
    entriesCount: entries.length,
  };
}

function normalizeProjectStatus(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function isProjectLaunchable(project: Project) {
  const status = normalizeProjectStatus(project.status);
  return status === 'in_progress' || status === 'active' || status === 'em_andamento';
}

export default function TimeEntries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProjectId, setModalProjectId] = useState<string>('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [hoursValue, setHoursValue] = useState('');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
  const [attachments, setAttachments] = useState<TimeEntryAttachment[]>([]);
  const [removingAttachmentPath, setRemovingAttachmentPath] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
    queryFn: () => projectsApi.getAll(),
  });

  const { data: costCenters = [] } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
    queryFn: () => costCentersApi.getAll(),
  });

  const launchableProjects = useMemo(
    () => projects.filter((project) => {
      if (!isProjectLaunchable(project)) return false;
      return Boolean(project.isCurrentUserAllocated);
    }),
    [projects]
  );

  const availableCostCenters = useMemo(
    () => costCenters.filter((costCenter) => costCenter.isActive),
    [costCenters]
  );

  const modalProject = useMemo(
    () => launchableProjects.find((project) => project.id === modalProjectId),
    [launchableProjects, modalProjectId]
  );

  const { data: timeEntries = [], isLoading: isLoadingEntries } = useQuery<TimeEntry[]>({
    queryKey: ['/api/projects', modalProjectId, 'time-entries'],
    queryFn: () => projectsApi.getTimeEntries(modalProjectId),
    enabled: !!modalProjectId,
  });

  const projectSummaryByWeek = useMemo(() => {
    if (!modalProjectId || !timeEntries.length) {
      return { totalHours: 0, approvedHours: 0, pendingCount: 0 };
    }
    return buildDaySummary(timeEntries);
  }, [modalProjectId, timeEntries]);

  const canLaunchHours = !!modalProject && isProjectLaunchable(modalProject);
  const hasHoursValue = (Number.parseFloat(hoursValue) || 0) > 0;
  const hasDescriptionValue = descriptionValue.trim().length > 0;
  const shouldHighlightHoursField = Boolean(modalProject && canLaunchHours && !hasHoursValue);
  const shouldHighlightDescriptionField = Boolean(modalProject && canLaunchHours && !hasDescriptionValue);
  const pendingRequiredFieldsCount = Number(shouldHighlightHoursField) + Number(shouldHighlightDescriptionField);

  const createMutation = useMutation({
    mutationFn: (data: Partial<TimeEntry>) => projectsApi.createTimeEntry(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/projects', modalProjectId, 'time-entries'] });
      toast({ title: 'Horas lançadas com sucesso', variant: 'success' });
      resetForm();
      setModalOpen(false);
    },
    onError: (error) => {
      toast({ title: 'Erro ao lançar horas', description: error.message, variant: 'destructive' });
    },
  });

  const { uploadFile, deleteUploadedFile, isUploading, progress } = useUpload({
    onError: (error) => {
      toast({ title: 'Erro ao anexar arquivo', description: error.message, variant: 'destructive' });
    },
  });

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const nextAttachments: TimeEntryAttachment[] = [];

    for (const file of Array.from(files)) {
      const uploaded = await uploadFile(file);
      if (!uploaded) continue;

      nextAttachments.push({
        name: uploaded.metadata.name,
        objectPath: uploaded.objectPath,
        contentType: uploaded.metadata.contentType,
        size: uploaded.metadata.size,
      });
    }

    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments]);
      toast({
        title: nextAttachments.length === 1 ? 'Arquivo anexado' : 'Arquivos anexados',
        description: `${nextAttachments.length} arquivo(s) pronto(s) para o lançamento.`,
        variant: 'success',
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (objectPath: string) => {
    setRemovingAttachmentPath(objectPath);

    try {
      await deleteUploadedFile(objectPath);
      setAttachments((current) => current.filter((item) => item.objectPath !== objectPath));
    } catch (error) {
      toast({
        title: 'Erro ao remover anexo',
        description: error instanceof Error ? error.message : 'Não foi possível remover o anexo.',
        variant: 'destructive',
      });
    } finally {
      setRemovingAttachmentPath((current) => (current === objectPath ? null : current));
    }
  };

  const resetForm = () => {
    setHoursValue('');
    setSelectedCostCenterId('');
    setDescriptionValue('');
    setAttachments([]);
    setSelectedDate(new Date());
  };

  const handleOpenModal = (projectId: string) => {
    setModalProjectId(projectId);
    setModalOpen(true);
    resetForm();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!modalProject) {
      toast({ title: 'Projeto não encontrado', variant: 'destructive' });
      return;
    }

    if (!isProjectLaunchable(modalProject)) {
      toast({
        title: 'Projeto não permite lançamento',
        description: 'Somente projetos ativos permitem lançamento de horas.',
        variant: 'destructive',
      });
      return;
    }

    const requestedHours = parseFloat(hoursValue) || 0;
    const key = dateKey(selectedDate);

    if (modalProject.dailyLimitHours && requestedHours > 0) {
      const hoursAlreadyLaunchedInDay = timeEntries
        .filter((entry) => getEntryDateKey(entry) === key)
        .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

      if (hoursAlreadyLaunchedInDay + requestedHours > modalProject.dailyLimitHours) {
        toast({
          title: 'Limite diário excedido',
          description: `Limite diário do projeto: ${modalProject.dailyLimitHours}h. Já lançado no dia: ${hoursAlreadyLaunchedInDay}h.`,
          variant: 'destructive',
        });
        return;
      }
    }

    createMutation.mutate({
      projectId: modalProjectId,
      collaboratorId: '',
      costCenterId: selectedCostCenterId || null,
      entryDate: key,
      hours: requestedHours,
      description: descriptionValue,
      attachments,
    });
  };

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }));
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Lançamento de Horas</h1>
          <p className="text-muted-foreground">Selecione um projeto, expanda para ver detalhes e aponte suas horas.</p>
        </div>

        {isLoadingProjects ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Carregando projetos...
            </CardContent>
          </Card>
        ) : launchableProjects.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Nenhum projeto ativo encontrado para apontamento de horas.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {launchableProjects.map((project) => {
              const isExpanded = expandedProjects[project.id];

              return (
                <Collapsible
                  key={project.id}
                  open={isExpanded}
                  onOpenChange={() => toggleProjectExpand(project.id)}
                >
                  <Card className="border-border/70">
                    <CollapsibleTrigger asChild>
                      <button className="w-full text-left">
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <CardTitle className="text-base">{project.code} · {project.name}</CardTitle>
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {project.client?.razaoSocial || 'Sem cliente'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <Badge variant="outline" className="text-xs">
                                {project.requiresApproval ? 'Requer aprovação' : 'Sem aprovação'}
                              </Badge>
                              <ChevronDown
                                className={cn(
                                  'h-4 w-4 transition-transform',
                                  isExpanded && 'rotate-180'
                                )}
                              />
                            </div>
                          </div>
                        </CardHeader>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="space-y-4 border-t border-border pt-4">
                        {isLoadingEntries && isExpanded ? (
                          <div className="text-center text-sm text-muted-foreground">
                            Carregando informações do projeto...
                          </div>
                        ) : (
                          <>
                            <div className="grid gap-3 md:grid-cols-4">
                              <Card className="border-border/60 bg-muted/20 shadow-none">
                                <CardContent className="p-3">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                    Período
                                  </p>
                                  <p className="mt-1 text-lg font-semibold text-foreground">
                                    {projectSummaryByWeek.totalHours.toFixed(1)}h
                                  </p>
                                </CardContent>
                              </Card>
                              <Card className="border-border/60 bg-muted/20 shadow-none">
                                <CardContent className="p-3">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                    Aprovadas
                                  </p>
                                  <p className="mt-1 text-lg font-semibold text-foreground">
                                    {projectSummaryByWeek.approvedHours.toFixed(1)}h
                                  </p>
                                </CardContent>
                              </Card>
                              <Card className="border-border/60 bg-muted/20 shadow-none">
                                <CardContent className="p-3">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                    Pendentes
                                  </p>
                                  <p className="mt-1 text-lg font-semibold text-foreground">
                                    {projectSummaryByWeek.pendingCount}
                                  </p>
                                </CardContent>
                              </Card>
                              <Card className="border-border/60 bg-muted/20 shadow-none">
                                <CardContent className="p-3">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                                    Status
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                    Ativo para lançamento
                                  </p>
                                </CardContent>
                              </Card>
                            </div>

                            <Button
                              onClick={() => handleOpenModal(project.id)}
                              className="w-full"
                              data-testid={`button-open-modal-${project.id}`}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Apontar horas
                            </Button>
                          </>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {modalProject ? `Apontar horas - ${modalProject.code}` : 'Apontar horas'}
              </DialogTitle>
            </DialogHeader>

            {modalProject ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    Data selecionada
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    {isToday(selectedDate) && <Badge className="ml-2">Hoje</Badge>}
                  </p>
                </div>

                {pendingRequiredFieldsCount > 0 ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                    {pendingRequiredFieldsCount === 2
                      ? 'Preencha os campos obrigatórios: Horas e Descrição.'
                      : shouldHighlightHoursField
                        ? 'Preencha o campo: Horas.'
                        : 'Preencha o campo: Descrição.'}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="modal-hours" className={cn(shouldHighlightHoursField && 'font-semibold text-primary')}>
                      Horas *
                    </Label>
                    <Input
                      id="modal-hours"
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      value={hoursValue}
                      onChange={(event) => setHoursValue(event.target.value)}
                      placeholder="Ex.: 4"
                      className={cn(shouldHighlightHoursField && 'border-primary/40 bg-primary/5')}
                      disabled={createMutation.isPending || isLoadingEntries}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modal-cost-center">Centro de custo</Label>
                    <Select
                      value={selectedCostCenterId || PROJECT_COST_CENTER_OPTION}
                      onValueChange={(value) =>
                        setSelectedCostCenterId(value === PROJECT_COST_CENTER_OPTION ? '' : value)
                      }
                      disabled={createMutation.isPending || isLoadingEntries}
                    >
                      <SelectTrigger id="modal-cost-center">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PROJECT_COST_CENTER_OPTION}>
                          Projeto ({modalProject?.code})
                        </SelectItem>
                        {availableCostCenters.map((costCenter) => (
                          <SelectItem key={costCenter.id} value={costCenter.id}>
                            {costCenter.code} · {costCenter.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="modal-description" className={cn(shouldHighlightDescriptionField && 'font-semibold text-primary')}>
                    Descrição das atividades *
                  </Label>
                  <Textarea
                    id="modal-description"
                    value={descriptionValue}
                    onChange={(event) => setDescriptionValue(event.target.value)}
                    placeholder="Descreva o que foi realizado..."
                    className={cn(shouldHighlightDescriptionField && 'border-primary/40 bg-primary/5')}
                    disabled={createMutation.isPending || isLoadingEntries}
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm">Anexos</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleUploadFiles(event.target.files)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={createMutation.isPending || isLoadingEntries || isUploading}
                    >
                      {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Anexar
                    </Button>
                  </div>

                  {isUploading && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Enviando arquivo</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      {attachments.map((attachment) => (
                        <div key={attachment.objectPath} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                          <div className="min-w-0 flex items-center gap-2">
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{attachment.name}</p>
                              <p className="text-[10px] text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))} KB</p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                            onClick={() => removeAttachment(attachment.objectPath)}
                            disabled={createMutation.isPending || removingAttachmentPath === attachment.objectPath}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModalOpen(false)}
                    disabled={createMutation.isPending}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || !hasHoursValue || !hasDescriptionValue}
                    className="flex-1"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Apontar horas
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-6">
                Projeto não encontrado.
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
