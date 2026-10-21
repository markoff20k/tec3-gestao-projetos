/**
 * Catálogo de permissões e resolução do que cada usuário pode fazer.
 *
 * O acesso não vem mais de um perfil fixo: vem dos grupos do diretório em que a
 * pessoa está. Cada grupo concede um conjunto de permissões, configurável na
 * tela de administração, e a permissão efetiva do usuário é a UNIÃO das
 * permissões de todos os seus grupos — um grupo a mais nunca tira acesso.
 *
 * As chaves aqui são o contrato: o banco guarda apenas as chaves, então renomear
 * uma exige migrar os grupos que a referenciam.
 */
import { prisma } from './db.ts';

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionArea {
  area: string;
  items: PermissionDefinition[];
}

export const PERMISSION_CATALOG: PermissionArea[] = [
  {
    area: 'Projetos',
    items: [
      { key: 'projects.view', label: 'Ver projetos', description: 'Acessar a lista e os detalhes dos projetos.' },
      { key: 'projects.coordinator', label: 'Alterar o coordenador', description: 'Trocar o coordenador do projeto mesmo depois do TAP emitido. O TAP já gerado continua nomeando o coordenador anterior.' },
      { key: 'projects.rename', label: 'Renomear o projeto', description: 'Alterar o nome do projeto. O nome aparece no TAP já emitido, então a troca fica registrada no log.' },
      { key: 'projects.description', label: 'Editar a descrição', description: 'Alterar o texto descritivo do projeto. O coordenador do projeto sempre pode, independente desta permissão.' },
      { key: 'projects.manage', label: 'Criar e editar projetos', description: 'Cadastrar projetos e alterar seus dados.' },
      { key: 'projects.setup', label: 'Configurar setup', description: 'Definir coordenador, limite diário e exigência de aprovação.' },
      { key: 'projects.team', label: 'Alocar equipe e atividades', description: 'Definir quem lança horas e quais atividades valem no projeto.' },
      { key: 'projects.status', label: 'Alterar status técnico', description: 'Iniciar, paralisar, concluir ou cancelar um projeto.' },
      { key: 'projects.reopen', label: 'Reabrir projeto encerrado', description: 'Desfazer um encerramento. Costuma ficar restrito à administração.' },
    ],
  },
  {
    area: 'Horas',
    items: [
      { key: 'time.log', label: 'Lançar horas', description: 'Registrar horas nos projetos em que está alocado.' },
      { key: 'time.approve', label: 'Aprovar e rejeitar horas', description: 'Analisar a fila de aprovação dos projetos sob sua responsabilidade.' },
    ],
  },
  {
    area: 'Propostas',
    items: [
      { key: 'proposals.view', label: 'Ver propostas', description: 'Acessar a lista e os detalhes das propostas.' },
      { key: 'proposals.manage', label: 'Criar e editar propostas', description: 'Cadastrar propostas, revisões, despesas e aditivos.' },
      { key: 'proposals.tap', label: 'Gerar TAP e abrir projeto', description: 'Emitir o TAP e converter a proposta em projeto.' },
    ],
  },
  {
    area: 'Clientes',
    items: [
      { key: 'clients.view', label: 'Ver clientes', description: 'Acessar a carteira de clientes.' },
      { key: 'clients.manage', label: 'Criar e editar clientes', description: 'Cadastrar e alterar dados cadastrais.' },
    ],
  },
  {
    area: 'Administração',
    items: [
      { key: 'admin.users', label: 'Gerenciar profissionais', description: 'Cadastrar e editar os profissionais da Tec3.' },
      { key: 'admin.categories', label: 'Gerenciar categorias', description: 'Manter as categorias de proposta.' },
      { key: 'admin.costCenters', label: 'Gerenciar centros de custo', description: 'Manter os centros de custo administrativos.' },
      { key: 'admin.activities', label: 'Gerenciar atividades', description: 'Manter o catálogo de atividades.' },
      { key: 'admin.healthRules', label: 'Configurar regra de saúde', description: 'Definir os limiares do semáforo de saúde dos projetos.' },
      { key: 'reports.view', label: 'Ver relatórios gerenciais', description: 'Acessar o dashboard gerencial com a visão consolidada do negócio.' },
      { key: 'admin.accessGroups', label: 'Gerenciar grupos de acesso', description: 'Definir o que cada grupo do diretório pode fazer. Concede controle sobre o próprio acesso.' },
    ],
  },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.flatMap((a) => a.items.map((i) => i.key));

const PERMISSION_KEY_SET = new Set(ALL_PERMISSION_KEYS);

export function isValidPermission(key: unknown): key is string {
  return typeof key === 'string' && PERMISSION_KEY_SET.has(key);
}

export function sanitizePermissions(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  return Array.from(new Set(list.filter(isValidPermission)));
}

/** Comparação de DN do diretório: espaçamento e caixa variam entre servidores. */
export function normalizeDn(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*=\s*/g, '=');
}

