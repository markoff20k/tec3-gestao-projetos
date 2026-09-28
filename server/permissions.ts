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
 * Permissões efetivas de um usuário, a partir dos grupos do diretório gravados
 * no último login. Grupos inativos ou sem DN configurado não contam.
 */
export async function resolvePermissionsForGroups(directoryGroups: string[]): Promise<{
  permissions: Set<string>;
  matchedGroups: Array<{ key: string; name: string }>;
}> {
  const permissions = new Set<string>();
  const matchedGroups: Array<{ key: string; name: string }> = [];

  if (!Array.isArray(directoryGroups) || directoryGroups.length === 0) {
    return { permissions, matchedGroups };
  }

  const userDns = new Set(directoryGroups.map(normalizeDn).filter(Boolean));
  if (userDns.size === 0) return { permissions, matchedGroups };

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

  return { permissions, matchedGroups };
}
