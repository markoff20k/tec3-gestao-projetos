/**
 * Semeia os usuários a partir da tabela Usuario do legado, com nome e e-mail reais.
 *
 * Precisa rodar ANTES de qualquer etapa que crie usuário, e é a razão de existir:
 *
 *  - `link-proposal-coordinators` cria usuário a partir do NOME do responsável;
 *  - `link-legacy-time-entry-users` cria a partir do LOGIN;
 *  - `backfill-legacy-user-full-names` só corrige os nomes no fim.
 *
 * Como a primeira roda antes da segunda, a mesma pessoa nascia duas vezes — uma
 * por nome, outra por login — e o import anterior terminou com 29 pares
 * duplicados, que apareciam lado a lado nas listas de coordenador.
 *
 * Semeando antes, as duas passam a ENCONTRAR: a de coordenadores casa por nome
 * normalizado, a de horas casa pelo prefixo do e-mail, que é o próprio login.
 * De quebra, o e-mail passa a ser o corporativo real em vez de um
 * `@legacy.tec3.local` inventado.
 *
 * Uso:
 *   npx tsx scripts/import-legacy-users.ts --dry-run
 *   npx tsx scripts/import-legacy-users.ts --apply
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

const APLICAR = process.argv.includes('--apply');

/** Contas técnicas e de serviço do diretório: não são pessoas. */
const CONTAS_TECNICAS = new Set([
  'ad_query', 'adm.axter', 'adm.profits', 'adm_script', 'administrator',
  'backup_cobian', 'check', 'dns-srv-ad', 'fw-ldap', 'fw-svc-ldap', 'fw-svc-sso',
  'geotecnica_tec3', 'grafana', 'krbtgt', 'minascopy', 'proaero_app',
  'proaero_service', 'prtg-ldap', 'saprod.doc', 'storage', 'suporte',
  'tec3_campo', 'tec3usuario', 'tec_fw', 'vpn_reset',
]);

function normalizeName(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parte local do e-mail a partir do login, sem acento.
 *
 * O legado tem o mesmo usuário cadastrado duas vezes, "manutencao" e
 * "manutenção": sem tirar o acento sairiam dois e-mails diferentes para a mesma
 * conta, e um deles seria inválido.
 */
function loginParaEmail(login: string): string {
  return login
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .trim();
}

interface UsuarioLegado {
  login: string;
  nome: string;
  email: string | null;
  grupoMail: string | null;
  receberMail: boolean;
}

async function carregarUsuariosDoLegado(): Promise<UsuarioLegado[]> {
  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST!,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER!,
    password: process.env.LEGACY_DB_PASSWORD!,
    database: process.env.LEGACY_DB_NAME!,
  });

  try {
    const [rows] = await conn.query<any[]>(
      'SELECT userUsuario, nome, email, grupoMail, receberMail FROM Usuario'
    );

    return rows
      .map((r) => ({
        login: String(r.userUsuario ?? '').trim().toLowerCase(),
        nome: String(r.nome ?? '').trim(),
        email: r.email ? String(r.email).trim().toLowerCase() : null,
        grupoMail: r.grupoMail ? String(r.grupoMail).trim() : null,
        receberMail: Boolean(r.receberMail),
      }))
      .filter((u) => u.login && !CONTAS_TECNICAS.has(u.login));
  } finally {
    await conn.end();
  }
}

async function main() {
  console.log(APLICAR ? '=== MODO GRAVAÇÃO ===\n' : '=== SIMULAÇÃO (nada será gravado) ===\n');

  const legado = await carregarUsuariosDoLegado();
  console.log(`legado: ${legado.length} pessoas (contas técnicas já excluídas)`);

  const existentes = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  const porEmail = new Map(existentes.map((u) => [u.email.toLowerCase(), u]));
  const porPrefixo = new Map(existentes.map((u) => [u.email.split('@')[0].toLowerCase(), u]));
  const porNome = new Map(existentes.map((u) => [normalizeName(u.name), u]));

  let criados = 0;
  let jaExistiam = 0;
  let semEmailReal = 0;
  const amostra: string[] = [];
  const vistosEmail = new Set<string>();
  const vistosNome = new Set<string>();
  let ignoradosDuplicados = 0;

  for (const u of legado) {
    // Sem e-mail no legado, o endereço é derivado do LOGIN (nunca do nome): é o
    // login que as etapas seguintes usam para reencontrar a pessoa.
    const email = u.email && u.email.includes('@') ? u.email : `${loginParaEmail(u.login)}@legacy.tec3.local`;
    if (!u.email) semEmailReal += 1;

    // Duplicata dentro do próprio legado não pode virar duplicata aqui.
    const chaveNome = normalizeName(u.nome);
    if (vistosEmail.has(email) || (chaveNome && vistosNome.has(chaveNome))) {
      ignoradosDuplicados += 1;
      continue;
    }
    vistosEmail.add(email);
    if (chaveNome) vistosNome.add(chaveNome);

    const jaTem =
      porEmail.get(email) ?? porPrefixo.get(u.login) ?? (u.nome ? porNome.get(normalizeName(u.nome)) : undefined);

    if (jaTem) {
      jaExistiam += 1;
      continue;
    }

    criados += 1;
    if (amostra.length < 10) {
      amostra.push(`${u.login.padEnd(16)} | ${email.padEnd(38)} | ${u.nome}`);
    }

    if (APLICAR) {
      const senha = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
      await prisma.user.create({
        data: {
          email,
          password: senha,
          name: u.nome || u.login,
          role: 'projects',
          isActive: true,
          emailGroup: u.grupoMail,
          receivesEmails: u.receberMail,
        },
      });
    }
  }

  console.log(`\nusuários a criar: ${criados}`);
  console.log(`já existiam (por e-mail, login ou nome): ${jaExistiam}`);
  console.log(`sem e-mail no legado, derivado do login: ${semEmailReal}`);
  console.log(`duplicados dentro do próprio legado, ignorados: ${ignoradosDuplicados}`);

  if (amostra.length) {
    console.log('\namostra do que seria criado:');
    for (const a of amostra) console.log('  ' + a);
  }

  if (!APLICAR) console.log('\nnada foi gravado. rode com --apply para aplicar.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
