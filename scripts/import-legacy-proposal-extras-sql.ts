import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyAdditiveRow {
  idAditivo: string | null;
  codigoProposta: string | null;
  dataCadastro: string | null;
  prazoEmMeses: string | null;
  valorSubcontratacao: string | null;
  valorMobilizacao: string | null;
  valorReajuste: string | null;
  revisao: string | null;
}

interface LegacyExpenseRow {
  idDespesa: string | null;
  codigoProposta: string | null;
  idAditivo: string | null;
  descricao: string | null;
  reembolsavel: string | null;
  valor: string | null;
  revisao: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parseNumber(value: string | null): number {
  if (value === null) return 0;
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number.parseInt(value.trim(), 10);
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

function mapAdditiveRow(columns: string[], values: ParsedValue[]): LegacyAdditiveRow {
  const row: Record<string, string | null> = {};
  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = index < values.length ? values[index] : null;
  }

  return {
    idAditivo: row.idAditivo ?? null,
    codigoProposta: row.codigoProposta ?? null,
    dataCadastro: row.dataCadastro ?? null,
    prazoEmMeses: row.prazoEmMeses ?? null,
    valorSubcontratacao: row.valorSubcontratacao ?? null,
    valorMobilizacao: row.valorMobilizacao ?? null,
    valorReajuste: row.valorReajuste ?? null,
    revisao: row.revisao ?? null,
  };
}

function mapExpenseRow(columns: string[], values: ParsedValue[]): LegacyExpenseRow {
  const row: Record<string, string | null> = {};
  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = index < values.length ? values[index] : null;
  }

  return {
    idDespesa: row.idDespesa ?? null,
    codigoProposta: row.codigoProposta ?? null,
    idAditivo: row.idAditivo ?? null,
    descricao: row.descricao ?? null,
    reembolsavel: row.reembolsavel ?? null,
    valor: row.valor ?? null,
    revisao: row.revisao ?? null,
  };
}

function extractLegacyAdditives(sqlContent: string): LegacyAdditiveRow[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Aditivo`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];
  const rows: LegacyAdditiveRow[] = [];

  for (const match of inserts) {
    const rawColumns = match[1] ?? '';
    const rawValues = match[2] ?? '';
    const columns = rawColumns
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(rawValues);
    for (const parsed of parsedRows) {
      rows.push(mapAdditiveRow(columns, parsed));
    }
  }

  return rows;
}

function extractLegacyExpenses(sqlContent: string): LegacyExpenseRow[] {
  const inserts = [
    ...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Despesa`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi),
  ];
  const rows: LegacyExpenseRow[] = [];

  for (const match of inserts) {
    const rawColumns = match[1] ?? '';
    const rawValues = match[2] ?? '';
    const columns = rawColumns
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(rawValues);
    for (const parsed of parsedRows) {
      rows.push(mapExpenseRow(columns, parsed));
    }
  }

  return rows;
}

