import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, BellRing, CheckCheck, ChevronRight, Loader2 } from 'lucide-react';
import { authApi, projectsApi, type UserNotification, type UserNotificationsResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function formatNotificationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDistanceToNowStrict(date, { addSuffix: true, locale: ptBR })} · ${format(date, 'dd/MM/yyyy', { locale: ptBR })}`;
}

function getDueBadgeLabel(notification: UserNotification): { label: string; className: string } | null {
  const daysUntilDue = Number(notification.metadata?.daysUntilDue);
  if (!Number.isFinite(daysUntilDue)) return null;

  if (daysUntilDue < 0) {
    return {
      label: `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'dia em atraso' : 'dias em atraso'}`,
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (daysUntilDue === 0) {
    return {
      label: 'Vence hoje',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: `${daysUntilDue} ${daysUntilDue === 1 ? 'dia restante' : 'dias restantes'}`,
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  };
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const notificationsQuery = useQuery<UserNotificationsResponse>({
    queryKey: ['/api/auth/notifications'],
    queryFn: () => authApi.getNotifications({ limit: 12 }),
    staleTime: 15000,
    refetchInterval: 60000,
  });

  const markOneMutation = useMutation({
    mutationFn: (notificationId: string) => authApi.markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => authApi.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/notifications'] });
    },
  });

  const resendTapEmailMutation = useMutation({
    mutationFn: (projectId: string) => projectsApi.resendTapEmail(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'E-mail reenviado', description: 'O TAP foi reenviado com sucesso pelo Postmark.' });
    },
    onError: (error: any) => {
      const message = error?.message || 'Não foi possível reenviar o e-mail do TAP.';
      toast({ title: 'Falha ao reenviar', description: message, variant: 'destructive' });
    },
  });

  const notifications = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);

  const groupedNotifications = useMemo(() => {
    const unread = notifications.filter((item) => !item.isRead);
    const read = notifications.filter((item) => item.isRead);
    return { unread, read };
  }, [notifications]);

  const totalLoaded = notifications.length;

  const openNotification = async (notification: UserNotification) => {
    if (!notification.isRead) {
      await markOneMutation.mutateAsync(notification.id);
    }

    setOpen(false);
    if (notification.link) {
      setLocation(notification.link);
    }
  };

  const isTapEmailFailureNotification = (notification: UserNotification) =>
    notification.type === 'project_tap_email_failed' &&
    notification.metadata?.action === 'resend_project_tap_email' &&
    typeof notification.metadata?.projectId === 'string';

  const handleResendTapEmail = async (notification: UserNotification) => {
    const projectId = String(notification.metadata?.projectId || '');
    if (!projectId) return;

    await resendTapEmailMutation.mutateAsync(projectId);
    if (!notification.isRead) {
      await markOneMutation.mutateAsync(notification.id);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        void notificationsQuery.refetch();
      }
    }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-notifications"
              className="relative text-white/70 hover:text-white hover:bg-white/10"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground shadow-lg shadow-primary/30">
                  {badgeText}
                </span>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Notificações</TooltipContent>
      </Tooltip>

      <SheetContent
        side="right"
        className="w-full border-l border-slate-200 bg-slate-50 p-0 sm:max-w-xl"
        actionButton={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
            disabled={unreadCount === 0 || markAllMutation.isPending}
            onClick={() => void markAllMutation.mutateAsync()}
          >
            {markAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Marcar tudo
          </Button>
        }
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 bg-white px-6 pb-5 pt-6">
            <SheetHeader className="space-y-3 pr-24 text-left">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 shadow-sm">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-2xl font-semibold text-slate-900">Central de notificações</SheetTitle>
                <SheetDescription className="mt-1 text-sm leading-6 text-slate-600">
                  {unreadCount > 0
                    ? `${unreadCount} ${unreadCount === 1 ? 'notificação exige atenção agora' : 'notificações exigem atenção agora'}`
                    : 'Nenhuma pendência crítica no momento.'}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Pendentes</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{unreadCount}</div>
                  <div className="mt-1 text-sm text-slate-500">Itens ainda não lidos</div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Carregadas</div>
                  <div className="mt-2 text-3xl font-semibold text-slate-900">{totalLoaded}</div>
                  <div className="mt-1 text-sm text-slate-500">Notificações nesta consulta</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {notificationsQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 px-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando notificações...
            </div>
          ) : notificationsQuery.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900">Não foi possível carregar as notificações</div>
                <div className="mt-1 text-sm text-slate-500">Feche o painel e tente novamente em instantes.</div>
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900">Nenhuma notificação</div>
                <div className="mt-1 text-sm text-slate-500">Quando houver algo importante, aparecerá aqui com destaque.</div>
              </div>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-6 px-6 py-6">
                {groupedNotifications.unread.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Pendentes</div>
                        <div className="text-sm text-slate-500">Ações que merecem atenção imediata.</div>
                      </div>
                      <Badge className="border-0 bg-slate-900 text-white hover:bg-slate-900">{groupedNotifications.unread.length}</Badge>
                    </div>

                    <div className="space-y-3">
                      {groupedNotifications.unread.map((notification) => {
                        const dueBadge = getDueBadgeLabel(notification);
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            className="w-full rounded-2xl border border-sky-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                            onClick={() => void openNotification(notification)}
                          >
                            <div className="flex items-start gap-4">
                              <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full bg-sky-500 shadow-[0_0_0_6px_rgba(14,165,233,0.12)]" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-base font-semibold leading-6 text-slate-900">{notification.title}</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{notification.message}</p>
                                  </div>
                                  <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                  {isTapEmailFailureNotification(notification) && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 rounded-full"
                                      disabled={resendTapEmailMutation.isPending}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleResendTapEmail(notification);
                                      }}
                                    >
                                      {resendTapEmailMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                      Reenviar e-mail
                                    </Button>
                                  )}
                                  {dueBadge && (
                                    <Badge variant="outline" className={dueBadge.className}>
                                      {dueBadge.label}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                    {formatNotificationTimestamp(notification.createdAt)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {groupedNotifications.read.length > 0 && (
                  <section className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Lidas recentemente</div>
                      <div className="text-sm text-slate-500">Histórico rápido para consulta.</div>
                    </div>

                    <div className="space-y-3">
                      {groupedNotifications.read.map((notification) => {
                        const dueBadge = getDueBadgeLabel(notification);
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-100/70 p-5 text-left transition-all hover:border-slate-300 hover:bg-white"
                            onClick={() => void openNotification(notification)}
                          >
                            <div className="flex items-start gap-4">
                              <div className="mt-1 h-3 w-3 flex-shrink-0 rounded-full bg-slate-300" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-base font-medium leading-6 text-slate-800">{notification.title}</p>
                                    <p className="mt-2 text-sm leading-6 text-slate-500">{notification.message}</p>
                                  </div>
                                  <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                                </div>
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                  {isTapEmailFailureNotification(notification) && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 rounded-full bg-white"
                                      disabled={resendTapEmailMutation.isPending}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleResendTapEmail(notification);
                                      }}
                                    >
                                      {resendTapEmailMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                      Reenviar e-mail
                                    </Button>
                                  )}
                                  {dueBadge && (
                                    <Badge variant="outline" className={dueBadge.className}>
                                      {dueBadge.label}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                                    {formatNotificationTimestamp(notification.createdAt)}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}