/**
 * Rede de segurança para quem não está em grupo nenhum: o colaborador novo que
 * o TI ainda não incluiu nos GG-APP-GESTAO-* não pode ficar trancado. Ele
 * recebe o nível básico do sistema — por decisão do cliente (21/10/2026),
 * SOMENTE o apontamento de horas. Nada de lista de projetos, dashboard ou
 * valores: a pessoa entra, lança as horas dela e pronto.
 *
 * A lista é fixa de propósito: a rede de segurança não pode depender de
 * cadastro que alguém possa apagar ou alargar sem querer.
 */
export const FALLBACK_PERMISSIONS = ['time.log'] as const;

/**
 * Perfil (role) derivado dos grupos do diretório — SEM variável de ambiente.
 *
 * Antes o perfil era calculado a partir de LDAP_AD_ROLE_*_DNS, e um processo
 * rodando com ambiente desatualizado (o container de produção foi um) regravava
 * admin em cada login para quem estava nos grupos antigos — promover funcionava,
 * rebaixar nunca descia. Agora a referência é a tabela access_groups, que é
 * única e compartilhada: o DN de cada grupo vem do banco, e mudou lá, muda em
 * todo processo no mesmo instante.
 *
 * admin ⇔ membro do grupo ADMIN; commercial ⇔ membro do COM; todo o resto é
 * projects. O perfil é só um atalho grosso — o acesso fino continua vindo das
 * permissões por grupo.
 */
const ROLE_BY_GROUP_KEY: Array<{ key: string; role: 'admin' | 'commercial' }> = [
  { key: 'GG-APP-GESTAO-ADMIN', role: 'admin' },
  { key: 'GG-APP-GESTAO-COM', role: 'commercial' },
];

export async function resolveRoleFromDirectoryGroups(
  directoryGroups: string[]
): Promise<'admin' | 'commercial' | 'projects'> {
  const userDns = new Set(
    (Array.isArray(directoryGroups) ? directoryGroups : []).map(normalizeDn).filter(Boolean)
  );
  if (userDns.size === 0) return 'projects';

  const groups = await prisma.accessGroup.findMany({
    where: { isActive: true, directoryDn: { not: null }, key: { in: ROLE_BY_GROUP_KEY.map((r) => r.key) } },
    select: { key: true, directoryDn: true },
  });

  for (const { key, role } of ROLE_BY_GROUP_KEY) {
    const group = groups.find((g) => g.key === key);
    if (group && userDns.has(normalizeDn(group.directoryDn))) return role;
  }
  return 'projects';
}

/**
 * Permissões efetivas de um usuário, a partir dos grupos do diretório gravados
 * no último login. Grupos inativos ou sem DN configurado não contam. Quem não
 * casa com grupo nenhum cai no nível básico (ver FALLBACK_PERMISSIONS).
 */
export async function resolvePermissionsForGroups(directoryGroups: string[]): Promise<{
  permissions: Set<string>;
  matchedGroups: Array<{ key: string; name: string }>;
  /** true quando nenhum grupo casou e o nível básico foi aplicado. */
  fallbackApplied: boolean;
}> {
  const permissions = new Set<string>();
  const matchedGroups: Array<{ key: string; name: string }> = [];

  const userDns = new Set(
    (Array.isArray(directoryGroups) ? directoryGroups : []).map(normalizeDn).filter(Boolean)
  );

  if (userDns.size > 0) {
    const groups = await prisma.accessGroup.findMany({
      where: { isActive: true, directoryDn: { not: null } },
      select: { key: true, name: true, directoryDn: true, permissions: true },
    });

    for (const group of groups) {
      if (!userDns.has(normalizeDn(group.directoryDn))) continue;
      matchedGroups.push({ key: group.key, name: group.name });
      for (const permission of group.permissions) {
        if (isValidPermission(permission)) permissions.add(permission);
      }
    }
  }

  if (matchedGroups.length > 0) {
    return { permissions, matchedGroups, fallbackApplied: false };
  }

  for (const permission of FALLBACK_PERMISSIONS) permissions.add(permission);

  return { permissions, matchedGroups, fallbackApplied: true };
}
