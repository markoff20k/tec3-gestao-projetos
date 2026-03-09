import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyProposalRow {
  codigoProposta: string | null;
  codigoPropostaSuper: string | null;
  expectativa: string | null;
  tipoPrincipal: string | null;
  revisao: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parseInteger(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
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

function mapProposalRow(columns: string[], values: ParsedValue[]): LegacyProposalRow {
  const row: Record<string, string | null> = {};

  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = index < values.length ? values[index] : null;
  }

  return {
    codigoProposta: row.codigoProposta ?? null,
    codigoPropostaSuper: row.codigoPropostaSuper ?? null,
    expectativa: row.expectativa ?? null,
    tipoPrincipal: row.tipoPrincipal ?? null,
    revisao: row.revisao ?? null,
  };
}

function extractLegacyProposals(sqlContent: string): LegacyProposalRow[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Proposta`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];
  const rows: LegacyProposalRow[] = [];

  for (const match of inserts) {
    const rawColumns = match[1] ?? '';
    const rawValues = match[2] ?? '';

    const columns = rawColumns
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(rawValues);
    for (const parsed of parsedRows) {
      rows.push(mapProposalRow(columns, parsed));
    }
  }

  return rows;
}

async function resolveProposalId(code: string, revision: number): Promise<string | null> {
  const byExactCodeAndRevision = await prisma.proposal.findFirst({
    where: { code, revision },
    select: { id: true },
  });
  if (byExactCodeAndRevision?.id) return byExactCodeAndRevision.id;

  if (revision > 0) {
    const bySuffixedCode = await prisma.proposal.findFirst({
      where: { code: `${code}-R${revision}`, revision },
      select: { id: true },
    });
    if (bySuffixedCode?.id) return bySuffixedCode.id;
  }

  const byCodeOnly = await prisma.proposal.findFirst({
    where: { code },
    orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return byCodeOnly?.id ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((arg) => !arg.startsWith('--'));

  const resolvedPath = fileArg
    ? path.resolve(fileArg)
    : path.resolve('C:/Users/jefer/Downloads/bdtec3.sql');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  const sqlContent = fs.readFileSync(resolvedPath, 'utf-8');
  const legacyProposals = extractLegacyProposals(sqlContent);
  if (legacyProposals.length === 0) {
    throw new Error('Nenhuma proposta legada encontrada no arquivo informado.');
  }

  let updated = 0;
  let skipped = 0;

  for (const legacy of legacyProposals) {
    const code = normalizeText(legacy.codigoProposta);
    if (!code) {
      skipped++;
      continue;
    }

    const revision = parseInteger(legacy.revisao);
    const proposalId = await resolveProposalId(code, revision);
    if (!proposalId) {
      skipped++;
      continue;
    }

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        expectation: normalizeText(legacy.expectativa),
        mainType: normalizeText(legacy.tipoPrincipal),
        umbrellaRef: normalizeText(legacy.codigoPropostaSuper),
      },
    });

    updated++;
  }

  const [filledExpectation, filledMainType, filledUmbrellaRef] = await Promise.all([
    prisma.proposal.count({ where: { expectation: { not: null } } }),
    prisma.proposal.count({ where: { mainType: { not: null } } }),
    prisma.proposal.count({ where: { umbrellaRef: { not: null } } }),
  ]);

  console.log('Vinculação de campos legados da proposta concluída com sucesso.');
  console.log(`Propostas legadas processadas: ${legacyProposals.length}`);
  console.log(`Propostas atualizadas: ${updated}`);
  console.log(`Propostas ignoradas: ${skipped}`);
  console.log(`Com expectativa preenchida: ${filledExpectation}`);
  console.log(`Com tipo principal preenchido: ${filledMainType}`);
  console.log(`Com proposta original (guarda-chuva) preenchida: ${filledUmbrellaRef}`);
}

main()
  .catch((error) => {
    console.error('Falha ao vincular campos legados de proposta:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
