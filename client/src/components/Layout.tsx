import { ReactNode, useState } from 'react';
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
  Sun,
  Moon,
  ChevronDown,
  Settings,
  User,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

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

const roleLabels: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  coordinator: 'Coordenador',
  commercial: 'Comercial',
  user: 'Colaborador',
};

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredMenuItems = menuItems.filter(
    (item) => item.roles.length === 0 || hasRole(item.roles)
  );

  const currentPage = menuItems.find(item => item.path === location)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 right-0 left-0 lg:left-64 h-16 bg-card/80 backdrop-blur-md border-b z-30 px-4 lg:px-6">
        <div className="flex items-center justify-between h-full gap-4">
          {/* Left: Mobile menu + Page title */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-mobile-menu"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold text-foreground">{currentPage}</h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-notifications"
              className="relative"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-theme-toggle"
              onClick={toggleTheme}
              className="relative overflow-visible"
            >
              <Sun className={`h-5 w-5 transition-all ${theme === 'dark' ? 'scale-0 rotate-90' : 'scale-100 rotate-0'}`} />
              <Moon className={`absolute h-5 w-5 transition-all ${theme === 'dark' ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'}`} />
              <span className="sr-only">Alternar tema</span>
            </Button>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  data-testid="button-profile-menu"
                  className="flex items-center gap-2 px-2 h-10"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium leading-none">{user?.name}</span>
                    <span className="text-xs text-muted-foreground leading-none mt-0.5">
                      {user?.role ? roleLabels[user.role] : ''}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="menu-profile" className="gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menu-settings" className="gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  data-testid="menu-logout" 
                  className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4" />
                  Sair do Sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
            <img 
              src="https://www.tec3engenharia.com.br/wp-content/uploads/2025/09/tec3-LogoTagline-Cor.svg" 
              alt="TEC3 Engenharia" 
              className="h-8 brightness-0 invert"
              data-testid="img-sidebar-logo"
            />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;

              return (
                <Link key={item.path} href={item.path}>
                  <a
                    data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150
                      ${isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </a>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-sidebar-border">
            <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-sidebar-accent/50">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-sidebar-foreground">{user?.name}</p>
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 mt-0.5">
                  {user?.role ? roleLabels[user.role] : 'Usuário'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 min-h-screen">
        <div className="p-4 lg:p-6">{children}</div>
      </main>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
