import 'dotenv/config';
import { prisma } from '../server/db.ts';

/**
 * Preenche time_entries.activity_id nos lançamentos importados do legado.
 *
 * O importador de horas gravou o id da atividade de origem dentro da descrição
 * ("Importado do legado (atividade 7)"), que era o único lugar disponível na
 * época. Agora que o catálogo existe, a referência vira vínculo de verdade.
 *
 * Idempotente: só toca em lançamento que ainda está sem atividade.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const activities = await prisma.activity.findMany({
    where: { legacyId: { not: null } },
    select: { id: true, legacyId: true },
  });
  const idByLegacy = new Map(activities.map((a) => [a.legacyId as number, a.id]));

  const grupos = await prisma.$queryRaw<Array<{ legacy: string; qtd: bigint }>>`
    SELECT substring(description from 'atividade ([0-9]+)') AS legacy, COUNT(*)::bigint AS qtd
    FROM time_entries
    WHERE activity_id IS NULL
      AND description LIKE 'Importado do legado (atividade%'
    GROUP BY 1
  `;

  let atualizados = 0;
  let semCorrespondencia = 0;

  for (const grupo of grupos) {
    const legacyId = Number(grupo.legacy);
    const activityId = idByLegacy.get(legacyId);

    if (!activityId) {
      semCorrespondencia += Number(grupo.qtd);
      continue;
    }

    if (!dryRun) {
      const result = await prisma.timeEntry.updateMany({
        where: {
          activityId: null,
          description: { startsWith: `Importado do legado (atividade ${legacyId})` },
        },
        data: { activityId },
      });
      atualizados += result.count;
    } else {
      atualizados += Number(grupo.qtd);
    }
  }

  const restantes = await prisma.timeEntry.count({ where: { activityId: null } });

  console.log('Backfill de atividade nos lançamentos de horas');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- grupos de atividade encontrados: ${grupos.length}`);
  console.log(`- lançamentos vinculados: ${atualizados}`);
  console.log(`- sem correspondência no catálogo: ${semCorrespondencia}`);
  console.log(`- ainda sem atividade: ${restantes}`);
}

main()
  .catch((error) => {
    console.error('Falha no backfill de atividades:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
