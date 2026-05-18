import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyProjectRow {
  codigoProjeto: string | null;
  codigoProposta: string | null;
  nome: string | null;
  descricao: string | null;
  todasHorasDiariasAprovadasAutomaticamente: string | null;
  quantidadeHorasDiariasAprovadasAutomaticamente: string | null;
  dataEncerramento: string | null;
  status: string | null;
  revisao: string | null;
  dataInicio: string | null;
  prazoEmMeses: string | null;
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

function parseNumber(value: string | null): number {
  if (value === null) return 0;
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
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

function extractInsertBlocks(sqlContent: string, tableName: string): Array<{ columns: string; values: string }> {
  const blocks: Array<{ columns: string; values: string }> = [];
  const tablePattern = new RegExp(`\\bN?INSERT\\s+INTO\\s+` + '`?' + `${tableName}` + '`?' + `\\s*\\(([^)]*)\\)\\s*VALUES\\s*`, 'gi');

  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(sqlContent)) !== null) {
    const rawColumns = match[1] ?? '';
    let index = tablePattern.lastIndex;
    let inString = false;
    let prev = '';

    while (index < sqlContent.length) {
      const char = sqlContent[index];

      if (char === "'" && prev !== '\\') {
        inString = !inString;
      }

      if (!inString && char === ';') {
        blocks.push({
          columns: rawColumns,
          values: sqlContent.slice(tablePattern.lastIndex, index),
        });
        tablePattern.lastIndex = index + 1;
        break;
      }

      prev = char;
      index++;
    }
  }

  return blocks;
}

function mapProjectRow(columns: string[], values: ParsedValue[]): LegacyProjectRow {
  const row: Record<string, string | null> = {};

  for (let index = 0; index < columns.length; index++) {
    row[columns[index]] = index < values.length ? values[index] : null;
  }

  return {
    codigoProjeto: row.codigoProjeto ?? null,
    codigoProposta: row.codigoProposta ?? null,
    nome: row.nome ?? null,
    descricao: row.descricao ?? null,
    todasHorasDiariasAprovadasAutomaticamente: row.todasHorasDiariasAprovadasAutomaticamente ?? null,
    quantidadeHorasDiariasAprovadasAutomaticamente: row.quantidadeHorasDiariasAprovadasAutomaticamente ?? null,
    dataEncerramento: row.dataEncerramento ?? null,
    status: row.status ?? null,
    revisao: row.revisao ?? null,
    dataInicio: row.dataInicio ?? null,
    prazoEmMeses: row.prazoEmMeses ?? null,
  };
}

