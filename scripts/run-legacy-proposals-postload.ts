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
  assertNoLocalDumpArgs(args, 'run-legacy-proposals-postload');

  const steps: Step[] = [
    {
      label: 'Normalizar códigos de revisão (remover sufixo -R do code)',
      scriptPath: 'scripts/normalize-proposal-revision-codes.ts',
    },
    {
      label: 'Vincular coordenadores (coordinatorId)',
      scriptPath: 'scripts/link-proposal-coordinators.ts',
    },
    {
      label: 'Vincular campos legados principais (expectation/mainType/umbrellaRef)',
      scriptPath: 'scripts/link-legacy-proposal-fields.ts',
    },
    {
      label: 'Vincular campos legados restantes (dueDate/termMonths/etc.)',
      scriptPath: 'scripts/link-legacy-proposal-remaining-fields.ts',
    },
    {
      label: 'Importar aditivos/despesas legados',
      scriptPath: 'scripts/import-legacy-proposal-extras-sql.ts',
      args: ['--replace-all'],
    },
    {
      label: 'Importar valores por categoria legados',
      scriptPath: 'scripts/import-legacy-proposal-category-values-sql.ts',
      args: ['--replace-all'],
    },
  ];

  console.log('Iniciando fluxo pós-carga legado de propostas...');
  console.log('Origem: banco legado remoto (LEGACY_DB_*).');

  for (const step of steps) {
    runStep(step);
  }

  console.log('\nFluxo pós-carga legado concluído com sucesso.');
}

main().catch((error) => {
  console.error('Falha no fluxo pós-carga legado de propostas:', error);
  process.exitCode = 1;
});
