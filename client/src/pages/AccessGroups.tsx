import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { AccessGroup, PermissionArea, accessGroupsApi } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Mapa grupo -> conjunto de permissões, que é o rascunho editável da matriz. */
type Draft = Record<string, Set<string>>;

function buildDraft(groups: AccessGroup[]): Draft {
  return Object.fromEntries(groups.map((g) => [g.id, new Set(g.permissions)]));
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  return Array.from(a).every((item) => b.has(item));
}

export default function AccessGroups() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>({});

  const { data: catalog = [], isLoading: isLoadingCatalog } = useQuery<PermissionArea[]>({
    queryKey: ['/api/access-groups/catalog'],
    queryFn: () => accessGroupsApi.getCatalog(),
  });

  const {
    data: groups = [],
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useQuery<AccessGroup[]>({
    queryKey: ['/api/access-groups'],
    queryFn: () => accessGroupsApi.getAll(),
    retry: false,
  });

  useEffect(() => {
    if (groups.length > 0) setDraft(buildDraft(groups));
  }, [groups]);

  const saveMutation = useMutation({
    mutationFn: async (changed: Array<{ id: string; permissions: string[] }>) => {
      for (const item of changed) {
        await accessGroupsApi.update(item.id, { permissions: item.permissions });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/access-groups'] });
      toast({ title: 'Permissões atualizadas', variant: 'success' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar permissões', description: error.message, variant: 'destructive' });
    },
  });

  const changedGroups = useMemo(() => {
    return groups
      .filter((g) => draft[g.id] && !sameSet(draft[g.id], new Set(g.permissions)))
      .map((g) => ({ id: g.id, permissions: Array.from(draft[g.id]).sort() }));
  }, [groups, draft]);

  const toggle = (groupId: string, permission: string) => {
    setDraft((current) => {
      const set = new Set(current[groupId] ?? []);
      if (set.has(permission)) set.delete(permission);
      else set.add(permission);
      return { ...current, [groupId]: set };
    });
  };

  const toggleArea = (groupId: string, area: PermissionArea) => {
    setDraft((current) => {
      const set = new Set(current[groupId] ?? []);
      const todas = area.items.every((i) => set.has(i.key));
      for (const item of area.items) {
        if (todas) set.delete(item.key);
        else set.add(item.key);
      }
      return { ...current, [groupId]: set };
    });
  };

  const isLoading = isLoadingCatalog || isLoadingGroups;
  const semDn = groups.filter((g) => !g.directoryDn);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Grupos de Acesso</h1>
          <p className="text-muted-foreground">
            Define o que cada grupo do Active Directory pode fazer. A permissão de uma pessoa é a
            soma das permissões dos grupos em que ela está, lidos no último login.
          </p>
        </div>

        {semDn.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-300/30 dark:bg-[#3a3018] dark:text-amber-100">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {semDn.length} grupo(s) sem vínculo com o diretório: {semDn.map((g) => g.key).join(', ')}.
              Enquanto não tiverem o DN sincronizado, as permissões deles não chegam a ninguém.
            </span>
          </div>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Matriz de permissões</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clique no nome de uma área para marcar ou desmarcar todas as suas permissões naquele grupo.
                </p>
              </div>

              {changedGroups.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {changedGroups.length} grupo(s) alterado(s)
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDraft(buildDraft(groups))}
                    disabled={saveMutation.isPending}
                  >
                    Descartar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveMutation.mutate(changedGroups)}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-access-groups"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar permissões'
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={`skeleton-${i}`} className="h-9 w-full" />
                ))}
              </div>
            ) : groupsError ? (
              // Falha de acesso e ausência de dados se pareciam na tela: sem esta
              // distinção, quem não tem permissão via "nenhum grupo cadastrado" e
              // era instruído a rodar um script que não resolveria nada.
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900 dark:border-amber-300/30 dark:bg-[#3a3018] dark:text-amber-100">
                <p className="font-medium">Não foi possível carregar os grupos de acesso</p>
                <p className="mt-1 text-xs">{(groupsError as Error).message}</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Nenhum grupo de acesso cadastrado. Rode <code>npx tsx scripts/sync-access-groups.ts --apply</code>{' '}
                para trazer os grupos do Active Directory.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 border-b border-border bg-card p-2 text-left align-bottom">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Permissão
                        </span>
                      </th>
                      {groups.map((group) => (
                        <th
                          key={group.id}
                          className="border-b border-border bg-card p-2 align-bottom"
                          style={{ width: `${70 / groups.length}%` }}
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="mx-auto max-w-[110px] cursor-default">
                                <p className="truncate text-xs font-semibold">{group.name}</p>
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {group.key.replace('GG-APP-GESTAO-', '')}
                                </p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                              <p className="font-medium">{group.key}</p>
                              {group.description ? <p className="mt-1">{group.description}</p> : null}
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {catalog.map((area) => (
                      <Fragment key={area.area}>
                        <tr>
                          <td className="sticky left-0 z-10 bg-muted/40 px-2 py-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {area.area}
                            </span>
                          </td>
                          {groups.map((group) => {
                            const marcadas = area.items.filter((i) => draft[group.id]?.has(i.key)).length;
                            return (
                              <td key={`${area.area}-${group.id}`} className="bg-muted/40 px-2 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleArea(group.id, area)}
                                  className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                                  title={`Marcar ou desmarcar toda a área "${area.area}"`}
                                >
                                  {marcadas}/{area.items.length}
                                </button>
                              </td>
                            );
                          })}
                        </tr>

                        {area.items.map((item) => (
                          <tr key={item.key} className="hover:bg-muted/20">
                            <td className="sticky left-0 z-10 border-b border-border/50 bg-card px-2 py-1.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default">{item.label}</span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[280px] text-xs">
                                  <p>{item.description}</p>
                                  <p className="mt-1 font-mono text-[10px] opacity-70">{item.key}</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>

                            {groups.map((group) => {
                              const marcada = Boolean(draft[group.id]?.has(item.key));
                              const original = group.permissions.includes(item.key);
                              return (
                                <td
                                  key={`${item.key}-${group.id}`}
                                  className={cn(
                                    'border-b border-border/50 px-2 py-1.5 text-center',
                                    marcada !== original && 'bg-primary/10'
                                  )}
                                >
                                  <Checkbox
                                    checked={marcada}
                                    onCheckedChange={() => toggle(group.id, item.key)}
                                    aria-label={`${item.label} em ${group.name}`}
                                    data-testid={`cell-${group.key}-${item.key}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Mudar a matriz vale imediatamente, sem precisar que a pessoa entre de novo. Já trocar alguém
            de grupo no Active Directory só passa a valer no próximo login dela.
          </span>
        </div>
      </div>
    </Layout>
  );
}
