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
                className="block dark:hidden h-[clamp(3.4rem,11vw,4.9rem)] w-auto [filter:brightness(0)_saturate(100%)_invert(29%)_sepia(88%)_saturate(1569%)_hue-rotate(188deg)_brightness(94%)_contrast(88%)]"
                data-testid="img-logo-mobile"
              />
              <img
                src="/assets/tec3-logo.svg"
                alt="TEC3 Engenharia"
                className="hidden dark:block h-[clamp(3.4rem,11vw,4.9rem)] w-auto brightness-0 invert drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                data-testid="img-logo-mobile-dark"
              />
            </div>
          </div>

          {/* Login Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center justify-center w-14 h-14 overflow-hidden rounded-full border border-[#2f76b6] bg-[#0d4f89] mb-4 shadow-sm">
              <img
                src="data:image/png;base64,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"
                alt="Escudo Tec3"
                className="h-10 w-10 object-contain contrast-125 saturate-110 brightness-110 drop-shadow-[0_0_2px_rgba(255,255,255,0.35)]"
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
