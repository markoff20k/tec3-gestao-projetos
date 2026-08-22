import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, HeartPulse } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { projectsApi, ProjectHealthRule, ProjectHealthRuleInput } from '@/lib/api';
import { ProjectHealthRuleForm } from '@/components/ProjectHealthRuleForm';

function toInput(rule: ProjectHealthRule): ProjectHealthRuleInput {
  return {
    hoursEnabled: rule.hoursEnabled,
    hoursYellow: rule.hoursYellow,
    hoursRed: rule.hoursRed,
    financialEnabled: rule.financialEnabled,
    financialYellow: rule.financialYellow,
    financialRed: rule.financialRed,
    pendingHoursEnabled: rule.pendingHoursEnabled,
    pendingHoursYellow: rule.pendingHoursYellow,
    pendingHoursRed: rule.pendingHoursRed,
    scheduleEnabled: rule.scheduleEnabled,
    scheduleYellowDays: rule.scheduleYellowDays,
    scheduleRedDays: rule.scheduleRedDays,
  };
}

export default function ProjectHealthRules() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ProjectHealthRuleInput | null>(null);

  const { data: rule, isLoading } = useQuery<ProjectHealthRule>({
    queryKey: ['/api/projects/health-rules/global'],
    queryFn: () => projectsApi.getGlobalHealthRule(),
    enabled: hasRole(['admin']),
  });

  useEffect(() => {
    if (rule && !draft) {
      setDraft(toInput(rule));
    }
  }, [rule, draft]);

  const updateMutation = useMutation({
    mutationFn: (data: ProjectHealthRuleInput) => projectsApi.updateGlobalHealthRule(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/projects/health-rules/global'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Regras padrão de saúde atualizadas', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar regras padrão', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-primary" />
            Regra Padrão de Saúde
          </h1>
          <p className="text-muted-foreground">
            Defina a regra padrão do semáforo de saúde usada por todos os projetos. Coordenadores podem personalizar essa regra individualmente em cada projeto.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Regra padrão do sistema</CardTitle>
            <CardDescription>
              Escolha quais métricas participam do cálculo e os limites de alerta (amarelo) e crítico (vermelho) de cada uma. Se qualquer métrica habilitada estiver no vermelho, o projeto fica vermelho.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading || !draft ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando regras...
              </div>
            ) : (
              <>
                <ProjectHealthRuleForm value={draft} onChange={setDraft} />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => draft && updateMutation.mutate(draft)}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-global-health-rule"
                  >
                    {updateMutation.isPending ? 'Salvando...' : 'Salvar regra padrão'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
