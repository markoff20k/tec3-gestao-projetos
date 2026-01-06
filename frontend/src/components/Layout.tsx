import { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  FolderKanban,
  Clock,
  BarChart3,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface LayoutProps {
  children: ReactNode;
}

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [] },
  { path: '/clients', label: 'Clientes', icon: Building2, roles: ['commercial', 'admin'] },
  { path: '/proposals', label: 'Propostas', icon: FileText, roles: ['commercial', 'admin', 'coordinator'] },
  { path: '/projects', label: 'Projetos', icon: FolderKanban, roles: ['coordinator', 'admin'] },
  { path: '/time-entries', label: 'Lançar Horas', icon: Clock, roles: ['user', 'coordinator', 'admin'] },
  { path: '/reports', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'coordinator'] },
  { path: '/users', label: 'Usuários', icon: Users, roles: ['owner'] },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredMenuItems = menuItems.filter(
    (item) => item.roles.length === 0 || hasRole(item.roles)
  );

  return (
    <div className="min-h-screen bg-background">
      <button
        data-testid="button-mobile-menu"
        className="fixed top-4 left-4 z-50 lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b">
            <h1 className="text-xl font-semibold">Gestão de Projetos</h1>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;

              return (
                <Link key={item.path} href={item.path}>
                  <a
                    data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
                    className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors
                      ${isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover-elevate'
                      }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </a>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t">
            <div className="flex items-center gap-3 mb-4">
              <Avatar>
                <AvatarFallback>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              data-testid="button-logout"
              variant="outline"
              className="w-full"
              onClick={logout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-64 min-h-screen">
        <div className="p-6">{children}</div>
      </main>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
