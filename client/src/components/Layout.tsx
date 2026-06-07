import { ReactNode, useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useRoute } from 'wouter';
import {
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
  User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
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
import { NotificationBell } from '@/components/NotificationBell';
import { HeaderShortcutManager } from '@/components/HeaderShortcutManager';
import { clientsApi, projectsApi, proposalsApi, type Client, type Project, type Proposal } from '@/lib/api';
import { adminMenuItems, mainMenuItems, pageDescriptions, settingsNavigationItem, type NavigationItem } from '@/lib/navigation';

interface LayoutProps {
  children: ReactNode;
}

type HeaderSearchResult = {
  id: string;
  type: 'proposal' | 'project' | 'client';
  title: string;
  subtitle: string;
  targetPath: string;
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  commercial: 'Comercial',
  projects: 'Projetos',
};

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const { notificationsEnabled } = usePreferences();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [debouncedHeaderSearch, setDebouncedHeaderSearch] = useState('');
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearchHighlightIndex, setHeaderSearchHighlightIndex] = useState(-1);
  const [headerPlaceholderPhraseIndex, setHeaderPlaceholderPhraseIndex] = useState(0);
  const [headerPlaceholderCharCount, setHeaderPlaceholderCharCount] = useState(0);
  const [headerPlaceholderDeleting, setHeaderPlaceholderDeleting] = useState(false);
  const [headerPlaceholderCaretVisible, setHeaderPlaceholderCaretVisible] = useState(true);
  const headerSearchRef = useRef<HTMLDivElement | null>(null);

  const headerPlaceholderPhrases = useMemo(
    () => [
      'Buscar propostas, projetos ou clientes...',
      'Ex.: P26126, T26067 ou JMN Mineração',
      'Digite para encontrar resultados instantâneos',
    ],
    []
  );

  const headerAnimatedPlaceholder = useMemo(() => {
    const currentPhrase = headerPlaceholderPhrases[headerPlaceholderPhraseIndex] || '';
    return currentPhrase.slice(0, headerPlaceholderCharCount);
  }, [headerPlaceholderPhrases, headerPlaceholderPhraseIndex, headerPlaceholderCharCount]);

  const headerDisplayPlaceholder = useMemo(() => {
    return `${headerAnimatedPlaceholder}${headerPlaceholderCaretVisible ? '|' : ''}`;
  }, [headerAnimatedPlaceholder, headerPlaceholderCaretVisible]);

  const isSearchRoute = location.startsWith('/proposals') || location.startsWith('/projects') || location.startsWith('/clients');

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

  useEffect(() => {
    if (!isSearchRoute) {
      setHeaderSearch('');
      return;
    }

    const queryString = location.split('?')[1] ?? '';
    const params = new URLSearchParams(queryString);
    setHeaderSearch(params.get('search') ?? '');
  }, [location, isSearchRoute]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedHeaderSearch(headerSearch.trim());
    }, 220);

    return () => window.clearTimeout(timer);
  }, [headerSearch]);

  useEffect(() => {
    const currentPhrase = headerPlaceholderPhrases[headerPlaceholderPhraseIndex] || '';
    let timeoutMs = 70;

    if (!headerPlaceholderDeleting && headerPlaceholderCharCount < currentPhrase.length) {
      timeoutMs = 70;
    } else if (!headerPlaceholderDeleting && headerPlaceholderCharCount === currentPhrase.length) {
      timeoutMs = 1400;
    } else if (headerPlaceholderDeleting && headerPlaceholderCharCount > 0) {
      timeoutMs = 35;
    } else {
      timeoutMs = 200;
    }

    const timer = window.setTimeout(() => {
      if (!headerPlaceholderDeleting && headerPlaceholderCharCount < currentPhrase.length) {
        setHeaderPlaceholderCharCount((current) => current + 1);
        return;
      }

      if (!headerPlaceholderDeleting && headerPlaceholderCharCount === currentPhrase.length) {
        setHeaderPlaceholderDeleting(true);
        return;
      }

      if (headerPlaceholderDeleting && headerPlaceholderCharCount > 0) {
        setHeaderPlaceholderCharCount((current) => current - 1);
        return;
      }

      setHeaderPlaceholderDeleting(false);
      setHeaderPlaceholderPhraseIndex((current) => (current + 1) % headerPlaceholderPhrases.length);
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [headerPlaceholderPhrases, headerPlaceholderPhraseIndex, headerPlaceholderCharCount, headerPlaceholderDeleting]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeaderPlaceholderCaretVisible((current) => !current);
    }, 520);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!headerSearchRef.current) return;
      if (headerSearchRef.current.contains(event.target as Node)) return;
      setHeaderSearchOpen(false);
      setHeaderSearchHighlightIndex(-1);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const canSearchProposals = hasRole(['commercial']);
  const canSearchProjects = hasRole(['projects']);
  const canSearchClients = hasRole(['commercial', 'projects']);
  const searchEnabled = headerSearchOpen && debouncedHeaderSearch.length >= 2;

  const proposalsSearchQuery = useQuery<Proposal[]>({
    queryKey: ['/api/search/header', 'proposals'],
    queryFn: async () => proposalsApi.getAll().catch(() => []),
    enabled: searchEnabled && canSearchProposals,
    staleTime: 120000,
    retry: false,
  });

  const projectsSearchQuery = useQuery<Project[]>({
    queryKey: ['/api/search/header', 'projects'],
    queryFn: async () => projectsApi.getAll().catch(() => []),
    enabled: searchEnabled && canSearchProjects,
    staleTime: 120000,
    retry: false,
  });

  const clientsSearchQuery = useQuery<Client[]>({
    queryKey: ['/api/search/header', 'clients'],
    queryFn: async () => clientsApi.getAll().catch(() => []),
    enabled: searchEnabled && canSearchClients,
    staleTime: 120000,
    retry: false,
  });

  const headerSearchResults = useMemo<HeaderSearchResult[]>(() => {
    const query = debouncedHeaderSearch.toLowerCase();
    if (!query || query.length < 2) return [];

    const proposals = (proposalsSearchQuery.data || [])
      .filter((proposal) => {
        const revisionSuffix = Number(proposal.revision || 0) > 0 ? `-R${proposal.revision}` : '';
        const code = `${proposal.code || ''}${revisionSuffix}`.toLowerCase();
        const title = String(proposal.title || '').toLowerCase();
        const client = String(proposal.client?.razaoSocial || proposal.client?.nomeFantasia || '').toLowerCase();
        return code.includes(query) || title.includes(query) || client.includes(query);
      })
      .slice(0, 5)
      .map((proposal) => ({
        id: proposal.id,
        type: 'proposal' as const,
        title: `${proposal.code}${Number(proposal.revision || 0) > 0 ? `-R${proposal.revision}` : ''} · ${proposal.title || '-'}`,
        subtitle: proposal.client?.razaoSocial || proposal.client?.nomeFantasia || 'Proposta',
        targetPath: `/proposals?search=${encodeURIComponent(proposal.code || '')}`,
      }));

    const projects = (projectsSearchQuery.data || [])
      .filter((project) => {
        const code = String(project.code || '').toLowerCase();
        const name = String(project.name || '').toLowerCase();
        const client = String(project.client?.razaoSocial || project.client?.nomeFantasia || '').toLowerCase();
        return code.includes(query) || name.includes(query) || client.includes(query);
      })
      .slice(0, 5)
      .map((project) => ({
        id: project.id,
        type: 'project' as const,
        title: `${project.code} · ${project.name || '-'}`,
        subtitle: project.client?.razaoSocial || project.client?.nomeFantasia || 'Projeto',
        targetPath: `/projects?projectId=${project.id}&search=${encodeURIComponent(project.code || '')}`,
      }));

    const clients = (clientsSearchQuery.data || [])
      .filter((client) => {
        const name = String(client.razaoSocial || '').toLowerCase();
        const tradeName = String(client.nomeFantasia || '').toLowerCase();
        const cnpj = String(client.cnpj || '').toLowerCase();
        return name.includes(query) || tradeName.includes(query) || cnpj.includes(query);
      })
      .slice(0, 5)
      .map((client) => ({
        id: client.id,
        type: 'client' as const,
        title: client.razaoSocial || client.nomeFantasia || 'Cliente',
        subtitle: client.nomeFantasia || client.cnpj || 'Cliente',
        targetPath: `/clients?search=${encodeURIComponent(client.razaoSocial || client.nomeFantasia || '')}`,
      }));

    return [...proposals, ...projects, ...clients].slice(0, 10);
  }, [debouncedHeaderSearch, proposalsSearchQuery.data, projectsSearchQuery.data, clientsSearchQuery.data]);

  useEffect(() => {
    if (headerSearchResults.length === 0) {
      setHeaderSearchHighlightIndex(-1);
      return;
    }

    if (headerSearchHighlightIndex >= headerSearchResults.length) {
      setHeaderSearchHighlightIndex(0);
    }
  }, [headerSearchResults, headerSearchHighlightIndex]);

  const resolveResultTypeLabel = (type: HeaderSearchResult['type']) => {
    if (type === 'proposal') return 'Proposta';
    if (type === 'project') return 'Projeto';
    return 'Cliente';
  };

  const openHeaderSearchResult = (result: HeaderSearchResult) => {
    setHeaderSearchOpen(false);
    setHeaderSearchHighlightIndex(-1);
    setLocation(result.targetPath);
  };

  const hasAccess = (item: NavigationItem) => item.roles.length === 0 || hasRole(item.roles);

  const filteredMainItems = mainMenuItems
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) => hasAccess(child)) || [],
    }))
    .filter((item) => hasAccess(item) || item.children.length > 0);

  const filteredAdminItems = adminMenuItems.filter(
    (item) => item.roles.length === 0 || hasRole(item.roles)
  );

  const allItems = [
    ...mainMenuItems.flatMap((item) => [item, ...(item.children ?? [])]),
    ...adminMenuItems,
    settingsNavigationItem,
  ];
  const currentPage = allItems.find(item => item.path === location)?.label || 'Dashboard';
  const currentDescription = pageDescriptions[location] || 'Bem-vindo ao sistema';

  const sidebarWidth = sidebarCollapsed ? 'w-20' : 'w-72';
  const mainPadding = sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72';

  const renderMenuItem = (item: NavigationItem) => {
    const Icon = item.icon;
    const childItems = item.children ?? [];
    const hasActiveChild = childItems.some((child) => child.path === location);
    const isDirectActive = location === item.path;
    const isActive = isDirectActive || hasActiveChild;

    const menuLink = (
      <Link
        key={item.path}
        href={item.path}
        data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
          ${sidebarCollapsed ? 'justify-center' : ''}
          ${isDirectActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-black/20 dark:shadow-[0_18px_34px_-22px_rgba(2,10,38,0.9)]'
            : hasActiveChild
              ? 'text-sidebar-foreground bg-sidebar-accent/55'
            : 'text-sidebar-foreground/72 hover:text-sidebar-foreground hover:bg-sidebar-accent/90'
          }`}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="text-sm font-medium">{item.label}</span>
        )}
      </Link>
    );

    if (sidebarCollapsed || childItems.length === 0) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>{menuLink}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={item.path} className="space-y-1">
        {menuLink}
        <div className="ml-7 space-y-0.5 border-l border-sidebar-border/60 pl-3">
          {childItems.map((child) => {
            const isChildActive = location === child.path;

            return (
              <Link
                key={child.path}
                href={child.path}
                data-testid={`nav-${child.path.replace('/', '')}`}
                className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-all duration-200
                  ${isChildActive
                    ? 'bg-sidebar-primary/16 text-sidebar-foreground'
                    : 'text-sidebar-foreground/62 hover:text-sidebar-foreground hover:bg-sidebar-accent/55'
                  }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    isChildActive ? 'bg-sidebar-foreground' : 'bg-sidebar-foreground/35 group-hover:bg-sidebar-foreground/55'
                  }`}
                />
                <span className={`font-medium ${isChildActive ? '' : 'font-normal'}`}>{child.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background dark:bg-[radial-gradient(circle_at_top_left,_rgba(55,130,255,0.08),_transparent_26%),linear-gradient(180deg,_rgba(8,20,78,0.16)_0%,_rgba(8,20,78,0)_34%)]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 ${sidebarWidth} bg-sidebar text-sidebar-foreground border-r border-sidebar-border layout-sidebar-contour backdrop-blur-xl dark:bg-sidebar/95 dark:supports-[backdrop-filter]:bg-sidebar/88 transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="p-4 dark:border-b dark:border-white/5">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-black/20 dark:shadow-[0_12px_26px_-16px_rgba(10,132,255,0.9)]">
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
                  src="/assets/tec3-logo.svg" 
                  alt="TEC3 Engenharia" 
                  className="w-full max-h-12 object-contain brightness-0 invert dark:drop-shadow-[0_10px_18px_rgba(6,18,58,0.45)]"
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
          <div className="px-4 py-3 border-t border-b border-sidebar-border dark:bg-white/[0.02]">
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
      <header className={`fixed top-0 right-0 left-0 ${sidebarCollapsed ? 'lg:left-20' : 'lg:left-72'} h-16 bg-sidebar border-b border-sidebar-border layout-header-contour backdrop-blur-xl dark:bg-sidebar/90 dark:supports-[backdrop-filter]:bg-sidebar/80 z-30 px-4 lg:px-6 transition-all duration-300 ease-in-out`}>
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
            <div className="relative w-full" ref={headerSearchRef}>
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-white/[0.07] via-white/[0.02] to-transparent" />
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${headerSearchOpen ? 'text-sidebar-foreground/80' : 'text-sidebar-foreground/45'}`} />
              <Input
                type="text"
                placeholder={headerDisplayPlaceholder}
                data-testid="input-search"
                className="w-full pl-10 rounded-xl border-white/20 bg-sidebar-accent/55 text-sidebar-foreground placeholder:text-sidebar-foreground/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_24px_-20px_rgba(2,6,23,0.85)] transition-all focus:bg-sidebar-accent/80 focus:border-white/35 focus:ring-2 focus:ring-white/15 dark:bg-white/[0.06] dark:border-white/15 dark:focus:bg-white/[0.1]"
                value={headerSearch}
                onChange={(e) => {
                  setHeaderSearch(e.target.value);
                  setHeaderSearchOpen(true);
                }}
                onFocus={() => setHeaderSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setHeaderSearchOpen(false);
                    setHeaderSearchHighlightIndex(-1);
                    return;
                  }

                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (headerSearchResults.length === 0) return;
                    setHeaderSearchOpen(true);
                    setHeaderSearchHighlightIndex((current) => {
                      if (current < 0) return 0;
                      return (current + 1) % headerSearchResults.length;
                    });
                    return;
                  }

                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (headerSearchResults.length === 0) return;
                    setHeaderSearchOpen(true);
                    setHeaderSearchHighlightIndex((current) => {
                      if (current <= 0) return headerSearchResults.length - 1;
                      return current - 1;
                    });
                    return;
                  }

                  if (e.key === 'Enter') {
                    const highlighted = headerSearchResults[headerSearchHighlightIndex] || headerSearchResults[0];
                    if (highlighted) {
                      e.preventDefault();
                      openHeaderSearchResult(highlighted);
                    }
                  }
                }}
              />

              {headerSearchOpen && debouncedHeaderSearch.length >= 2 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-xl border border-sidebar-border bg-sidebar shadow-xl shadow-black/20 backdrop-blur-xl overflow-hidden">
                  {headerSearchResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-sidebar-foreground/60">Nenhum resultado encontrado.</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-1">
                      {headerSearchResults.map((result, index) => (
                        <button
                          key={`${result.type}-${result.id}-${index}`}
                          type="button"
                          className={`w-full text-left px-4 py-2.5 transition-colors ${headerSearchHighlightIndex === index ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/80'}`}
                          onMouseEnter={() => setHeaderSearchHighlightIndex(index)}
                          onClick={() => openHeaderSearchResult(result)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium truncate">{result.title}</span>
                            <span className="text-[11px] uppercase tracking-wide text-sidebar-foreground/50">{resolveResultTypeLabel(result.type)}</span>
                          </div>
                          <div className="text-xs text-sidebar-foreground/55 truncate">{result.subtitle}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <HeaderShortcutManager />

            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-theme-toggle"
                  onClick={toggleTheme}
                  className="header-icon-button"
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

            {notificationsEnabled && <NotificationBell />}

            {/* Profile Avatar with Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-profile-menu"
                  className="header-icon-button"
                >
                  <User className="h-5 w-5" />
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
