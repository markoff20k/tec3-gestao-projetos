import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePreferences, type ToastPosition } from '@/contexts/PreferencesContext';
import { authApi } from '@/lib/api';
import { AccountActivitiesCard } from '@/components/AccountActivitiesCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Moon,
  Bell,
  Camera,
  Loader2,
  MessageSquare,
} from 'lucide-react';

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    commercial: 'Comercial',
    projects: 'Projetos',
  };

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    toastPosition,
    notificationsEnabled,
    setToastPosition,
    setNotificationsEnabled,
    isLoading: isPrefsLoading,
    isSaving: isPrefsSaving,
  } = usePreferences();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let mounted = true;

    authApi
      .me()
      .then((freshUser) => {
        if (!mounted) return;
        updateUser(freshUser);
      })
      .catch(() => {
        // ignore: session handling is centralized in api client
      });

    return () => {
      mounted = false;
    };
  }, [updateUser]);

  const memberSinceDate = user?.accountSummary?.memberSince
    ? new Date(user.accountSummary.memberSince)
    : null;
  const hasMemberSince = Boolean(memberSinceDate && !Number.isNaN(memberSinceDate.getTime()));
  const memberSinceMonth = memberSinceDate
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(memberSinceDate)
    : '—';
  const memberSinceShort = memberSinceDate
    ? new Intl.DateTimeFormat('pt-BR').format(memberSinceDate)
    : '—';
  const lastLoginDate = user?.accountSummary?.lastLoginAt
    ? new Date(user.accountSummary.lastLoginAt)
    : null;
  const lastLoginDisplay =
    lastLoginDate && !Number.isNaN(lastLoginDate.getTime())
      ? new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(lastLoginDate)
      : '—';
  const hoursThisMonth = user?.accountSummary?.hoursThisMonth ?? 0;
  const approvedHoursThisMonth = user?.accountSummary?.approvedHoursThisMonth ?? 0;
  const accountStatus = user?.accountSummary?.status ?? (user?.isActive ? 'active' : 'inactive');
  const accountStatusLabel = accountStatus === 'active' ? 'Ativo' : 'Inativo';

  const toastPositionLabel: Record<ToastPosition, string> = {
    'top-left': 'Superior esquerdo',
    'top-right': 'Superior direito',
    'bottom-left': 'Inferior esquerdo',
    'bottom-right': 'Inferior direito',
  };

  const handleToastPositionChange = async (next: ToastPosition) => {
    try {
      await setToastPosition(next);
      toast({
        title: 'Preferência atualizada',
        description: `Avisos em: ${toastPositionLabel[next]}.`,
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Erro ao atualizar preferência',
        variant: 'destructive',
      });
    }
  };

  const handleNotificationsChange = async (enabled: boolean) => {
    try {
      await setNotificationsEnabled(enabled);
      toast({
        title: 'Preferência atualizada',
        description: enabled
          ? 'Avisos do sistema ativados.'
          : 'Avisos do sistema desativados.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Erro ao atualizar preferência',
        variant: 'destructive',
      });
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O arquivo deve ter no máximo 2MB.',
        variant: 'destructive',
      });
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Tipo inválido',
        description: 'Use apenas arquivos JPG, PNG, GIF ou WebP.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const updatedUser = await authApi.uploadPhoto(file);
      updateUser(updatedUser);
      toast({
        title: 'Foto atualizada',
        description: 'Sua foto de perfil foi atualizada com sucesso.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Erro ao enviar foto',
        description: error instanceof Error ? error.message : 'Erro ao enviar foto',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          data-testid="input-photo-file"
        />

        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
              Configurações da Conta
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie seu perfil e preferências da conta
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Perfil
            </CardTitle>
            <CardDescription>
              Seus detalhes da conta e foto de perfil
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar 
                  className="h-24 w-24 cursor-pointer" 
                  onClick={handlePhotoClick}
                  data-testid="avatar-profile"
                >
                  {user?.photoUrl && (
                    <AvatarImage src={user.photoUrl} alt={user.name} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    <User className="h-10 w-10" />
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={handlePhotoClick}
                  disabled={isUploading}
                  data-testid="button-change-photo"
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Clique para alterar</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF ou WebP. Máximo 2MB.</p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Nome Completo
                </Label>
                <Input
                  id="name"
                  value={user?.name || ''}
                  disabled
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Função
                </Label>
                <div className="h-10 flex items-center">
                  <Badge variant="secondary" className="text-sm">
                    {user?.role ? roleLabels[user.role] : '—'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Status da Conta
                </Label>
                <div className="h-10 flex items-center">
                  <Badge
                    variant="outline"
                    className="inline-flex items-center gap-2 border-border/80 bg-muted/40 text-foreground"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${accountStatus === 'active' ? 'bg-green-500' : 'bg-amber-500'}`}
                    />
                    {accountStatusLabel}
                  </Badge>
                </div>
              </div>

              {hasMemberSince && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Membro Desde
                  </Label>
                  <div className="h-10 flex items-center">
                    <span className="text-sm text-muted-foreground">{memberSinceMonth}</span>
                  </div>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Resumo da Conta
            </CardTitle>
            <CardDescription>
              Visão geral da atividade da sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${hasMemberSince ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{hoursThisMonth}</p>
                <p className="text-sm text-muted-foreground">Horas Registradas</p>
                <p className="text-xs text-muted-foreground mt-1">Este mês</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{approvedHoursThisMonth}</p>
                <p className="text-sm text-muted-foreground">Horas Aprovadas</p>
                <p className="text-xs text-muted-foreground mt-1">Este mês</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm font-medium text-foreground">{lastLoginDisplay}</p>
                <p className="text-sm text-muted-foreground">Último Login</p>
              </div>
              {hasMemberSince && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium text-foreground">{memberSinceShort}</p>
                  <p className="text-sm text-muted-foreground">Membro Desde</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>
              Personalize sua experiência no aplicativo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Modo Escuro</p>
                  <p className="text-xs text-muted-foreground">Alternar entre temas claro e escuro</p>
                </div>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={toggleTheme}
                data-testid="switch-dark-mode"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Notificações</p>
                  <p className="text-xs text-muted-foreground">Receber notificações do sistema</p>
                </div>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={(checked) => {
                  void handleNotificationsChange(checked);
                }}
                disabled={isPrefsLoading || isPrefsSaving}
                data-testid="switch-notifications"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">Posição dos avisos</p>
                  <p className="text-xs text-muted-foreground">
                    Define onde os avisos rápidos aparecem na tela.
                    {isPrefsSaving ? ' Salvando…' : ' Salvo automaticamente.'}
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-[260px]">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={toastPosition}
                  onValueChange={(v) => {
                    if (!v) return;
                    void handleToastPositionChange(v as ToastPosition);
                  }}
                  className="grid grid-cols-2 gap-2 justify-items-stretch"
                  disabled={isPrefsLoading || isPrefsSaving}
                >
                  <ToggleGroupItem
                    value="top-left"
                    aria-label="Superior esquerdo"
                    data-testid="toast-position-top-left"
                    className="group h-auto w-full flex-col items-start gap-2 px-3 py-2 text-left"
                  >
                    <div className="relative h-10 w-full rounded-md border bg-muted/30 group-data-[state=on]:ring-2 group-data-[state=on]:ring-ring group-data-[state=on]:ring-offset-2 group-data-[state=on]:ring-offset-background">
                      <div className="absolute left-2 top-2 h-2 w-2 rounded-full bg-foreground/80" />
                    </div>
                    <span className="text-xs text-muted-foreground">Superior esquerdo</span>
                  </ToggleGroupItem>

                  <ToggleGroupItem
                    value="top-right"
                    aria-label="Superior direito"
                    data-testid="toast-position-top-right"
                    className="group h-auto w-full flex-col items-start gap-2 px-3 py-2 text-left"
                  >
                    <div className="relative h-10 w-full rounded-md border bg-muted/30 group-data-[state=on]:ring-2 group-data-[state=on]:ring-ring group-data-[state=on]:ring-offset-2 group-data-[state=on]:ring-offset-background">
                      <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-foreground/80" />
                    </div>
                    <span className="text-xs text-muted-foreground">Superior direito</span>
                  </ToggleGroupItem>

                  <ToggleGroupItem
                    value="bottom-left"
                    aria-label="Inferior esquerdo"
                    data-testid="toast-position-bottom-left"
                    className="group h-auto w-full flex-col items-start gap-2 px-3 py-2 text-left"
                  >
                    <div className="relative h-10 w-full rounded-md border bg-muted/30 group-data-[state=on]:ring-2 group-data-[state=on]:ring-ring group-data-[state=on]:ring-offset-2 group-data-[state=on]:ring-offset-background">
                      <div className="absolute bottom-2 left-2 h-2 w-2 rounded-full bg-foreground/80" />
                    </div>
                    <span className="text-xs text-muted-foreground">Inferior esquerdo</span>
                  </ToggleGroupItem>

                  <ToggleGroupItem
                    value="bottom-right"
                    aria-label="Inferior direito"
                    data-testid="toast-position-bottom-right"
                    className="group h-auto w-full flex-col items-start gap-2 px-3 py-2 text-left"
                  >
                    <div className="relative h-10 w-full rounded-md border bg-muted/30 group-data-[state=on]:ring-2 group-data-[state=on]:ring-ring group-data-[state=on]:ring-offset-2 group-data-[state=on]:ring-offset-background">
                      <div className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-foreground/80" />
                    </div>
                    <span className="text-xs text-muted-foreground">Inferior direito</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </CardContent>
        </Card>

        <AccountActivitiesCard user={user} />
      </div>
    </Layout>
  );
}
