import {
  LayoutDashboard,
  Building2,
  FileText,
  FolderKanban,
  Clock,
  BarChart3,
  Tags,
  Landmark,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavigationRole = 'admin' | 'commercial' | 'projects';

export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
  roles: NavigationRole[];
  description?: string;
}

export const mainMenuItems: NavigationItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [], description: 'Visão geral do sistema' },
  { path: '/clients', label: 'Clientes', icon: Building2, roles: ['commercial', 'admin'], description: 'Gerenciar clientes' },
  { path: '/proposals', label: 'Propostas', icon: FileText, roles: ['commercial', 'admin'], description: 'Gerenciar propostas comerciais' },
  { path: '/projects', label: 'Projetos', icon: FolderKanban, roles: ['projects', 'admin'], description: 'Gerenciar projetos' },
  { path: '/time-entries', label: 'Lançar Horas', icon: Clock, roles: ['projects', 'admin'], description: 'Registrar horas trabalhadas' },
  { path: '/reports', label: 'Relatórios', icon: BarChart3, roles: ['admin'], description: 'Visualizar relatórios' },
];

export const adminMenuItems: NavigationItem[] = [
  { path: '/categories', label: 'Categorias', icon: Tags, roles: ['admin'], description: 'Gerenciar categorias de proposta' },
  { path: '/cost-centers', label: 'Centros de Custo', icon: Landmark, roles: ['admin'], description: 'Gerenciar centros de custo' },
  { path: '/users', label: 'Profissionais da Tec3', icon: Users, roles: ['admin'], description: 'Gerenciar profissionais da Tec3' },
];

export const settingsNavigationItem: NavigationItem = {
  path: '/settings',
  label: 'Configurações',
  icon: Settings,
  roles: ['admin', 'commercial', 'projects'],
  description: 'Gerenciar preferências da conta',
};

export const pageDescriptions: Record<string, string> = {
  '/': 'Visão geral do sistema',
  '/clients': 'Gerenciar clientes',
  '/proposals': 'Gerenciar propostas comerciais',
  '/projects': 'Gerenciar projetos',
  '/time-entries': 'Registrar horas trabalhadas',
  '/reports': 'Visualizar relatórios',
  '/categories': 'Gerenciar categorias de proposta',
  '/cost-centers': 'Gerenciar centros de custo',
  '/users': 'Gerenciar profissionais da Tec3',
  '/settings': 'Gerenciar preferências da conta',
};

export const headerShortcutItems: NavigationItem[] = [
  ...mainMenuItems,
  ...adminMenuItems,
  settingsNavigationItem,
];