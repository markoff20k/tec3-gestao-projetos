import {
  LayoutDashboard,
  Building2,
  FileText,
  FolderKanban,
  Clock,
  BarChart3,
  Tags,
  Landmark,
  ListChecks,
  Settings,
  Users,
  HeartPulse,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavigationItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /**
   * Permissão exigida para o item aparecer, espelhando o guarda da API que a
   * tela consome. Sem permissão definida, basta estar logado. Admin passa em
   * tudo, como no servidor. A autorização passou a vir dos grupos do AD
   * (GG-APP-GESTAO-*), então o menu deixou de olhar o perfil.
   */
  permission?: string;
  /** Alternativas: o item aparece para quem tem QUALQUER uma destas. */
  anyOf?: string[];
  description?: string;
  children?: NavigationItem[];
}

export const mainMenuItems: NavigationItem[] = [
  // O Dashboard mostra numeros do negocio inteiro; quem so aponta horas
  // (nivel basico, sem grupo no AD) nao deve ve-lo.
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, anyOf: ['projects.view', 'proposals.view', 'reports.view'], description: 'Visão geral do sistema' },
  { path: '/clients', label: 'Clientes', icon: Building2, permission: 'clients.view', description: 'Gerenciar clientes' },
  { path: '/proposals', label: 'Propostas', icon: FileText, permission: 'proposals.view', description: 'Gerenciar propostas comerciais' },
  {
    path: '/projects',
    label: 'Projetos',
    icon: FolderKanban,
    permission: 'projects.view',
    description: 'Gerenciar projetos',
    children: [
      {
        path: '/time-entries',
        label: 'Lançar Horas',
        icon: Clock,
        permission: 'time.log',
        description: 'Registrar horas trabalhadas',
      },
      {
        path: '/time-approvals',
        label: 'Aprovar Horas',
        icon: Clock,
        permission: 'time.approve',
        description: 'Analisar e aprovar lançamentos pendentes',
      },
      // Indicadores está escondido do menu por ora, a pedido do cliente: a tela
      // não vai ser usada neste momento. A rota, a página e a descrição
      // continuam de pé — para trazer de volta, basta reativar esta entrada.
      // {
      //   path: '/projects/indicators',
      //   label: 'Indicadores',
      //   icon: BarChart3,
      //   permission: 'projects.view',
      //   description: 'Explorar KPIs, correlacoes e widgets de projetos',
      // },
    ],
  },
];

export const adminMenuItems: NavigationItem[] = [
  { path: '/categories', label: 'Categorias', icon: Tags, permission: 'admin.categories', description: 'Gerenciar categorias de proposta' },
  { path: '/cost-centers', label: 'Centros de Custo', icon: Landmark, permission: 'admin.costCenters', description: 'Gerenciar centros de custo' },
  { path: '/activities', label: 'Atividades', icon: ListChecks, permission: 'admin.activities', description: 'Gerenciar atividades' },
  { path: '/users', label: 'Profissionais da Tec3', icon: Users, permission: 'admin.users', description: 'Gerenciar profissionais da Tec3' },
  { path: '/project-health-rules', label: 'Regra Padrão de Saúde', icon: HeartPulse, permission: 'admin.healthRules', description: 'Configurar regra padrão do semáforo de saúde' },
  { path: '/access-groups', label: 'Grupos de Acesso', icon: ShieldCheck, permission: 'admin.accessGroups', description: 'Definir o que cada grupo do Active Directory pode fazer' },
];

export const settingsNavigationItem: NavigationItem = {
  path: '/settings',
  label: 'Configurações',
  icon: Settings,
  description: 'Gerenciar preferências da conta',
};

export const pageDescriptions: Record<string, string> = {
  '/': 'Visão geral do sistema',
  '/clients': 'Gerenciar clientes',
  '/proposals': 'Gerenciar propostas comerciais',
  '/projects': 'Gerenciar projetos',
  '/time-entries': 'Registrar horas trabalhadas',
  '/time-approvals': 'Analisar e aprovar lançamentos pendentes',
  '/projects/indicators': 'Explorar KPIs, correlacoes e widgets de projetos',
  '/categories': 'Gerenciar categorias de proposta',
  '/cost-centers': 'Gerenciar centros de custo',
  '/activities': 'Gerenciar atividades',
  '/users': 'Gerenciar profissionais da Tec3',
  '/project-health-rules': 'Configurar regra padrão do semáforo de saúde',
  '/settings': 'Gerenciar preferências da conta',
};

/** O item e visivel para este usuario? Mesma regra do servidor: admin ve tudo. */
export function canSeeNavigationItem(item: NavigationItem, can: (permission: string) => boolean): boolean {
  if (item.anyOf?.length) return item.anyOf.some((permission) => can(permission));
  if (item.permission) return can(item.permission);
  return true;
}

export const headerShortcutItems: NavigationItem[] = [
  ...mainMenuItems.flatMap((item) => [item, ...(item.children ?? [])]),
  ...adminMenuItems,
  settingsNavigationItem,
];
