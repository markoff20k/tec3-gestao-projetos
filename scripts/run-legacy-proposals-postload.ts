import 'dotenv/config';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Step {
  label: string;
  scriptPath: string;
  args?: string[];
}

function runStep(step: Step): void {
  const cmdArgs = ['tsx', step.scriptPath, ...(step.args ?? [])];
  console.log(`\n▶ ${step.label}`);
  console.log(`   npx ${cmdArgs.join(' ')}`);

  const result = spawnSync('npx', cmdArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Falha no passo: ${step.label}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--'));

  const resolvedPath = fileArg
    ? path.resolve(fileArg)
    : path.resolve('C:/Users/jefer/Downloads/bdtec3.sql');

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
      args: [resolvedPath],
    },
    {
      label: 'Vincular campos legados restantes (dueDate/termMonths/etc.)',
      scriptPath: 'scripts/link-legacy-proposal-remaining-fields.ts',
      args: [resolvedPath],
    },
    {
      label: 'Importar aditivos/despesas legados',
      scriptPath: 'scripts/import-legacy-proposal-extras-sql.ts',
      args: [resolvedPath, '--replace-all'],
    },
    {
      label: 'Importar valores por categoria legados',
      scriptPath: 'scripts/import-legacy-proposal-category-values-sql.ts',
      args: [resolvedPath, '--replace-all'],
    },
  ];

  console.log('Iniciando fluxo pós-carga legado de propostas...');
  console.log(`Arquivo legado: ${resolvedPath}`);

  for (const step of steps) {
    runStep(step);
  }

  console.log('\nFluxo pós-carga legado concluído com sucesso.');
}

main().catch((error) => {
  console.error('Falha no fluxo pós-carga legado de propostas:', error);
  process.exitCode = 1;
});
