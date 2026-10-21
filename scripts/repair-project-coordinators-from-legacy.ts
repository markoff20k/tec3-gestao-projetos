/**
 * Corrige o coordenador dos projetos usando a fonte VERDADEIRA do legado:
 * ProjetoProfissional.coordenador = 's'.
 *
 * O import original não lia essa flag — derivava o coordenador do responsável
 * da PROPOSTA (que é o comercial) e, na falta, de quem mais aprovou horas.
 * Resultado: T26095 ficou com a responsável da proposta (Gisele) em vez do
 * coordenador real (Fernando), e T26124 idem (Fernando em vez de Rafael).
 *
 * Somente leitura no legado. Projetos sem flag 's' no legado ficam como estão
 * (vale o que o import derivou ou o que foi definido pela interface).
 *
 * Uso:
 *   npx tsx scripts/repair-project-coordinators-from-legacy.ts            (simulação)
 *   npx tsx scripts/repair-project-coordinators-from-legacy.ts --apply
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

const APLICAR = process.argv.includes('--apply');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME,
    charset: 'utf8mb4',
  });

  const [linhas] = await conn.query<any[]>(
    "SELECT codigoProjeto, userProfissional FROM ProjetoProfissional WHERE coordenador = 's'"
  );
  await conn.end();

  // Um projeto pode (indevidamente) ter mais de um 's'; nesse caso não decidimos
  // por ele — listamos para o cliente resolver no legado.
  const porProjeto = new Map<string, string[]>();
  for (const l of linhas) {
    const cod = String(l.codigoProjeto).trim();
    porProjeto.set(cod, [...(porProjeto.get(cod) ?? []), String(l.userProfissional).trim().toLowerCase()]);
  }
  console.log(`legado: ${linhas.length} marcações de coordenador em ${porProjeto.size} projeto(s)`);

  const usuarios = await prisma.user.findMany({ select: { id: true, name: true, email: true, isActive: true } });
  const porLogin = new Map(usuarios.map((u) => [u.email.split('@')[0].toLowerCase(), u]));

  const projetos = await prisma.project.findMany({ select: { id: true, code: true, coordinatorId: true } });
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]));

  let corretos = 0;
  let corrigidos = 0;
  const ambiguos: string[] = [];
  const semUsuario: string[] = [];
  const mudancas: string[] = [];

  for (const p of projetos) {
    const logins = porProjeto.get(p.code);
    if (!logins || logins.length === 0) continue;
    if (new Set(logins).size > 1) {
      ambiguos.push(`${p.code}: ${logins.join(', ')}`);
      continue;
    }
    const alvo = porLogin.get(logins[0]);
    if (!alvo) {
      semUsuario.push(`${p.code}: login ${logins[0]} sem usuário no sistema`);
      continue;
    }
    if (p.coordinatorId === alvo.id) {
      corretos++;
      continue;
    }
    mudancas.push(
      `${p.code}: ${p.coordinatorId ? nomePorId.get(p.coordinatorId) ?? p.coordinatorId : '(vazio)'} -> ${alvo.name}`
    );
    if (APLICAR) {
      await prisma.project.update({ where: { id: p.id }, data: { coordinatorId: alvo.id } });
    }
    corrigidos++;
  }

  console.log(`\njá corretos: ${corretos}`);
  console.log(`a corrigir:  ${corrigidos}`);
  for (const m of mudancas) console.log(`   ${m}`);
  if (ambiguos.length) {
    console.log(`\nmais de um coordenador marcado no legado (não tocados): ${ambiguos.length}`);
    for (const a of ambiguos) console.log(`   ${a}`);
  }
  if (semUsuario.length) {
    console.log(`\nlogin do legado sem usuário aqui (não tocados): ${semUsuario.length}`);
    for (const s of semUsuario) console.log(`   ${s}`);
  }

  console.log(APLICAR ? '\nAplicado.' : '\nNada foi gravado. Rode com --apply para aplicar.');
}

main()
  .catch((erro) => {
    console.error('Falha:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
