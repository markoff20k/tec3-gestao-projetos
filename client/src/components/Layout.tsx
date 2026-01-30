import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
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
  ChevronLeft,
  ChevronRight,
  Settings,
  Bell,
  Search,
  User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LayoutProps {
  children: ReactNode;
}

const mainMenuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [] },
  { path: '/clients', label: 'Clientes', icon: Building2, roles: ['commercial', 'admin'] },
  { path: '/proposals', label: 'Propostas', icon: FileText, roles: ['commercial', 'admin', 'coordinator'] },
  { path: '/projects', label: 'Projetos', icon: FolderKanban, roles: ['coordinator', 'admin'] },
  { path: '/time-entries', label: 'Lançar Horas', icon: Clock, roles: ['user', 'coordinator', 'admin'] },
  { path: '/reports', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'coordinator'] },
];

const adminMenuItems = [
  { path: '/users', label: 'Usuários', icon: Users, roles: ['owner'] },
];

const roleLabels: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  coordinator: 'Coordenador',
  commercial: 'Comercial',
  user: 'Colaborador',
};

const pageDescriptions: Record<string, string> = {
  '/': 'Visão geral do sistema',
  '/clients': 'Gerenciar clientes',
  '/proposals': 'Gerenciar propostas comerciais',
  '/projects': 'Gerenciar projetos',
  '/time-entries': 'Registrar horas trabalhadas',
  '/reports': 'Visualizar relatórios',
  '/users': 'Gerenciar usuários do sistema',
};

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSettings = () => {
    setLocation('/settings');
  };

  const handleProfile = () => {
    setLocation('/settings');
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const filteredMainItems = mainMenuItems.filter(
    (item) => item.roles.length === 0 || hasRole(item.roles)
  );

  const filteredAdminItems = adminMenuItems.filter(
    (item) => item.roles.length === 0 || hasRole(item.roles)
  );

  const allItems = [...mainMenuItems, ...adminMenuItems];
  const currentPage = allItems.find(item => item.path === location)?.label || 'Dashboard';
  const currentDescription = pageDescriptions[location] || 'Bem-vindo ao sistema';

  const sidebarWidth = sidebarCollapsed ? 'w-20' : 'w-72';
  const mainPadding = sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72';

  const renderMenuItem = (item: typeof mainMenuItems[0]) => {
    const Icon = item.icon;
    const isActive = location === item.path;

    const menuLink = (
      <Link
        key={item.path}
        href={item.path}
        data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
          ${sidebarCollapsed ? 'justify-center' : ''}
          ${isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="text-sm font-medium">{item.label}</span>
        )}
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>{menuLink}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return menuLink;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 ${sidebarWidth} bg-sidebar text-sidebar-foreground transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="p-4">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-lg">T3</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-testid="button-toggle-sidebar"
                      onClick={() => setSidebarCollapsed(false)}
                      className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expandir menu</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <img 
                  src="https://www.tec3engenharia.com.br/wp-content/uploads/2025/09/tec3-LogoTagline-Cor.svg" 
                  alt="TEC3 Engenharia" 
                  className="w-full max-h-12 object-contain brightness-0 invert"
                  data-testid="img-sidebar-logo"
                />
                <button
                  data-testid="button-toggle-sidebar"
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors flex-shrink-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          {/* User Profile Section */}
          <div className="px-4 py-3 border-t border-b border-sidebar-border">
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <Avatar className="h-10 w-10 flex-shrink-0 bg-sidebar-accent">
                {user?.photoUrl && (
                  <AvatarImage src={user.photoUrl} alt={user.name} />
                )}
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-sidebar-foreground/50 truncate">
                    {user?.role ? roleLabels[user.role] : ''}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {filteredMainItems.map(renderMenuItem)}

            {/* Admin Tools Section */}
            {filteredAdminItems.length > 0 && (
              <>
                {!sidebarCollapsed && (
                  <div className="pt-4 pb-2">
                    <p className="px-3 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                      Administração
                    </p>
                  </div>
                )}
                {sidebarCollapsed && <div className="h-4" />}
                {filteredAdminItems.map(renderMenuItem)}
              </>
            )}
          </nav>

          {/* Bottom Section - Settings & Logout */}
          <div className="p-3 border-t border-sidebar-border space-y-1">
            {sidebarCollapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-testid="button-settings"
                      onClick={handleSettings}
                      className="w-full flex items-center justify-center p-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Configurações</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-testid="button-logout"
                      onClick={logout}
                      className="w-full flex items-center justify-center p-2.5 rounded-lg text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent transition-colors"
                    >
                      <LogOut className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Sair</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <>
                <button
                  data-testid="button-settings"
                  onClick={handleSettings}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span className="text-sm font-medium">Configurações</span>
                </button>
                <button
                  data-testid="button-logout"
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-sm font-medium">Sair</span>
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className={`fixed top-0 right-0 left-0 ${sidebarCollapsed ? 'lg:left-20' : 'lg:left-72'} h-16 bg-sidebar border-b border-sidebar-border z-30 px-4 lg:px-6 transition-all duration-300 ease-in-out`}>
        <div className="flex items-center justify-between h-full gap-4">
          {/* Left: Mobile menu + Page title */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-mobile-menu"
              className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-sidebar-foreground">{currentPage}</h1>
              <p className="text-xs text-sidebar-foreground/50 hidden sm:block">{currentDescription}</p>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40" />
              <Input
                type="text"
                placeholder="Buscar..."
                data-testid="input-search"
                className="w-full pl-10 bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:bg-sidebar-accent"
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-theme-toggle"
                  onClick={toggleTheme}
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</TooltipContent>
            </Tooltip>

            {/* Notifications */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-notifications"
                  className="relative text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notificações</TooltipContent>
            </Tooltip>

            {/* Profile Avatar with Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-profile-menu"
                  className="ml-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-sidebar"
                >
                  {user?.photoUrl ? (
                      <Avatar className="h-9 w-9 cursor-pointer">
                        <AvatarImage src={user.photoUrl} alt={user?.name} />
                      </Avatar>
                    ) : (
                      <User className="h-5 w-5 text-sidebar-foreground/70 hover:text-sidebar-foreground" />
                    )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="font-medium">{user?.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-testid="menu-profile" className="gap-2 cursor-pointer" onClick={handleProfile}>
                  <User className="h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menu-settings" className="gap-2 cursor-pointer" onClick={handleSettings}>
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

      {/* Main Content */}
      <main className={`${mainPadding} pt-16 min-h-screen transition-all duration-300 ease-in-out`}>
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
