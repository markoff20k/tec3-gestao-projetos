import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyCategory {
  idCategoria: string | null;
  nome: string | null;
}

interface LegacyCategoryValue {
  idCategoria: string | null;
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

function normalizeName(value: string | null): string {
  const text = normalizeText(value) ?? '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseInteger(value: string | null): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDecimal(value: string | null): number {
  const text = normalizeText(value);
  if (!text) return 0;
  const cleaned = text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRevision(code: string, revisionRaw: string | null): number {
  const parsed = parseInteger(revisionRaw);
  if (parsed > 0) return parsed;

  const match = code.match(/-R(\d+)$/i);
  if (!match) return 0;
  const fromCode = Number.parseInt(match[1], 10);
  return Number.isFinite(fromCode) ? fromCode : 0;
}

function normalizeProposalCode(code: string): string {
  return code.trim().replace(/-R\d+$/i, '');
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

function extractCategories(sqlContent: string): LegacyCategory[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Categoria`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];
  const rows: LegacyCategory[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');
    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      rows.push({
        idCategoria: row.idCategoria ?? null,
        nome: row.nome ?? null,
      });
    }
  }

  return rows;
}

function extractCategoryValues(sqlContent: string): LegacyCategoryValue[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?ValorCategoriaProposta`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];
  const rows: LegacyCategoryValue[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');
    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      rows.push({
        idCategoria: row.idCategoria ?? null,
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

async function resolveProposalId(code: string, revision: number): Promise<string | null> {
  const baseCode = normalizeProposalCode(code);

  const byExact = await prisma.proposal.findFirst({
    where: { code: baseCode, revision },
    select: { id: true },
  });
  if (byExact?.id) return byExact.id;

  if (revision > 0) {
    const bySuffixed = await prisma.proposal.findFirst({
      where: { code: `${baseCode}-R${revision}`, revision },
      select: { id: true },
    });
    if (bySuffixed?.id) return bySuffixed.id;
  }

  const byCodeOnly = await prisma.proposal.findFirst({
    where: { code: baseCode },
    orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return byCodeOnly?.id ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const replaceAll = args.includes('--replace-all');

  const resolvedPath = fileArg
    ? path.resolve(fileArg)
    : path.resolve('C:/Users/jefer/Downloads/bdtec3.sql');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  const sqlContent = fs.readFileSync(resolvedPath, 'utf-8');
  const legacyCategories = extractCategories(sqlContent);
  const legacyValues = extractCategoryValues(sqlContent);

  if (legacyCategories.length === 0) {
    throw new Error('Nenhuma categoria legada encontrada no arquivo informado.');
  }
  if (legacyValues.length === 0) {
    throw new Error('Nenhum valor de categoria legado encontrado no arquivo informado.');
  }

  const categoryNameByLegacyId = new Map<number, string>();
  for (const cat of legacyCategories) {
    const id = parseInteger(cat.idCategoria);
    if (!id) continue;
    const name = normalizeText(cat.nome);
    if (!name) continue;
    categoryNameByLegacyId.set(id, name);
  }

  const existingCategories = await prisma.proposalCategory.findMany({
    select: { id: true, name: true },
  });
  const categoryIdByNormalizedName = new Map<string, string>();
  for (const cat of existingCategories) {
    const norm = normalizeName(cat.name);
    if (!norm) continue;
    categoryIdByNormalizedName.set(norm, cat.id);
  }

  const valuesToImport: Array<{
    proposalId: string;
    categoryId: string | null;
    customName: string | null;
    value: number;
    hours: number;
  }> = [];

  let skippedNoCode = 0;
  let skippedNoProposal = 0;
  let skippedFromAdditive = 0;
  let linkedWithCategoryId = 0;
  let linkedWithCustomName = 0;

  for (const item of legacyValues) {
    if (normalizeText(item.idAditivo)) {
      skippedFromAdditive++;
      continue;
    }

    const code = normalizeText(item.codigoProposta);
    if (!code) {
      skippedNoCode++;
      continue;
    }

    const revision = parseRevision(code, item.revisao);
    const proposalId = await resolveProposalId(code, revision);
    if (!proposalId) {
      skippedNoProposal++;
      continue;
    }

    const legacyCategoryId = parseInteger(item.idCategoria);
    const legacyCategoryName = legacyCategoryId > 0
      ? normalizeText(categoryNameByLegacyId.get(legacyCategoryId) ?? null)
      : null;

    const categoryId = legacyCategoryName
      ? (categoryIdByNormalizedName.get(normalizeName(legacyCategoryName)) ?? null)
      : null;

    const value = parseDecimal(item.valorHora);
    const hours = parseInteger(item.quantidadeHoras);

    if (categoryId) {
      linkedWithCategoryId++;
    } else if (legacyCategoryName) {
      linkedWithCustomName++;
    }

    valuesToImport.push({
      proposalId,
      categoryId,
      customName: categoryId ? null : (legacyCategoryName ?? null),
      value,
      hours,
    });
  }

  if (dryRun) {
    console.log('DRY-RUN concluído (nenhuma alteração persistida).');
    console.log(`Categorias legadas processadas: ${legacyCategories.length}`);
    console.log(`Registros legados de valores por categoria: ${legacyValues.length}`);
    console.log(`Registros prontos para import: ${valuesToImport.length}`);
    console.log(`Registros ignorados (idAditivo != NULL): ${skippedFromAdditive}`);
    console.log(`Registros ignorados (sem código): ${skippedNoCode}`);
    console.log(`Registros ignorados (proposta não encontrada): ${skippedNoProposal}`);
    console.log(`Com categoryId mapeado: ${linkedWithCategoryId}`);
    console.log(`Com customName (sem categoryId): ${linkedWithCustomName}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (replaceAll) {
      await tx.proposalCategoryValue.deleteMany({});
    }

    const chunkSize = 1000;
    for (let index = 0; index < valuesToImport.length; index += chunkSize) {
      const chunk = valuesToImport.slice(index, index + chunkSize);
      if (chunk.length === 0) continue;

      await tx.proposalCategoryValue.createMany({
        data: chunk.map((row) => ({
          proposalId: row.proposalId,
          categoryId: row.categoryId,
          customName: row.customName,
          value: row.value as any,
          hours: row.hours,
        })),
      });
    }
  });

  const [totalImported, proposalsWithCategoryValues] = await Promise.all([
    prisma.proposalCategoryValue.count(),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(`
      SELECT COUNT(DISTINCT proposal_id)::int AS total
      FROM "proposal_category_values"
    `),
  ]);

  console.log('Importação de valores por categoria concluída com sucesso.');
  console.log(`Categorias legadas processadas: ${legacyCategories.length}`);
  console.log(`Registros legados de valores por categoria: ${legacyValues.length}`);
  console.log(`Registros importados nesta execução: ${valuesToImport.length}`);
  console.log(`Registros ignorados (idAditivo != NULL): ${skippedFromAdditive}`);
  console.log(`Registros ignorados (sem código): ${skippedNoCode}`);
  console.log(`Registros ignorados (proposta não encontrada): ${skippedNoProposal}`);
  console.log(`Com categoryId mapeado: ${linkedWithCategoryId}`);
  console.log(`Com customName (sem categoryId): ${linkedWithCustomName}`);
  console.log(`Total de registros em proposal_category_values: ${totalImported}`);
  console.log(`Propostas com valores por categoria: ${proposalsWithCategoryValues[0]?.total ?? 0}`);
}

main()
  .catch((error) => {
    console.error('Falha ao importar valores por categoria do legado:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