function extractLegacyProjects(sqlContent: string): LegacyProjectRow[] {
  const rows: LegacyProjectRow[] = [];

  for (const block of extractInsertBlocks(sqlContent, 'Projeto')) {
    const columns = (block.columns ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(block.values ?? '');
    for (const parsed of parsedRows) {
      rows.push(mapProjectRow(columns, parsed));
    }
  }

  return rows;
}

function parseLegacyDate(value: string | null): Date | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (text === '0000-00-00' || text === '0000-00-00 00:00:00') return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(text)) {
    const dt = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function mapLegacyProjectStatus(raw: string | null): string {
  const text = (normalizeText(raw) ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (text === 'nao iniciado') return 'planning';
  if (text === 'em andamento') return 'active';
  if (text === 'concluido' || text === 'finalizado tecnico') return 'completed';
  if (text === 'paralisado') return 'on_hold';
  if (text === 'cancelado') return 'cancelled';

  return 'planning';
}

async function resolveProposalByCode(code: string) {
  const exact = await prisma.proposal.findFirst({
    where: { code },
    orderBy: [{ revision: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, clientId: true },
  });
  return exact;
}

function selectLatestByCode(rows: LegacyProjectRow[]): LegacyProjectRow[] {
  const map = new Map<string, LegacyProjectRow>();

  for (const row of rows) {
    const code = normalizeText(row.codigoProjeto);
    if (!code) continue;

    const current = map.get(code);
    if (!current) {
      map.set(code, row);
      continue;
    }

    const currentRev = parseInteger(current.revisao);
    const nextRev = parseInteger(row.revisao);

    if (nextRev >= currentRev) {
      map.set(code, row);
    }
  }

  return [...map.values()];
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
  const legacyProjectsRaw = extractLegacyProjects(sqlContent);
  if (legacyProjectsRaw.length === 0) {
    throw new Error('Nenhum projeto legado encontrado no arquivo informado.');
  }

  const legacyProjects = selectLatestByCode(legacyProjectsRaw);

  console.log(`Projetos legados encontrados (bruto): ${legacyProjectsRaw.length}`);
  console.log(`Projetos legados após deduplicação por código/revisão: ${legacyProjects.length}`);

  if (!dryRun && replaceAll) {
    console.log('Modo replace-all: limpando tabela projects...');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "projects" RESTART IDENTITY CASCADE');
    console.log('Tabela projects limpa com sucesso.');
  }

  let created = 0;
  let updated = 0;
  let skippedMissingCodeOrName = 0;
  let skippedMissingProposal = 0;
  let skippedMissingClient = 0;
  let requiresApprovalFalse = 0;

  for (const legacy of legacyProjects) {
    const projectCode = normalizeText(legacy.codigoProjeto);
    const projectName = normalizeText(legacy.nome);
    const proposalCode = normalizeText(legacy.codigoProposta);

    if (!projectCode || !projectName || !proposalCode) {
      skippedMissingCodeOrName++;
      continue;
    }

    const proposal = await resolveProposalByCode(proposalCode);
    if (!proposal) {
      skippedMissingProposal++;
      continue;
    }

    if (!proposal.clientId) {
      skippedMissingClient++;
      continue;
    }

    const autoApprove = (normalizeText(legacy.todasHorasDiariasAprovadasAutomaticamente) ?? '').toLowerCase() === 's';
    const limitHours = parseInteger(legacy.quantidadeHorasDiariasAprovadasAutomaticamente);
    const requiresApproval = !autoApprove;

    if (!requiresApproval) {
      requiresApprovalFalse++;
    }

    const data = {
      legacyProposalCode: proposalCode,
      legacyRevision: parseInteger(legacy.revisao),
      legacyTermMonths: parseNumber(legacy.prazoEmMeses),
      name: projectName,
      description: normalizeText(legacy.descricao),
      clientId: proposal.clientId,
      coordinatorId: null,
      status: mapLegacyProjectStatus(legacy.status),
      startDate: parseLegacyDate(legacy.dataInicio),
      endDate: parseLegacyDate(legacy.dataEncerramento),
      budgetHours: 0,
      budgetValue: 0,
      dailyLimitHours: limitHours > 0 ? limitHours : 8,
      requiresApproval,
    };

    const existing = await prisma.project.findUnique({ where: { code: projectCode }, select: { id: true } });

    if (dryRun) {
      if (existing) updated++;
      else created++;
      continue;
    }

    if (existing) {
      await prisma.project.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.project.create({
        data: {
          code: projectCode,
          ...data,
        },
      });
      created++;
    }
  }

  const statusCounts = await prisma.project.groupBy({
    by: ['status'],
    _count: { _all: true },
  });

  const statusMap = statusCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  console.log('Resumo da importação de projetos:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- created: ${created}`);
  console.log(`- updated: ${updated}`);
  console.log(`- skippedMissingCodeOrName: ${skippedMissingCodeOrName}`);
  console.log(`- skippedMissingProposal: ${skippedMissingProposal}`);
  console.log(`- skippedMissingClient: ${skippedMissingClient}`);
  console.log(`- requiresApprovalFalse: ${requiresApprovalFalse}`);
  console.log(`- statusDistribution: ${JSON.stringify(statusMap)}`);
}

main()
  .catch((error) => {
    console.error('Falha ao importar projetos legados:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
