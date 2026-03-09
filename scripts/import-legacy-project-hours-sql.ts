import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyExpectedHoursRow {
  codigoProjeto: string | null;
  quantidadeHorasDiariasPrevistas: string | null;
}

interface LegacyTimeEntryRow {
  codigoProjeto: string | null;
  idAtividade: string | null;
  userProfissionalResponsavelLancamento: string | null;
  userCoordenadorResponsavelAprovacao: string | null;
  dataExecucao: string | null;
  quantidadeHoras: string | null;
  horasAprovadas: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parseNumber(value: string | null): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const normalized = text.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSqlStringToken(token: string): ParsedValue {
  const trimmed = token.trim();
  if (/^null$/i.test(trimmed)) return null;

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    const content = trimmed.slice(1, -1);
    return content
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/''/g, "'");
  }

  return trimmed;
}

function splitTupleValues(tupleContent: string): ParsedValue[] {
  const values: ParsedValue[] = [];
  let current = '';
  let inString = false;

  for (let index = 0; index < tupleContent.length; index++) {
    const char = tupleContent[index];
    const prev = index > 0 ? tupleContent[index - 1] : '';

    if (char === "'" && prev !== '\\') {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString && char === ',') {
      values.push(parseSqlStringToken(current));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    values.push(parseSqlStringToken(current));
  }

  return values;
}

function parseValuesSection(valuesSection: string): ParsedValue[][] {
  const rows: ParsedValue[][] = [];
  let inString = false;
  let capturing = false;
  let buffer = '';

  for (let index = 0; index < valuesSection.length; index++) {
    const char = valuesSection[index];
    const prev = index > 0 ? valuesSection[index - 1] : '';

    if (char === "'" && prev !== '\\') {
      inString = !inString;
    }

    if (!inString && char === '(') {
      capturing = true;
      buffer = '';
      continue;
    }

    if (!inString && char === ')' && capturing) {
      rows.push(splitTupleValues(buffer));
      capturing = false;
      buffer = '';
      continue;
    }

    if (capturing) {
      buffer += char;
    }
  }

  return rows;
}

function extractRows(sqlContent: string, tableName: string): { columns: string[]; values: ParsedValue[] }[] {
  const inserts = [
    ...sqlContent.matchAll(
      new RegExp(String.raw`\bN?INSERT\s+INTO\s+` + '`?' + tableName + '`?' + String.raw`\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);`, 'gi')
    ),
  ];

  const rows: { columns: string[]; values: ParsedValue[] }[] = [];

  for (const match of inserts) {
    const rawColumns = match[1] ?? '';
    const rawValues = match[2] ?? '';

    const columns = rawColumns
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(rawValues);
    for (const parsed of parsedRows) {
      rows.push({ columns, values: parsed });
    }
  }

  return rows;
}

function mapExpectedHoursRows(sqlContent: string): LegacyExpectedHoursRow[] {
  const rows = extractRows(sqlContent, 'HorasPrevistas');
  return rows.map(({ columns, values }) => {
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = i < values.length ? values[i] : null;

    return {
      codigoProjeto: row.codigoProjeto ?? null,
      quantidadeHorasDiariasPrevistas: row.quantidadeHorasDiariasPrevistas ?? null,
    };
  });
}

function mapTimeEntryRows(sqlContent: string): LegacyTimeEntryRow[] {
  const rows = extractRows(sqlContent, 'LancamentoHoras');
  return rows.map(({ columns, values }) => {
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = i < values.length ? values[i] : null;

    return {
      codigoProjeto: row.codigoProjeto ?? null,
      idAtividade: row.idAtividade ?? null,
      userProfissionalResponsavelLancamento: row.userProfissionalResponsavelLancamento ?? null,
      userCoordenadorResponsavelAprovacao: row.userCoordenadorResponsavelAprovacao ?? null,
      dataExecucao: row.dataExecucao ?? null,
      quantidadeHoras: row.quantidadeHoras ?? null,
      horasAprovadas: row.horasAprovadas ?? null,
    };
  });
}

function parseLegacyDate(value: string | null): Date | null {
  const text = normalizeText(value);
  if (!text || text === '0000-00-00') return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const replaceAll = args.includes('--replace-all');
  const fileArg = args.find((arg) => !arg.startsWith('--'));

  const resolvedPath = fileArg
    ? path.resolve(fileArg)
    : path.resolve('C:/Users/jefer/Downloads/bdtec3.sql');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  const sqlContent = fs.readFileSync(resolvedPath, 'utf-8');
  const expectedHoursRows = mapExpectedHoursRows(sqlContent);
  const timeEntryRows = mapTimeEntryRows(sqlContent);

  if (expectedHoursRows.length === 0 && timeEntryRows.length === 0) {
    throw new Error('Nenhum dado de horas legado encontrado (HorasPrevistas/LancamentoHoras).');
  }

  const projects = await prisma.project.findMany({ select: { id: true, code: true } });
  const projectMap = new Map(projects.map((project) => [project.code, project.id]));

  const budgetByCode = new Map<string, number>();
  for (const row of expectedHoursRows) {
    const code = normalizeText(row.codigoProjeto);
    if (!code || !projectMap.has(code)) continue;

    const qty = parseNumber(row.quantidadeHorasDiariasPrevistas);
    budgetByCode.set(code, (budgetByCode.get(code) || 0) + qty);
  }

  let updatedBudget = 0;
  let skippedBudgetMissingProject = 0;

  for (const [code, budget] of budgetByCode.entries()) {
    const projectId = projectMap.get(code);
    if (!projectId) {
      skippedBudgetMissingProject++;
      continue;
    }

    if (!dryRun) {
      await prisma.project.update({
        where: { id: projectId },
        data: { budgetHours: Math.max(0, Math.round(budget)) },
      });
    }

    updatedBudget++;
  }

  if (!dryRun && replaceAll) {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "time_entries" RESTART IDENTITY CASCADE');
  }

  const createRows: Array<{
    projectId: string;
    collaboratorId: string;
    entryDate: Date;
    hours: number;
    description: string;
    status: string;
    approvedById: string | null;
    approvedAt: Date | null;
  }> = [];

  let skippedEntryMissingProject = 0;
  let skippedEntryMissingRequired = 0;
  let skippedEntryOutOfRange = 0;

  for (const row of timeEntryRows) {
    const code = normalizeText(row.codigoProjeto);
    const collaborator = normalizeText(row.userProfissionalResponsavelLancamento);
    const entryDate = parseLegacyDate(row.dataExecucao);
    const hours = parseNumber(row.quantidadeHoras);

    if (!code || !collaborator || !entryDate || hours <= 0) {
      skippedEntryMissingRequired++;
      continue;
    }

    if (hours > 24) {
      skippedEntryOutOfRange++;
      continue;
    }

    const projectId = projectMap.get(code);
    if (!projectId) {
      skippedEntryMissingProject++;
      continue;
    }

    const approved = (normalizeText(row.horasAprovadas) ?? '').toLowerCase() === 's';
    const approvedById = normalizeText(row.userCoordenadorResponsavelAprovacao);

    createRows.push({
      projectId,
      collaboratorId: collaborator,
      entryDate,
      hours,
      description: `Importado do legado (atividade ${normalizeText(row.idAtividade) ?? '-'})`,
      status: approved ? 'approved' : 'pending',
      approvedById: approved ? approvedById : null,
      approvedAt: approved ? entryDate : null,
    });
  }

  let insertedEntries = 0;

  if (!dryRun) {
    const chunkSize = 1000;
    for (let index = 0; index < createRows.length; index += chunkSize) {
      const chunk = createRows.slice(index, index + chunkSize);
      await prisma.timeEntry.createMany({ data: chunk });
      insertedEntries += chunk.length;
    }
  } else {
    insertedEntries = createRows.length;
  }

  console.log('Resumo importação de horas de projeto:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- projetosComBudgetAtualizado: ${updatedBudget}`);
  console.log(`- budgetRowsBrutas: ${expectedHoursRows.length}`);
  console.log(`- timeRowsBrutas: ${timeEntryRows.length}`);
  console.log(`- lancamentosInseridos: ${insertedEntries}`);
  console.log(`- skippedBudgetMissingProject: ${skippedBudgetMissingProject}`);
  console.log(`- skippedEntryMissingProject: ${skippedEntryMissingProject}`);
  console.log(`- skippedEntryMissingRequired: ${skippedEntryMissingRequired}`);
  console.log(`- skippedEntryOutOfRange: ${skippedEntryOutOfRange}`);
}

main()
  .catch((error) => {
    console.error('Falha ao importar horas legadas de projeto:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
