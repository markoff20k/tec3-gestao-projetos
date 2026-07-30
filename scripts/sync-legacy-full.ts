import 'dotenv/config';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { assertNoLocalDumpArgs } from './legacy-source.ts';

interface Step {
  label: string;
  scriptPath: string;
  args?: string[];
}

const require = createRequire(import.meta.url);
const tsxCliPath = path.resolve(
  path.dirname(require.resolve('tsx/package.json')),
  'dist',
  'cli.mjs',
);

function runStep(step: Step): void {
  const cmd = process.execPath;
  const cmdArgs = [tsxCliPath, step.scriptPath, ...(step.args ?? [])];
  console.log(`\n▶ ${step.label}`);
  console.log(`   ${cmd} ${cmdArgs.join(' ')}`);

  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Falha no passo: ${step.label}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  assertNoLocalDumpArgs(args, 'sync-legacy-full');

  const steps: Step[] = [
    {
      label: 'Sincronizar clientes',
      scriptPath: 'scripts/import-legacy-clients-sql.ts',
    },
    {
      label: 'Sincronizar propostas',
      scriptPath: 'scripts/import-legacy-proposals-sql.ts',
    },
    {
      label: 'Pós-carga de propostas (coordenadores, campos legados, aditivos/despesas, valores por categoria)',
      scriptPath: 'scripts/run-legacy-proposals-postload.ts',
    },
    {
      label: 'Sincronizar projetos',
      scriptPath: 'scripts/import-legacy-projects-sql.ts',
    },
    {
      label: 'Vincular coordenadores de projeto',
      scriptPath: 'scripts/link-project-coordinators.ts',
    },
    {
      label: 'Sincronizar horas e orçamento de projeto',
      scriptPath: 'scripts/import-legacy-project-hours-sql.ts',
    },
    {
      label: 'Vincular usuários dos lançamentos de horas',
      scriptPath: 'scripts/link-legacy-time-entry-users.ts',
    },
    {
      label: 'Atualizar nomes completos de usuários legados',
      scriptPath: 'scripts/backfill-legacy-user-full-names.ts',
    },
    {
      label: 'Vincular propostas aos projetos (Proposal.projectId)',
      scriptPath: 'scripts/backfill-proposal-project-links.ts',
    },
    {
      label: 'Vincular valores de orçamento dos projetos',
      scriptPath: 'scripts/link-legacy-project-budget-values.ts',
    },
    {
      label: 'Garantir centro de custo para cada projeto',
      scriptPath: 'scripts/backfill-cost-centers-from-projects.ts',
    },
  ];

  const startedAt = Date.now();
  console.log('Iniciando sincronismo completo com o banco legado...');
  console.log('Origem: banco legado remoto (LEGACY_DB_*).');
  console.log(`Etapas: ${steps.length}`);

  for (const [index, step] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}]`);
    runStep(step);
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nSincronismo completo concluído com sucesso em ${elapsedSeconds}s.`);
}

main().catch((error) => {
  console.error('Falha no sincronismo completo com o legado:', error);
  process.exitCode = 1;
});
