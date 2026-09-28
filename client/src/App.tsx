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
  roles,
}: {
  component: () => JSX.Element;
  /** Perfis autorizados. Sem isto, basta estar logado. */
  roles?: string[];
}) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
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
  // pessoa autenticada abria as telas de administração digitando a URL. A API
  // recusaria os dados, mas a tela apareceria vazia, como se não houvesse nada
  // cadastrado — o que é pior do que dizer que o acesso é restrito.
  if (roles && !hasRole(roles)) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Esta tela é exclusiva da administração. Se você precisa dela, peça ao administrador
              para incluir seu usuário no grupo de acesso correspondente.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/clients">
        <ProtectedRoute component={Clients} />
      </Route>
      <Route path="/proposals">
        <ProtectedRoute component={Proposals} />
      </Route>
      <Route path="/projects">
        <ProtectedRoute component={Projects} />
      </Route>
      <Route path="/projects/indicators">
        <ProtectedRoute component={ProjectIndicators} />
      </Route>
      <Route path="/time-entries">
        <ProtectedRoute component={TimeEntries} />
      </Route>
      <Route path="/access-groups">
        <ProtectedRoute component={AccessGroups} roles={['admin']} />
      </Route>
      <Route path="/time-approvals">
        <ProtectedRoute component={TimeApprovals} />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={Users} roles={['admin']} />
      </Route>
      <Route path="/categories">
        <ProtectedRoute component={Categories} roles={['admin']} />
      </Route>
      <Route path="/cost-centers">
        <ProtectedRoute component={CostCenters} roles={['admin']} />
      </Route>
      <Route path="/activities">
        <ProtectedRoute component={Activities} roles={['admin']} />
      </Route>
      <Route path="/project-health-rules">
        <ProtectedRoute component={ProjectHealthRules} roles={['admin']} />
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