async function resolveProposalId(code: string, revision: number): Promise<string | null> {
  const baseCode = normalizeProposalCode(code);

  const byExactCodeAndRevision = await prisma.proposal.findFirst({
    where: { code: baseCode, revision },
    select: { id: true },
  });
  if (byExactCodeAndRevision?.id) return byExactCodeAndRevision.id;

  if (revision > 0) {
    const bySuffixedCode = await prisma.proposal.findFirst({
      where: { code: `${baseCode}-R${revision}`, revision },
      select: { id: true },
    });
    if (bySuffixedCode?.id) return bySuffixedCode.id;
  }

  const byCodeOnly = await prisma.proposal.findFirst({
    where: { code: baseCode },
    orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return byCodeOnly?.id ?? null;
}

async function recomputeProposalTotals() {
  const allProposals = await prisma.proposal.findMany({
    select: { id: true },
  });

  for (const proposal of allProposals) {
    const [additiveAgg, expenseAgg] = await Promise.all([
      prisma.proposalAdditive.aggregate({
        where: { proposalId: proposal.id },
        _sum: {
          subcontractValue: true,
          mobilizationValue: true,
          readjustValue: true,
        },
      }),
      prisma.proposalExpense.aggregate({
        where: { proposalId: proposal.id },
        _sum: { value: true },
      }),
    ]);

    const additiveTotal =
      Number(additiveAgg._sum.subcontractValue ?? 0) +
      Number(additiveAgg._sum.mobilizationValue ?? 0) +
      Number(additiveAgg._sum.readjustValue ?? 0);

    const expenseTotal = Number(expenseAgg._sum.value ?? 0);

    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        additiveValue: additiveTotal,
        expense: expenseTotal,
      },
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const replaceAll = args.includes('--replace-all');
  const diagnoseSkips = args.includes('--diagnose-skips');
  const fileArg = args.find((arg) => !arg.startsWith('--'));

  const resolvedPath = fileArg
    ? path.resolve(fileArg)
    : path.resolve('C:/Users/jefer/Downloads/bdtec3.sql');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Arquivo não encontrado: ${resolvedPath}`);
  }

  const sqlContent = fs.readFileSync(resolvedPath, 'utf-8');
  const legacyAdditives = extractLegacyAdditives(sqlContent);
  const legacyExpenses = extractLegacyExpenses(sqlContent);

  console.log(`Aditivos legados encontrados: ${legacyAdditives.length}`);
  console.log(`Despesas legadas encontradas: ${legacyExpenses.length}`);

  if (replaceAll) {
    console.log('Modo replace-all ativado: limpando proposal_additives e proposal_expenses...');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "proposal_additives", "proposal_expenses" RESTART IDENTITY CASCADE');
    console.log('Tabelas de extras limpas com sucesso.');
  }

  let additivesCreated = 0;
  let additivesSkipped = 0;
  let additivesSkippedNoCode = 0;
  let additivesSkippedNoProposal = 0;
  const additiveSkipSamples: string[] = [];

  for (const additive of legacyAdditives) {
    const code = normalizeText(additive.codigoProposta);
    if (!code) {
      additivesSkipped++;
      additivesSkippedNoCode++;
      if (diagnoseSkips && additiveSkipSamples.length < 20) {
        additiveSkipSamples.push(`sem-codigo idAditivo=${normalizeText(additive.idAditivo) ?? 'null'} revisao=${normalizeText(additive.revisao) ?? 'null'}`);
      }
      continue;
    }

    const revision = parseRevision(code, additive.revisao);
    const proposalId = await resolveProposalId(code, revision);
    if (!proposalId) {
      additivesSkipped++;
      additivesSkippedNoProposal++;
      if (diagnoseSkips && additiveSkipSamples.length < 20) {
        additiveSkipSamples.push(`sem-proposta codigo=${code} revisao=${revision} idAditivo=${normalizeText(additive.idAditivo) ?? 'null'}`);
      }
      continue;
    }

    await prisma.proposalAdditive.create({
      data: {
        proposalId,
        termMonths: parseInteger(additive.prazoEmMeses),
        subcontractValue: parseNumber(additive.valorSubcontratacao),
        mobilizationValue: parseNumber(additive.valorMobilizacao),
        readjustValue: parseNumber(additive.valorReajuste),
      },
    });

    additivesCreated++;
  }

  let expensesCreated = 0;
  let expensesSkipped = 0;
  let expensesSkippedNoCode = 0;
  let expensesSkippedNoProposal = 0;
  const expenseSkipSamples: string[] = [];

  for (const expense of legacyExpenses) {
    const code = normalizeText(expense.codigoProposta);
    if (!code) {
      expensesSkipped++;
      expensesSkippedNoCode++;
      if (diagnoseSkips && expenseSkipSamples.length < 20) {
        expenseSkipSamples.push(`sem-codigo idDespesa=${normalizeText(expense.idDespesa) ?? 'null'} revisao=${normalizeText(expense.revisao) ?? 'null'} idAditivo=${normalizeText(expense.idAditivo) ?? 'null'}`);
      }
      continue;
    }

    const revision = parseRevision(code, expense.revisao);
    const proposalId = await resolveProposalId(code, revision);
    if (!proposalId) {
      expensesSkipped++;
      expensesSkippedNoProposal++;
      if (diagnoseSkips && expenseSkipSamples.length < 20) {
        expenseSkipSamples.push(`sem-proposta codigo=${code} revisao=${revision} idDespesa=${normalizeText(expense.idDespesa) ?? 'null'} idAditivo=${normalizeText(expense.idAditivo) ?? 'null'}`);
      }
      continue;
    }

    await prisma.proposalExpense.create({
      data: {
        proposalId,
        description: normalizeText(expense.descricao) ?? 'Despesa legada',
        reimbursable: (normalizeText(expense.reembolsavel) ?? '').toLowerCase() === 's',
        value: parseNumber(expense.valor),
      },
    });

    expensesCreated++;
  }

  await recomputeProposalTotals();

  const [additivesRows, expensesRows] = await Promise.all([
    prisma.proposalAdditive.count(),
    prisma.proposalExpense.count(),
  ]);

  console.log('Importação de extras concluída com sucesso.');
  console.log(`Aditivos criados: ${additivesCreated}`);
  console.log(`Aditivos ignorados: ${additivesSkipped}`);
  console.log(`Aditivos ignorados sem codigo: ${additivesSkippedNoCode}`);
  console.log(`Aditivos ignorados sem proposta: ${additivesSkippedNoProposal}`);
  console.log(`Despesas criadas: ${expensesCreated}`);
  console.log(`Despesas ignoradas: ${expensesSkipped}`);
  console.log(`Despesas ignoradas sem codigo: ${expensesSkippedNoCode}`);
  console.log(`Despesas ignoradas sem proposta: ${expensesSkippedNoProposal}`);
  console.log(`Total proposal_additives: ${additivesRows}`);
  console.log(`Total proposal_expenses: ${expensesRows}`);

  if (diagnoseSkips) {
    console.log('Amostras de aditivos ignorados:');
    for (const sample of additiveSkipSamples) {
      console.log(`- ${sample}`);
    }

    console.log('Amostras de despesas ignoradas:');
    for (const sample of expenseSkipSamples) {
      console.log(`- ${sample}`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Falha na importação de aditivos/despesas legados:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
