import 'dotenv/config';
import { prisma } from '../server/db.ts';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const [suffixedRows, collisionRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(*)::int AS total
      FROM "proposals"
      WHERE code ~ '-R[0-9]+$'
    `),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      WITH candidates AS (
        SELECT id, code, revision, regexp_replace(code, '-R[0-9]+$', '') AS target_code
        FROM "proposals"
        WHERE code ~ '-R[0-9]+$'
      )
      SELECT COUNT(*)::int AS total
      FROM candidates c
      JOIN "proposals" p
        ON p.code = c.target_code
       AND p.revision = c.revision
       AND p.id <> c.id
    `),
  ]);

  const suffixed = suffixedRows[0]?.total ?? 0;
  const collisions = collisionRows[0]?.total ?? 0;

  console.log(`Códigos com sufixo de revisão encontrados: ${suffixed}`);
  console.log(`Colisões potenciais detectadas: ${collisions}`);

  if (collisions > 0) {
    throw new Error('Abortado: existem colisões de (code, revision) após normalização.');
  }

  if (dryRun) {
    console.log('DRY-RUN concluído (nenhuma alteração persistida).');
    return;
  }

  if (suffixed === 0) {
    console.log('Nada para normalizar.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      UPDATE "proposals"
      SET code = regexp_replace(code, '-R[0-9]+$', '')
      WHERE code ~ '-R[0-9]+$'
    `);
  });

  const remainingRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`
    SELECT COUNT(*)::int AS total
    FROM "proposals"
    WHERE code ~ '-R[0-9]+$'
  `);
  const remaining = remainingRows[0]?.total ?? 0;

  console.log('Normalização concluída com sucesso.');
  console.log(`Códigos ainda com sufixo: ${remaining}`);
}

main()
  .catch((error) => {
    console.error('Falha ao normalizar códigos de revisão:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
