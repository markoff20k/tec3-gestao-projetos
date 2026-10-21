import { useEffect, useState } from 'react';
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import Proposals from "@/pages/Proposals";
import Projects from "@/pages/Projects";
import ProjectIndicators from "@/pages/ProjectIndicators";
import AccessGroups from '@/pages/AccessGroups';
import TimeEntries from "@/pages/TimeEntries";
import TimeApprovals from "@/pages/TimeApprovals";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import Categories from "@/pages/Categories";
import Activities from "@/pages/Activities";
import CostCenters from "@/pages/CostCenters";
import ProjectHealthRules from "@/pages/ProjectHealthRules";

function ProtectedRoute({
  component: Component,
  permission,
}: {
  component: () => JSX.Element;
  /** Permissao exigida, espelhando o guarda da API. Sem isto, basta estar logado. */
  permission?: string;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const { isLoading: isLoadingPermissions, can } = usePermissions();

  // Espera as permissoes tambem: decidir com a lista ainda vazia mostraria
  // "Acesso restrito" por um instante para quem tem acesso.
  if (isLoading || (permission && isLoadingPermissions)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  // Esconder o item no menu não é proteger a página: sem esta checagem, qualquer
  // pessoa autenticada abria as telas de administração digitando a URL. Quem não
  // pode ver a página é mandado para o apontamento de horas (decisão do cliente,
  // 21/10/2026: nada de tela de acesso restrito). O aviso abaixo fica só para o
  // caso raro de alguém sem nem o nível básico — sem ele, haveria loop de
  // redirecionamento entre / e /time-entries.
  if (permission && !can(permission)) {
    if (permission !== 'time.log' && can('time.log')) {
      return <Redirect to="/time-entries" />;
    }
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Seu grupo de acesso não contempla esta tela. Se você precisa dela, peça ao administrador
              para incluir seu usuário no grupo de acesso correspondente.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return <Component />;
}

function HomeRoute() {
  const { isLoading, can } = usePermissions();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }
  const podeVerDashboard = can('projects.view') || can('proposals.view') || can('reports.view');
  if (!podeVerDashboard) {
    return <Redirect to="/time-entries" />;
  }
  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute component={HomeRoute} />
      </Route>
      <Route path="/clients">
        <ProtectedRoute component={Clients} permission="clients.view" />
      </Route>
      <Route path="/proposals">
        <ProtectedRoute component={Proposals} permission="proposals.view" />
      </Route>
      <Route path="/projects">
        <ProtectedRoute component={Projects} permission="projects.view" />
      </Route>
      <Route path="/projects/indicators">
        <ProtectedRoute component={ProjectIndicators} permission="projects.view" />
      </Route>
      <Route path="/time-entries">
        <ProtectedRoute component={TimeEntries} permission="time.log" />
      </Route>
      <Route path="/access-groups">
        <ProtectedRoute component={AccessGroups} permission="admin.accessGroups" />
      </Route>
      <Route path="/time-approvals">
        <ProtectedRoute component={TimeApprovals} permission="time.approve" />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={Users} permission="admin.users" />
      </Route>
      <Route path="/categories">
        <ProtectedRoute component={Categories} permission="admin.categories" />
      </Route>
      <Route path="/cost-centers">
        <ProtectedRoute component={CostCenters} permission="admin.costCenters" />
      </Route>
      <Route path="/activities">
        <ProtectedRoute component={Activities} permission="admin.activities" />
      </Route>
      <Route path="/project-health-rules">
        <ProtectedRoute component={ProjectHealthRules} permission="admin.healthRules" />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      if (typeof window !== 'undefined' && window.location.pathname === '/login') return;
      setOpen(true);
    };

    window.addEventListener('tec3:session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('tec3:session-expired', handleSessionExpired);
    };
  }, []);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Por segurança, sua sessão expirou.</AlertDialogTitle>
          <AlertDialogDescription>
            Faça login novamente para continuar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              if (typeof window !== 'undefined') {
                window.location.assign('/login');
              }
            }}
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PreferencesProvider>
            <TooltipProvider>
              <Toaster />
              <SessionExpiredDialog />
              <Router />
            </TooltipProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
