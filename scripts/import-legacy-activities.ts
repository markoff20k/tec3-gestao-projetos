import 'dotenv/config';
import mysql from 'mysql2/promise';
import { prisma } from '../server/db.ts';

/**
 * Importa o catálogo de atividades e os vínculos projeto <-> atividade do
 * sistema legado (tabelas `Atividade` e `ProjetoAtividade`).
 *
 * Idempotente: identifica pela coluna legacy_id, então rodar de novo atualiza
 * em vez de duplicar. Use --dry-run para conferir antes de gravar.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const conn = await mysql.createConnection({
    host: process.env.LEGACY_DB_HOST,
    port: Number(process.env.LEGACY_DB_PORT ?? 3306),
    user: process.env.LEGACY_DB_USER,
    password: process.env.LEGACY_DB_PASSWORD,
    database: process.env.LEGACY_DB_NAME,
  });

  const [legacyActivities] = await conn.query<any[]>(
    'SELECT idAtividade, nome, ativo FROM Atividade ORDER BY idAtividade'
  );
  const [legacyLinks] = await conn.query<any[]>(
    'SELECT codigoProjeto, idAtividade FROM ProjetoAtividade'
  );
  await conn.end();

  let criadas = 0;
  let atualizadas = 0;
  const idByLegacy = new Map<number, string>();

  for (const row of legacyActivities) {
    const legacyId = Number(row.idAtividade);
    const name = String(row.nome ?? '').trim();
    const isActive = String(row.ativo ?? '').trim().toLowerCase() === 's';
    // Sigla derivada do id legado: estável e rastreável até a origem.
    const code = `ATV${String(legacyId).padStart(3, '0')}`;

    if (!name) continue;

    const existing = await prisma.activity.findUnique({ where: { legacyId } });

    if (dryRun) {
      existing ? (atualizadas += 1) : (criadas += 1);
      if (existing) idByLegacy.set(legacyId, existing.id);
      continue;
    }

    const saved = existing
      ? await prisma.activity.update({ where: { legacyId }, data: { code, name, isActive } })
      : await prisma.activity.create({ data: { legacyId, code, name, isActive } });

    existing ? (atualizadas += 1) : (criadas += 1);
    idByLegacy.set(legacyId, saved.id);
  }

  // Vínculos: o legado referencia o projeto pelo código.
  const projects = await prisma.project.findMany({ select: { id: true, code: true } });
  const projectIdByCode = new Map(projects.map((p) => [String(p.code).trim().toUpperCase(), p.id]));

  let vinculos = 0;
  let semProjeto = 0;
  let semAtividade = 0;

  for (const link of legacyLinks) {
    const projectId = projectIdByCode.get(String(link.codigoProjeto ?? '').trim().toUpperCase());
    const activityId = idByLegacy.get(Number(link.idAtividade));

    if (!projectId) { semProjeto += 1; continue; }
    if (!activityId) { semAtividade += 1; continue; }

    if (!dryRun) {
      await prisma.projectActivity.upsert({
        where: { projectId_activityId: { projectId, activityId } },
        create: { projectId, activityId },
        update: {},
      });
    }
    vinculos += 1;
  }

  console.log('Importação de atividades do legado');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- atividades na origem: ${legacyActivities.length}`);
  console.log(`- criadas: ${criadas} | atualizadas: ${atualizadas}`);
  console.log(`- vínculos na origem: ${legacyLinks.length}`);
  console.log(`- vínculos aplicados: ${vinculos}`);
  console.log(`- ignorados por projeto inexistente: ${semProjeto}`);
  console.log(`- ignorados por atividade inexistente: ${semAtividade}`);
}

main()
  .catch((error) => {
    console.error('Falha na importação de atividades:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
