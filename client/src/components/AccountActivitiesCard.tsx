import { useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { authApi, type User, type UserActivity, type UserActivityCategory, type UserSummary } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Image as ImageIcon,
  LogIn,
  Settings2,
  Shield,
  User as UserIcon,
} from 'lucide-react';

function categoryLabel(category: UserActivityCategory): string {
  switch (category) {
    case 'security':
      return 'Segurança';
    case 'profile':
      return 'Perfil';
    case 'preferences':
      return 'Preferências';
    case 'system':
      return 'Sistema';
  }
}

function activityIcon(activity: UserActivity) {
  if (activity.action.startsWith('SECURITY_')) return Shield;
  if (activity.action === 'PROFILE_PHOTO_UPDATED') return ImageIcon;
  if (activity.action === 'PROFILE_UPDATED') return UserIcon;
  if (activity.action === 'PREFERENCES_UPDATED') return Settings2;
  if (activity.action === 'SECURITY_LOGIN_SUCCESS') return LogIn;
  return Activity;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

function groupLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, 'dd/MM/yyyy');
}

function shortUa(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const cleaned = userAgent.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 72) return cleaned;
  return `${cleaned.slice(0, 72)}…`;
}

type FilterTab = 'all' | UserActivityCategory;

export function AccountActivitiesCard({ user }: { user: User | null }) {
  const canAudit = user?.role === 'admin';

  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [tab, setTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<UserActivity[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = selectedUserId ?? user?.id ?? null;
  const category = tab === 'all' ? undefined : tab;

  useEffect(() => {
    if (!canAudit) return;
    authApi
      .listUsers()
      .then((list) => {
        const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
        setUsers(sorted);
      })
      .catch(() => setUsers([]));
  }, [canAudit]);

  useEffect(() => {
    if (!canAudit) {
      setSelectedUserId(null);
      return;
    }
    if (user?.id) setSelectedUserId(user.id);
  }, [canAudit, user?.id]);

  const load = async () => {
    if (!targetUserId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await authApi.getActivities({ userId: targetUserId, category, limit: 12 });
      setItems(res.items);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar atividades');
      setItems([]);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (!targetUserId || !nextCursor) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const res = await authApi.getActivities({
        userId: targetUserId,
        category,
        limit: 12,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar mais');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId, category]);

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: UserActivity[] }> = [];
    const byLabel = new Map<string, UserActivity[]>();

    for (const activity of items) {
      const label = groupLabel(activity.createdAt);
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        groups.push({ label, items: byLabel.get(label)! });
      }
      byLabel.get(label)!.push(activity);
    }

    return groups;
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Atividades da Conta
            </CardTitle>
            <CardDescription>
              Histórico de segurança e alterações de perfil. {canAudit ? 'Modo auditoria habilitado.' : ''}
            </CardDescription>
          </div>

          {canAudit && (
            <div className="w-full sm:w-[320px]">
              <Select value={targetUserId ?? ''} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} — {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Disponível para admin.</p>
            </div>
          )}
        </div>

        <div className="pt-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">Tudo</TabsTrigger>
              <TabsTrigger value="security">Segurança</TabsTrigger>
              <TabsTrigger value="profile">Perfil</TabsTrigger>
              <TabsTrigger value="preferences">Preferências</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-10 rounded-md bg-muted/50" />
            <div className="h-10 rounded-md bg-muted/50" />
            <div className="h-10 rounded-md bg-muted/50" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              Tentar novamente
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border bg-muted/20 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Sem atividades por aqui.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quando você alterar algo na conta, aparecerá um registro aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <Separator className="ml-4 flex-1" />
                </div>

                <div className="space-y-2">
                  {group.items.map((activity) => {
                    const Icon = activityIcon(activity);
                    const ua = shortUa(activity.userAgent);
                    const metaLine = [activity.ip ? `IP ${activity.ip}` : null, ua].filter(Boolean).join(' • ');

                    return (
                      <div
                        key={activity.id}
                        className="group flex items-start gap-3 rounded-md border bg-card px-3 py-3 transition-colors hover:bg-muted/20"
                      >
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">{activity.title}</p>
                              {metaLine ? (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="secondary" className="text-[11px]">
                                {categoryLabel(activity.category)}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">{formatWhen(activity.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex items-center justify-center">
              {nextCursor ? (
                <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Carregando…' : 'Carregar mais'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Fim do histórico.</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
