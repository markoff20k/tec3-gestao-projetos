/**
 * Alinha o perfil (role) e os grupos de diretório de cada usuário com o AD.
 *
 * O login já faz isso, mas só para quem entra: sem o sincronismo, quem não logou
 * ficaria com o perfil que veio do import do legado até a próxima entrada.
 * Este script antecipa esse acerto para a base inteira.
 *
 * O critério é EXATAMENTE o do login (server/ldap.ts):
 *   - grupos lidos de memberOf, sem expandir aninhamento;
 *   - DN comparado com espaçamento e caixa normalizados;
 *   - precedência admin > commercial > projects, com projects como padrão.
 * Qualquer divergência aqui faria o perfil mudar sozinho no primeiro login.
 *
 * Somente leitura no AD. Escreve apenas no banco do sistema novo.
 *
 * Uso:
 *   npx tsx scripts/sync-roles-from-ad.ts            (simulação)
 *   npx tsx scripts/sync-roles-from-ad.ts --apply
 */
import 'dotenv/config';
import { Client } from 'ldapts';
import { prisma } from '../server/db.ts';
import { resolveRoleFromDirectoryGroups } from '../server/permissions.ts';

const APLICAR = process.argv.includes('--apply');

type Role = 'admin' | 'commercial' | 'projects';

const normalizarDn = (valor: unknown) =>
  String(valor ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*=\s*/g, '=');

const normalizarNome = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// O perfil vem da tabela access_groups (mesma derivacao do login):
// admin = membro do grupo ADMIN, commercial = membro do COM, resto projects.
// Nada de variavel de ambiente — era ela que deixava processos antigos
// regravarem admin para quem ja tinha saido do grupo.

async function main() {
  const url = process.env.LDAP_AD_URL;
  const baseDn = process.env.LDAP_AD_BASE_DN;
  const bindRaw = process.env.LDAP_AD_BIND_DN;
  const bindPassword = process.env.LDAP_AD_BIND_PASSWORD;
  if (!url || !baseDn || !bindRaw || !bindPassword) {
    throw new Error('Configuração de AD ausente (LDAP_AD_URL/BASE_DN/BIND_DN/BIND_PASSWORD).');
  }

  const gruposPerfil = await prisma.accessGroup.findMany({
    where: { key: { in: ['GG-APP-GESTAO-ADMIN', 'GG-APP-GESTAO-COM'] } },
    select: { key: true, directoryDn: true, isActive: true },
  });
  console.log('grupos que definem o perfil (tabela access_groups):');
  for (const g of gruposPerfil) {
    console.log(`  ${g.key.padEnd(22)} ${g.directoryDn ?? '(sem DN!)'} ${g.isActive ? '' : '[INATIVO]'}`);
  }
  if (gruposPerfil.length === 0) {
    throw new Error('access_groups sem ADMIN/COM: rode scripts/sync-access-groups.ts --apply antes.');
  }

  const principal =
    bindRaw.includes('=') || bindRaw.includes('@')
      ? bindRaw
      : `${bindRaw}@${process.env.LDAP_AD_DOMAIN ?? ''}`;

  const client = new Client({ url, timeout: 30000, connectTimeout: 30000 });
  await client.bind(principal, bindPassword);

  // Uma varredura só, paginada: trazer memberOf por usuário é mais fiel ao
  // login do que listar os membros de cada grupo.
  const { searchEntries } = await client.search(baseDn, {
    scope: 'sub',
    filter: '(&(objectCategory=person)(objectClass=user))',
    attributes: ['sAMAccountName', 'mail', 'displayName', 'cn', 'memberOf', 'userAccountControl'],
    paged: { pageSize: 500 },
  });
  await client.unbind();

  const comoLista = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []).map(String);

  const doAd = searchEntries.map((e: any) => ({
    login: String(e.sAMAccountName ?? '').trim().toLowerCase(),
    email: String(e.mail ?? '').trim().toLowerCase(),
    nome: String(e.displayName ?? e.cn ?? '').trim(),
    grupos: comoLista(e.memberOf),
    // Bit 2 (0x2) do userAccountControl marca conta desabilitada no AD.
    desabilitado: (Number(e.userAccountControl ?? 0) & 2) === 2,
  }));
  console.log(`\ncontas no AD: ${doAd.length}`);

  const porEmail = new Map(doAd.filter((u) => u.email).map((u) => [u.email, u]));
  const porLogin = new Map(doAd.filter((u) => u.login).map((u) => [u.login, u]));
  const porNome = new Map<string, typeof doAd>();
  for (const u of doAd) {
    const k = normalizarNome(u.nome);
    if (!k) continue;
    porNome.set(k, [...(porNome.get(k) ?? []), u]);
  }

  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { name: 'asc' },
  });

  const mudancas: Array<{ nome: string; email: string; de: string; para: Role; via: string }> = [];
  const semCorrespondencia: string[] = [];
  let iguais = 0;
  let gruposGravados = 0;

  for (const u of usuarios) {
    const emailNorm = u.email.trim().toLowerCase();
    const loginNorm = emailNorm.split('@')[0];

    // Mesma ordem do login: e-mail, depois login (parte local), depois nome —
    // e no nome só quando houver exatamente um candidato, para não acertar a
    // pessoa errada em caso de homônimo.
    let ad = porEmail.get(emailNorm) ?? porLogin.get(loginNorm) ?? null;
    let via = ad ? (porEmail.has(emailNorm) ? 'e-mail' : 'login') : '';
    if (!ad) {
      const candidatos = porNome.get(normalizarNome(u.name)) ?? [];
      if (candidatos.length === 1) {
        ad = candidatos[0];
        via = 'nome';
      }
    }

    if (!ad) {
      semCorrespondencia.push(`${u.name} <${u.email}> (perfil atual: ${u.role})`);
      continue;
    }

    const novo = await resolveRoleFromDirectoryGroups(ad.grupos);
    if (novo !== u.role) {
      mudancas.push({ nome: u.name, email: u.email, de: u.role, para: novo, via });
    } else {
      iguais++;
    }

    if (APLICAR) {
      await prisma.user.update({
        where: { id: u.id },
        data: { role: novo, directoryGroups: ad.grupos },
      });
      gruposGravados++;
    }
  }

  console.log(`\nusuarios no sistema: ${usuarios.length}`);
  console.log(`  perfil ja correto:      ${iguais}`);
  console.log(`  perfil a mudar:         ${mudancas.length}`);
  console.log(`  sem conta no AD:        ${semCorrespondencia.length}`);

  if (mudancas.length) {
    console.log('\nmudancas de perfil:');
    for (const m of mudancas.sort((a, b) => a.para.localeCompare(b.para) || a.nome.localeCompare(b.nome))) {
      console.log(`  ${m.de.padEnd(11)} -> ${m.para.padEnd(11)} ${m.nome} <${m.email}>  [casado por ${m.via}]`);
    }
  }

  if (semCorrespondencia.length) {
    console.log('\nsem conta correspondente no AD (perfil mantido como esta):');
    for (const s of semCorrespondencia) console.log(`  ${s}`);
  }

  const futurosAdmins = mudancas.filter((m) => m.para === 'admin').length;
  const perdemAdmin = mudancas.filter((m) => m.de === 'admin').length;
  console.log(`\nresumo: +${futurosAdmins} admin(s), -${perdemAdmin} admin(s)`);

  console.log(
    APLICAR
      ? `\nAplicado. Perfil e grupos gravados para ${gruposGravados} usuario(s).`
      : '\nNada foi gravado. Rode com --apply para aplicar.'
  );
}

main()
  .catch((erro) => {
    console.error('Falha:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
