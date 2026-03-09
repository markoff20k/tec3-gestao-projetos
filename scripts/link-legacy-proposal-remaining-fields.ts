import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyProposalRow {
  codigoProposta: string | null;
  revisao: string | null;
  dataValidade: string | null;
  prazoEmMeses: string | null;
  valorMobilizacao: string | null;
  avaliacaoRisco: string | null;
  valorDesconto: string | null;
  codigoPropostaAntigo: string | null;
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

function parseRevision(code: string, revisionRaw: string | null): number {
  const parsed = parseInteger(revisionRaw);
  if (parsed > 0) return parsed;

  const match = code.match(/-R(\d+)$/i);
  if (!match) return 0;
  const fromCode = Number.parseInt(match[1], 10);
  return Number.isFinite(fromCode) ? fromCode : 0;
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
    revisao: row.revisao ?? null,
    dataValidade: row.dataValidade ?? null,
    prazoEmMeses: row.prazoEmMeses ?? null,
    valorMobilizacao: row.valorMobilizacao ?? null,
    avaliacaoRisco: row.avaliacaoRisco ?? null,
    valorDesconto: row.valorDesconto ?? null,
    codigoPropostaAntigo: row.codigoPropostaAntigo ?? null,
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

function parseLegacyNumber(value: string | null): number | null {
  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text
    .replace(/[Rr]\$/g, '')
    .replace(/[\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const numeric = Number.parseFloat(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseLegacyDueDate(value: string | null): Date | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (text === '0000-00-00' || text === '0000-00-00 00:00:00') return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const dateTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

  if (dateOnly.test(text)) {
    const dt = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (dateTime.test(text)) {
    const normalized = text.includes(' ') ? text.replace(' ', 'T') : text;
    const dt = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseRiskAssessment(value: string | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (['s', 'sim', '1', 'true', 'yes'].includes(normalized)) return 'Sim';
  if (['n', 'nao', 'não', '0', 'false', 'no'].includes(normalized)) return 'Não';

  return null;
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
  const dryRun = args.includes('--dry-run');

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

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let changeDueDate = 0;
  let changeTermMonths = 0;
  let changeHourJustification = 0;
  let changeRiskAssessment = 0;
  let changeDiscount = 0;
  let changeProposalOrigin = 0;

  for (const legacy of legacyProposals) {
    const code = normalizeText(legacy.codigoProposta);
    if (!code) {
      skipped++;
      continue;
    }

    const revision = parseRevision(code, legacy.revisao);
    const proposalId = await resolveProposalId(code, revision);
    if (!proposalId) {
      skipped++;
      continue;
    }

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        dueDate: true,
        termMonths: true,
        hourJustification: true,
        riskAssessment: true,
        discount: true,
        proposalOrigin: true,
      },
    });

    if (!proposal) {
      skipped++;
      continue;
    }

    const nextDueDate = parseLegacyDueDate(legacy.dataValidade);
    const nextTermMonths = parseLegacyNumber(legacy.prazoEmMeses);
    const nextHourJustification = parseLegacyNumber(legacy.valorMobilizacao);
    const nextRiskAssessment = parseRiskAssessment(legacy.avaliacaoRisco);
    const nextDiscount = normalizeText(legacy.valorDesconto);
    const nextProposalOrigin = normalizeText(legacy.codigoPropostaAntigo);

    const currDueIso = proposal.dueDate ? proposal.dueDate.toISOString().slice(0, 10) : null;
    const nextDueIso = nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null;

    const dueChanged = currDueIso !== nextDueIso;
    const termChanged = (proposal.termMonths ?? null) !== (nextTermMonths ?? null);
    const mobilizationChanged = (proposal.hourJustification ?? null) !== (nextHourJustification ?? null);
    const riskChanged = (proposal.riskAssessment ?? null) !== (nextRiskAssessment ?? null);
    const discountChanged = (proposal.discount ?? null) !== (nextDiscount ?? null);
    const originChanged = (proposal.proposalOrigin ?? null) !== (nextProposalOrigin ?? null);

    if (dueChanged) changeDueDate++;
    if (termChanged) changeTermMonths++;
    if (mobilizationChanged) changeHourJustification++;
    if (riskChanged) changeRiskAssessment++;
    if (discountChanged) changeDiscount++;
    if (originChanged) changeProposalOrigin++;

    const hasAnyChange =
      dueChanged ||
      termChanged ||
      mobilizationChanged ||
      riskChanged ||
      discountChanged ||
      originChanged;

    if (hasAnyChange && !dryRun) {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: {
          dueDate: nextDueDate,
          termMonths: nextTermMonths,
          hourJustification: nextHourJustification,
          riskAssessment: nextRiskAssessment,
          discount: nextDiscount,
          proposalOrigin: nextProposalOrigin,
        },
      });
      updated++;
    }

    processed++;
  }

  const [filledDueDate, filledTermMonths, filledHourJustification, filledRiskAssessment, filledDiscount, filledProposalOrigin] = await Promise.all([
    prisma.proposal.count({ where: { dueDate: { not: null } } }),
    prisma.proposal.count({ where: { termMonths: { not: null } } }),
    prisma.proposal.count({ where: { hourJustification: { not: null } } }),
    prisma.proposal.count({ where: { riskAssessment: { not: null } } }),
    prisma.proposal.count({ where: { discount: { not: null } } }),
    prisma.proposal.count({ where: { proposalOrigin: { not: null } } }),
  ]);

  console.log(dryRun ? 'DRY-RUN concluído (nenhuma alteração persistida).' : 'Vinculação dos campos restantes concluída com sucesso.');
  console.log(`Propostas legadas processadas: ${legacyProposals.length}`);
  console.log(`Propostas encontradas no sistema: ${processed}`);
  console.log(`Propostas ignoradas: ${skipped}`);
  console.log(`Propostas atualizadas: ${updated}`);
  console.log('Alterações detectadas por campo:');
  console.log(`- dueDate: ${changeDueDate}`);
  console.log(`- termMonths: ${changeTermMonths}`);
  console.log(`- hourJustification: ${changeHourJustification}`);
  console.log(`- riskAssessment: ${changeRiskAssessment}`);
  console.log(`- discount: ${changeDiscount}`);
  console.log(`- proposalOrigin: ${changeProposalOrigin}`);
  console.log('Preenchimento atual no banco:');
  console.log(`- dueDate: ${filledDueDate}`);
  console.log(`- termMonths: ${filledTermMonths}`);
  console.log(`- hourJustification: ${filledHourJustification}`);
  console.log(`- riskAssessment: ${filledRiskAssessment}`);
  console.log(`- discount: ${filledDiscount}`);
  console.log(`- proposalOrigin: ${filledProposalOrigin}`);
}

main()
  .catch((error) => {
    console.error('Falha ao vincular campos restantes da proposta:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
