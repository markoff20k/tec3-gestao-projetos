/**
 * Traz os grupos GG-APP-GESTAO-* do AD para a tabela access_groups.
 *
 * As permissões aqui são apenas um PONTO DE PARTIDA conservador: preferi conceder
 * de menos a conceder demais, porque faltar acesso alguém reclama, e sobrar
 * acesso ninguém percebe. O ajuste fino é feito na tela de grupos de acesso.
 *
 * Rodar de novo é seguro: atualiza nome e DN, e NÃO sobrescreve as permissões de
 * um grupo que já existe — senão cada execução desfaria o que foi configurado.
 *
 * Uso:
 *   npx tsx scripts/sync-access-groups.ts --dry-run
 *   npx tsx scripts/sync-access-groups.ts --apply
 *   npx tsx scripts/sync-access-groups.ts --apply --reset-permissions
 */
import 'dotenv/config';
import { Client } from 'ldapts';
import { prisma } from '../server/db.ts';
import { ALL_PERMISSION_KEYS, sanitizePermissions } from '../server/permissions.ts';

const APLICAR = process.argv.includes('--apply');
const RESETAR = process.argv.includes('--reset-permissions');

/** Sufixo do CN -> rótulo e permissões iniciais. */
const PADROES: Record<string, { name: string; description: string; permissions: string[] }> = {
  ADMIN: {
    name: 'Administradores do sistema',
    description: 'Acesso total, incluindo a configuração dos próprios grupos de acesso.',
    permissions: ALL_PERMISSION_KEYS,
  },
  DIR: {
    name: 'Diretoria',
    description: 'Visão completa do negócio e aprovação de horas, sem configuração do sistema.',
    permissions: [
      'projects.view', 'projects.status', 'projects.reopen',
      'time.approve',
      'proposals.view', 'proposals.manage',
      'clients.view', 'clients.manage',
    ],
  },
  COORD: {
    name: 'Coordenação de projetos',
    description: 'Conduz os projetos: setup, equipe, status e aprovação das horas.',
    permissions: [
      'projects.view', 'projects.description', 'projects.manage', 'projects.setup', 'projects.team', 'projects.status',
      'time.log', 'time.approve',
      'proposals.view', 'clients.view',
    ],
  },
  COM: {
    name: 'Comercial',
    description: 'Propostas e carteira de clientes, da elaboração à abertura do projeto.',
    permissions: [
      'proposals.view', 'proposals.manage',
      'clients.view', 'clients.manage',
      'projects.view', 'time.log',
    ],
  },
  EP: {
    name: 'Escritório de projetos',
    description: 'PMO: acompanha os projetos, edita descrição e responde pela troca de coordenador.',
    permissions: ['projects.view', 'projects.description', 'projects.coordinator', 'proposals.view', 'proposals.tap', 'time.log'],
  },
  AT: {
    name: 'Assistência técnica',
    description: 'Equipe de apoio técnico que lança horas.',
    permissions: ['projects.view', 'time.log'],
  },
  ADM: {
    name: 'Administrativo',
    description: 'Apoio administrativo, com visão de clientes e propostas.',
    permissions: ['projects.view', 'time.log', 'clients.view', 'proposals.view'],
  },
  RH: {
    name: 'Recursos humanos',
    description: 'Cadastro dos profissionais da Tec3 e lançamento de horas.',
    permissions: ['projects.view', 'time.log', 'admin.users'],
  },
  SSMA: {
    name: 'Saúde, segurança e meio ambiente',
    description: 'Equipe de SSMA que lança horas nos projetos.',
    permissions: ['projects.view', 'time.log'],
  },
};

async function buscarGruposNoAd() {
  const url = process.env.LDAP_AD_URL;
  const baseDn = process.env.LDAP_AD_BASE_DN;
  const bindRaw = process.env.LDAP_AD_BIND_DN;
  const bindPassword = process.env.LDAP_AD_BIND_PASSWORD;
  const domain = process.env.LDAP_AD_DOMAIN || '';

  if (!url || !baseDn || !bindRaw || !bindPassword) {
    throw new Error('Configuração de AD ausente (LDAP_AD_URL/BASE_DN/BIND_DN/BIND_PASSWORD).');
  }

  // LDAP_AD_BIND_DN costuma ser um sAMAccountName, não um DN completo.
  const principal = bindRaw.includes('=') || bindRaw.includes('@') ? bindRaw : `${bindRaw}@${domain}`;

  const client = new Client({ url, timeout: 15000, connectTimeout: 15000 });
  try {
    await client.bind(principal, bindPassword);
    const { searchEntries } = await client.search(baseDn, {
      scope: 'sub',
      filter: '(&(objectClass=group)(cn=GG-APP-GESTAO-*))',
      attributes: ['cn', 'distinguishedName', 'description', 'member'],
    });

    return searchEntries.map((g) => ({
      cn: String(g.cn),
      dn: String(g.distinguishedName ?? g.dn),
      description: g.description ? String(g.description) : null,
      membros: Array.isArray(g.member) ? g.member.length : g.member ? 1 : 0,
    }));
  } finally {
    await client.unbind().catch(() => {});
  }
}

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===\n' : '=== SIMULAÇÃO (nada será gravado) ===\n');

  const grupos = (await buscarGruposNoAd()).sort((a, b) => a.cn.localeCompare(b.cn));
  console.log(`grupos encontrados no AD: ${grupos.length}\n`);

  let criados = 0;
  let atualizados = 0;
  let semPadrao = 0;

  for (const g of grupos) {
    const sufixo = g.cn.replace(/^GG-APP-GESTAO-/i, '').toUpperCase();
    const padrao = PADROES[sufixo];
    if (!padrao) {
      semPadrao += 1;
      console.log(`${g.cn.padEnd(22)} | SEM PADRÃO — será criado sem nenhuma permissão, para você configurar`);
    }

    const permissoes = sanitizePermissions(padrao?.permissions ?? []);
    const existente = await prisma.accessGroup.findUnique({ where: { key: g.cn } });

    if (!existente) {
      criados += 1;
      console.log(`${g.cn.padEnd(22)} | CRIAR   | ${permissoes.length} permissão(ões) | ${g.membros} membro(s) no AD`);
      if (APLICAR) {
        await prisma.accessGroup.create({
          data: {
            key: g.cn,
            name: padrao?.name ?? g.cn,
            description: g.description || padrao?.description || null,
            directoryDn: g.dn,
            permissions: permissoes,
          },
        });
      }
    } else {
      atualizados += 1;
      const mudaPermissoes = RESETAR ? ` | permissões redefinidas para ${permissoes.length}` : ' | permissões preservadas';
      console.log(`${g.cn.padEnd(22)} | EXISTE  | DN sincronizado${mudaPermissoes}`);
      if (APLICAR) {
        await prisma.accessGroup.update({
          where: { id: existente.id },
          data: {
            directoryDn: g.dn,
            name: existente.name || padrao?.name || g.cn,
            ...(RESETAR ? { permissions: permissoes } : {}),
          },
        });
      }
    }
  }

  console.log(`\ncriados: ${criados} | já existentes: ${atualizados} | sem padrão definido: ${semPadrao}`);
  if (!APLICAR) console.log('\nnada foi gravado. rode com --apply para aplicar.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
