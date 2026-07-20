import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { assertNoLocalDumpArgs, loadLegacySqlFromTables } from './legacy-source.ts';

type ParsedValue = string | null;

interface LegacyProposalCostRow {
  codigoProposta: string | null;
  revisao: string | null;
  valorMobilizacao: string | null;
  valorDesconto: string | null;
}

interface LegacyCategoryValueRow {
  codigoProposta: string | null;
  idAditivo: string | null;
  valorHora: string | null;
  quantidadeHoras: string | null;
  revisao: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parseInteger(value: string | null): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseLegacyDecimal(value: string | null): number {
  const text = normalizeText(value);
  if (!text) return 0;

  let normalized = text;
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
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

function mapRow(columns: string[], values: ParsedValue[]): Record<string, string | null> {
  const row: Record<string, string | null> = {};
  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = index < values.length ? values[index] : null;
  }
  return row;
}

function extractProposalCosts(sqlContent: string): LegacyProposalCostRow[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Proposta`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];

  const rows: LegacyProposalCostRow[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');

    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      rows.push({
        codigoProposta: row.codigoProposta ?? null,
        revisao: row.revisao ?? null,
        valorMobilizacao: row.valorMobilizacao ?? null,
        valorDesconto: row.valorDesconto ?? null,
      });
    }
  }

  return rows;
}

function extractCategoryValues(sqlContent: string): LegacyCategoryValueRow[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?ValorCategoriaProposta`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];

  const rows: LegacyCategoryValueRow[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');

    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      rows.push({
        codigoProposta: row.codigoProposta ?? null,
        idAditivo: row.idAditivo ?? null,
        valorHora: row.valorHora ?? null,
        quantidadeHoras: row.quantidadeHoras ?? null,
        revisao: row.revisao ?? null,
      });
    }
  }

  return rows;
}

function key(code: string, revision: number): string {
  return `${code}::${revision}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  assertNoLocalDumpArgs(args, 'link-legacy-project-budget-values');

  const sqlContent = await loadLegacySqlFromTables(['Proposta', 'ValorCategoriaProposta']);
  const proposalCostRows = extractProposalCosts(sqlContent);
  const categoryValueRows = extractCategoryValues(sqlContent);

  const laborByProposalRevision = new Map<string, number>();
  for (const row of categoryValueRows) {
    if (normalizeText(row.idAditivo)) continue;

    const code = normalizeText(row.codigoProposta);
    if (!code) continue;

    const revision = parseInteger(row.revisao);
    const hourly = parseLegacyDecimal(row.valorHora);
    const hours = parseLegacyDecimal(row.quantidadeHoras);
    const total = hourly * hours;

    const k = key(code, revision);
    laborByProposalRevision.set(k, (laborByProposalRevision.get(k) || 0) + total);
  }

  const adjustmentByProposalRevision = new Map<string, { mobilization: number; discount: number }>();
  for (const row of proposalCostRows) {
    const code = normalizeText(row.codigoProposta);
    if (!code) continue;

    const revision = parseInteger(row.revisao);
    const k = key(code, revision);
    adjustmentByProposalRevision.set(k, {
      mobilization: parseLegacyDecimal(row.valorMobilizacao),
      discount: parseLegacyDecimal(row.valorDesconto),
    });
  }

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      code: true,
      legacyProposalCode: true,
      legacyRevision: true,
      budgetValue: true,
    },
  });

  let updated = 0;
  let skippedNoLegacyCode = 0;
  let skippedNoLegacyValue = 0;

  for (const project of projects) {
    const proposalCode = normalizeText(project.legacyProposalCode);
    if (!proposalCode) {
      skippedNoLegacyCode++;
      continue;
    }

    const revision = Number.isFinite(project.legacyRevision as number)
      ? Number(project.legacyRevision)
      : 0;

    const k = key(proposalCode, revision);
    const labor = laborByProposalRevision.get(k) ?? 0;
    const adjustments = adjustmentByProposalRevision.get(k) ?? { mobilization: 0, discount: 0 };

    const computed = Math.max(0, labor + adjustments.mobilization - adjustments.discount);
    const rounded = Number(computed.toFixed(2));

    if (rounded <= 0) {
      skippedNoLegacyValue++;
      continue;
    }

    if (!dryRun) {
      await prisma.project.update({
        where: { id: project.id },
        data: { budgetValue: rounded },
      });
    }

    updated++;
  }

  const projectsValueGtZero = await prisma.project.count({ where: { budgetValue: { gt: 0 } } });

  console.log('Resumo backfill de budgetValue dos projetos:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- updated: ${updated}`);
  console.log(`- skippedNoLegacyCode: ${skippedNoLegacyCode}`);
  console.log(`- skippedNoLegacyValue: ${skippedNoLegacyValue}`);
  console.log(`- projectsValueGtZero: ${projectsValueGtZero}`);
}

main()
  .catch((error) => {
    console.error('Falha ao atualizar budgetValue de projetos pelo legado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
