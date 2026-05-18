import 'dotenv/config';
import { prisma } from '../server/db.ts';

type TableRow = {
  schema_name: string;
  table_name: string;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');

  const tables = await prisma.$queryRawUnsafe<TableRow[]>(`
    SELECT
      table_schema AS schema_name,
      table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `);

  if (tables.length === 0) {
    console.log('Nenhuma tabela elegivel foi encontrada para limpeza.');
    return;
  }

  const qualifiedTables = tables.map(
    (table) => `"${table.schema_name}"."${table.table_name}"`,
  );

  console.log('Tabelas que serao limpas:');
  for (const table of qualifiedTables) {
    console.log(`- ${table}`);
  }

  if (dryRun) {
    console.log('Dry-run finalizado sem alterar dados.');
    return;
  }

  if (!confirm) {
    throw new Error('Operacao cancelada. Rode novamente com --confirm para limpar todas as tabelas sem alterar a estrutura.');
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${qualifiedTables.join(', ')} RESTART IDENTITY CASCADE`,
  );

  console.log('Limpeza concluida com sucesso. Estrutura preservada.');
}

main()
  .catch((error) => {
    console.error('Falha ao limpar o banco:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });