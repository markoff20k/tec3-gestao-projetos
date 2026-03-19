import { useState, useEffect } from 'react';
import { Redirect } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lock, User, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const SESSION_EXPIRED_PREFILL_KEY = 'sessionExpiredLoginIdentifier';

export default function Login() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isFormValid = identifier.trim() !== '' && password.trim() !== '';

  useEffect(() => {
    document.documentElement.classList.remove('dark');

    const prefillIdentifier = localStorage.getItem(SESSION_EXPIRED_PREFILL_KEY);
    if (prefillIdentifier) {
      setIdentifier(prefillIdentifier);
      localStorage.removeItem(SESSION_EXPIRED_PREFILL_KEY);
    }
  }, []);

  if (!authLoading && isAuthenticated) {
    return <Redirect to="/" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(identifier, password);
    } catch (error) {
      toast({
        title: 'Erro ao fazer login',
        description: error instanceof Error ? error.message : 'Credenciais inválidas',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Left Panel - Hero Section */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-[linear-gradient(125deg,hsl(209_100%_20%)_0%,hsl(208_95%_29%)_38%,hsl(206_90%_38%)_100%)]">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,.9) 1px, transparent 0)",
            backgroundSize: '22px 22px',
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0)_45%)]" />

        <div className="absolute -top-16 -left-10 h-56 w-56 rounded-full bg-white/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-8 right-6 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl animate-pulse" style={{ animationDelay: '1100ms' }} />
        <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDelay: '1700ms' }} />

        {/* Content */}
        <div className="absolute inset-0 z-10 flex w-full flex-col items-center justify-center px-12 xl:px-20 text-white text-center">
          {/* Logo */}
          <div className="mb-10">
            <div className="inline-block">
              <img 
                src="/assets/tec3-logo.svg" 
                alt="TEC3 Engenharia" 
                className="block h-[clamp(5rem,10vw,9.5rem)] w-auto brightness-0 invert"
                data-testid="img-logo-hero"
              />
            </div>
          </div>

          <p className="text-sm uppercase tracking-[0.2em] text-white/80 mb-3">TEC3 Engenharia</p>
          <h1 className="text-3xl xl:text-[2.15rem] font-semibold mb-3 leading-tight">
            Excelência em soluções sob medida
          </h1>
          
          <p className="text-base xl:text-lg text-white/85 mb-8 max-w-xl">
            Plataforma corporativa para gestão de projetos, propostas e operação técnica com segurança e rastreabilidade.
          </p>

          {/* Features */}
          <div className="space-y-3 max-w-lg">
            <div className="flex items-center justify-center gap-3 text-white/95">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />
              <p className="text-sm">Planejamento e acompanhamento ponta a ponta</p>
            </div>
            <div className="flex items-center justify-center gap-3 text-white/95">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />
              <p className="text-sm">Indicadores estratégicos para tomada de decisão</p>
            </div>
            <div className="flex items-center justify-center gap-3 text-white/95">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-white" />
              <p className="text-sm">Acesso controlado para colaboradores autorizados</p>
            </div>
          </div>
        </div>

        {/* Bottom Gradient Fade */}
        <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-black/25 to-transparent" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-background">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 sm:p-8 shadow-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-7">
            <div className="inline-block">
              <img 
                src="/assets/tec3-logo.svg" 
                alt="TEC3 Engenharia" 
                className="block h-[clamp(3.3rem,11vw,4.8rem)] w-auto brightness-0 invert drop-shadow-[0_0_1px_rgba(17,24,39,0.35)]"
                data-testid="img-logo-mobile"
              />
            </div>
          </div>

          {/* Login Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <img
                src="/assets/tec3-logo.svg"
                alt="TEC3 Engenharia"
                className="h-7 w-auto"
                data-testid="img-logo-login-header"
              />
            </div>
            <h2 className="text-2xl font-semibold text-foreground">Acessar plataforma</h2>
            <p className="text-muted-foreground mt-2 text-sm">Entre com suas credenciais corporativas</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-sm font-medium">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  data-testid="input-email"
                  placeholder="Digite seu usuário"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  className="pl-10 h-12"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  data-testid="input-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isFormValid && !isLoading) {
                      e.preventDefault();
                      handleSubmit(e as unknown as React.FormEvent);
                    }
                  }}
                  className="pl-10 pr-12 h-12"
                  required
                />
                <button
                  type="button"
                  data-testid="button-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              data-testid="button-login"
              className="w-full h-12 text-base font-semibold gap-2"
              disabled={isLoading || !isFormValid}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-7 pt-5 border-t border-border/80">
            <p className="text-center text-sm text-muted-foreground">
              Acesso restrito a colaboradores autorizados
            </p>
          </div>

          {/* Copyright */}
          <div className="mt-5 text-center">
            <p className="text-xs text-muted-foreground/60">
              TEC3 Engenharia - Sistema de Gestão Empresarial
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
