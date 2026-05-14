import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../server/db.ts';

type ParsedValue = string | null;

interface LegacyClientRow {
  idCliente: string | null;
  cnpj: string | null;
  razaoSocial: string | null;
}

interface LegacyProposalRow {
  codigoProposta: string | null;
  codigoPropostaSuper: string | null;
  idCliente: string | null;
  userUsuarioResponsavel: string | null;
  tipoContrato: string | null;
  titulo: string | null;
  dataSolicitacao: string | null;
  dataEmissao: string | null;
  dataValidade: string | null;
  situacao: string | null;
  expectativa: string | null;
  tipoPrincipal: string | null;
  observacao: string | null;
  valorSubcontratacao: string | null;
  revisao: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '_____-___') return null;
  return trimmed;
}

function normalizeKey(value: string | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;
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

function extractLegacyClients(sqlContent: string): LegacyClientRow[] {
  const inserts = [...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Cliente`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi)];
  const clients: LegacyClientRow[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');
    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      clients.push({
        idCliente: row.idCliente ?? null,
        cnpj: row.cnpj ?? null,
        razaoSocial: row.razaoSocial ?? null,
      });
    }
  }

  return clients;
}

function extractLegacyProposals(sqlContent: string): LegacyProposalRow[] {
  const inserts = [...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Proposta`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi)];
  const proposals: LegacyProposalRow[] = [];

  for (const match of inserts) {
    const columns = (match[1] ?? '')
      .split(',')
      .map((column) => column.replace(/`/g, '').trim())
      .filter(Boolean);

    const parsedRows = parseValuesSection(match[2] ?? '');
    for (const parsed of parsedRows) {
      const row = mapRow(columns, parsed);
      proposals.push({
        codigoProposta: row.codigoProposta ?? null,
        codigoPropostaSuper: row.codigoPropostaSuper ?? null,
        idCliente: row.idCliente ?? null,
        userUsuarioResponsavel: row.userUsuarioResponsavel ?? null,
        tipoContrato: row.tipoContrato ?? null,
        titulo: row.titulo ?? null,
        dataSolicitacao: row.dataSolicitacao ?? null,
        dataEmissao: row.dataEmissao ?? null,
        dataValidade: row.dataValidade ?? null,
        situacao: row.situacao ?? null,
        expectativa: row.expectativa ?? null,
        tipoPrincipal: row.tipoPrincipal ?? null,
        observacao: row.observacao ?? null,
        valorSubcontratacao: row.valorSubcontratacao ?? null,
        revisao: row.revisao ?? null,
      });
    }
  }

  return proposals;
}

function parseLegacyDate(value: string | null): Date | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (text === '0000-00-00' || text === '0000-00-00 00:00:00' || text === '1969-12-31') return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function mapLegacyProposalType(value: string | null): string {
  const text = normalizeKey(value);
  if (!text) return 'fixed_price';
  if (text === 'preco fechado') return 'fixed_price';
  if (text === 'preco sob demanda') return 'appropriation';
  if (text === 'guarda-chuva') return 'umbrella';
  if (text === 'os') return 'service_order';
  if (text === 'ordem de servico') return 'service_order';
  if (text === 'aditivo') return 'additive';
  return 'fixed_price';
}

function mapLegacyProposalStatus(value: string | null): string {
  const text = normalizeKey(value);
  if (!text) return 'em_elaboracao';
  if (text === 'em elaboracao') return 'em_elaboracao';
  if (text === 'em analise') return 'em_analise';
  if (text === 'sucesso') return 'com_sucesso';
  if (text === 'nao sucesso') return 'nao_sucesso';
  if (text === 'cancelada') return 'cancelada';
  if (text === 'declinio') return 'nao_sucesso';
  return 'em_elaboracao';
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
  const legacyClients = extractLegacyClients(sqlContent);
  const legacyProposals = extractLegacyProposals(sqlContent);

  if (legacyClients.length === 0) {
    throw new Error('Nenhum cliente legado foi encontrado no arquivo informado.');
  }

  if (legacyProposals.length === 0) {
    throw new Error('Nenhuma proposta legada foi encontrada no arquivo informado.');
  }

  const legacyClientById = new Map<number, LegacyClientRow>();
  for (const client of legacyClients) {
    const id = parseInteger(client.idCliente);
    if (!id) continue;
    legacyClientById.set(id, client);
  }

  const existingClients = await prisma.client.findMany({
    select: { id: true, cnpj: true, razaoSocial: true },
  });

  const clientIdByCnpj = new Map<string, string>();
  const clientIdByRazaoSocial = new Map<string, string>();

  for (const client of existingClients) {
    const cnpjKey = normalizeKey(client.cnpj);
    const razaoKey = normalizeKey(client.razaoSocial);
    if (cnpjKey && !clientIdByCnpj.has(cnpjKey)) clientIdByCnpj.set(cnpjKey, client.id);
    if (razaoKey && !clientIdByRazaoSocial.has(razaoKey)) clientIdByRazaoSocial.set(razaoKey, client.id);
  }

  if (!dryRun && replaceAll) {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "proposals" RESTART IDENTITY CASCADE');
  }

  let created = 0;
  let updated = 0;
  let skippedMissingCodeOrTitle = 0;
  let skippedMissingLegacyClient = 0;
  let skippedMissingClientInPostgres = 0;

  for (const legacy of legacyProposals) {
    const code = normalizeText(legacy.codigoProposta);
    const title = normalizeText(legacy.titulo);

    if (!code || !title) {
      skippedMissingCodeOrTitle++;
      continue;
    }

    const legacyClientId = parseInteger(legacy.idCliente);
    const legacyClient = legacyClientById.get(legacyClientId);
    if (!legacyClient) {
      skippedMissingLegacyClient++;
      continue;
    }

    const resolvedClientId =
      clientIdByCnpj.get(normalizeKey(legacyClient.cnpj) ?? '') ??
      clientIdByRazaoSocial.get(normalizeKey(legacyClient.razaoSocial) ?? '');

    if (!resolvedClientId) {
      skippedMissingClientInPostgres++;
      continue;
    }

    const revision = parseInteger(legacy.revisao);

    const data = {
      title,
      description: normalizeText(legacy.observacao),
      clientId: resolvedClientId,
      coordinatorName: normalizeText(legacy.userUsuarioResponsavel),
      type: mapLegacyProposalType(legacy.tipoContrato),
      status: mapLegacyProposalStatus(legacy.situacao),
      totalValue: parseDecimal(legacy.valorSubcontratacao),
      estimatedHours: 0,
      sentDate: parseLegacyDate(legacy.dataEmissao),
      createdAt: parseLegacyDate(legacy.dataSolicitacao) ?? parseLegacyDate(legacy.dataEmissao) ?? new Date(),
    };

    const existing = await prisma.proposal.findFirst({
      where: { code, revision },
      select: { id: true },
    });

    if (dryRun) {
      if (existing) updated++;
      else created++;
      continue;
    }

    if (existing) {
      await prisma.proposal.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.proposal.create({
        data: {
          code,
          revision,
          ...data,
        },
      });
      created++;
    }
  }

  const statusCounts = dryRun
    ? []
    : await prisma.proposal.groupBy({
        by: ['status'],
        _count: { _all: true },
      });

  const statusMap = statusCounts.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = item._count._all;
    return acc;
  }, {});

  console.log('Resumo da importação direta de propostas legadas:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- created: ${created}`);
  console.log(`- updated: ${updated}`);
  console.log(`- skippedMissingCodeOrTitle: ${skippedMissingCodeOrTitle}`);
  console.log(`- skippedMissingLegacyClient: ${skippedMissingLegacyClient}`);
  console.log(`- skippedMissingClientInPostgres: ${skippedMissingClientInPostgres}`);
  if (!dryRun) {
    console.log(`- statusDistribution: ${JSON.stringify(statusMap)}`);
  }
}

main()
  .catch((error) => {
    console.error('Falha ao importar propostas legadas diretamente do SQL:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });