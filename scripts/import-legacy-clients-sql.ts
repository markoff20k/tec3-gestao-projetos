import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { assertNoLocalDumpArgs, loadLegacySqlFromTables } from './legacy-source.ts';

type ParsedValue = string | null;

interface LegacyClientRow {
  idCliente: string | null;
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  pais: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  comercialNome: string | null;
  comercialEmail: string | null;
  comercialCelular: string | null;
  medicaoNome: string | null;
  medicaoEmail: string | null;
  medicaoCelular: string | null;
  tecnicoNome: string | null;
  tecnicoEmail: string | null;
  tecnicoCelular: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === '_____-___') return null;
  return trimmed;
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

  for (let i = 0; i < tupleContent.length; i++) {
    const char = tupleContent[i];
    const prev = i > 0 ? tupleContent[i - 1] : '';

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

  for (let i = 0; i < valuesSection.length; i++) {
    const char = valuesSection[i];
    const prev = i > 0 ? valuesSection[i - 1] : '';

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

function mapRow(columns: string[], values: ParsedValue[]): LegacyClientRow {
  const row: Record<string, string | null> = {};

  for (let i = 0; i < columns.length; i++) {
    row[columns[i]] = i < values.length ? values[i] : null;
  }

  return {
    idCliente: row.idCliente ?? null,
    cnpj: row.cnpj ?? null,
    razaoSocial: row.razaoSocial ?? null,
    nomeFantasia: row.nomeFantasia ?? null,
    pais: row.pais ?? null,
    cep: row.cep ?? null,
    logradouro: row.logradouro ?? null,
    numero: row.numero ?? null,
    complemento: row.complemento ?? null,
    bairro: row.bairro ?? null,
    cidade: row.cidade ?? null,
    uf: row.uf ?? null,
    comercialNome: row.comercialNome ?? null,
    comercialEmail: row.comercialEmail ?? null,
    comercialCelular: row.comercialCelular ?? null,
    medicaoNome: row.medicaoNome ?? null,
    medicaoEmail: row.medicaoEmail ?? null,
    medicaoCelular: row.medicaoCelular ?? null,
    tecnicoNome: row.tecnicoNome ?? null,
    tecnicoEmail: row.tecnicoEmail ?? null,
    tecnicoCelular: row.tecnicoCelular ?? null,
  };
}

function extractLegacyClients(sqlContent: string): LegacyClientRow[] {
  const inserts = [...sqlContent.matchAll(/\bN?INSERT\s+INTO\s+`?Cliente`?\s*\(([^)]*)\)\s*VALUES\s*([\s\S]*?);/gi)];
  const clients: LegacyClientRow[] = [];

  for (const match of inserts) {
    const rawColumns = match[1] ?? '';
    const rawValues = match[2] ?? '';

    const columns = rawColumns
      .split(',')
      .map((col) => col.replace(/`/g, '').trim())
      .filter(Boolean);

    const rows = parseValuesSection(rawValues);

    for (const values of rows) {
      clients.push(mapRow(columns, values));
    }
  }

  return clients;
}

async function upsertLegacyClients(clients: LegacyClientRow[]) {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const legacy of clients) {
    const razaoSocial = normalizeText(legacy.razaoSocial);
    if (!razaoSocial) {
      skipped++;
      continue;
    }

    const cnpj = normalizeText(legacy.cnpj);

    const data = {
      cnpj,
      razaoSocial,
      nomeFantasia: normalizeText(legacy.nomeFantasia),
      pais: normalizeText(legacy.pais) ?? 'Brasil',
      cep: normalizeText(legacy.cep),
      rua: normalizeText(legacy.logradouro),
      numero: normalizeText(legacy.numero),
      complemento: normalizeText(legacy.complemento),
      bairro: normalizeText(legacy.bairro),
      cidade: normalizeText(legacy.cidade),
      estado: normalizeText(legacy.uf),
      nomeComercial: normalizeText(legacy.comercialNome),
      emailComercial: normalizeText(legacy.comercialEmail),
      telefoneComercial: normalizeText(legacy.comercialCelular),
      nomeMedicao: normalizeText(legacy.medicaoNome),
      emailMedicao: normalizeText(legacy.medicaoEmail),
      telefoneMedicao: normalizeText(legacy.medicaoCelular),
      nomeTecnico: normalizeText(legacy.tecnicoNome),
      emailTecnico: normalizeText(legacy.tecnicoEmail),
      telefoneTecnico: normalizeText(legacy.tecnicoCelular),
      isActive: true,
    };

    const existing = cnpj
      ? await prisma.client.findFirst({ where: { cnpj } })
      : await prisma.client.findFirst({ where: { razaoSocial } });

    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.client.create({ data });
      created++;
    }
  }

  return { created, updated, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const replaceAll = args.includes('--replace-all');
  const strict = args.includes('--strict');
  assertNoLocalDumpArgs(args, 'import-legacy-clients-sql');

  const sqlContent = await loadLegacySqlFromTables(['Cliente']);
  const legacyClients = extractLegacyClients(sqlContent);

  if (legacyClients.length === 0) {
    throw new Error('Nenhum INSERT INTO Cliente foi encontrado no arquivo informado.');
  }

  console.log(`Clientes legados encontrados: ${legacyClients.length}`);

  if (replaceAll) {
    console.log('Modo replace-all ativado: limpando tabela clients com CASCADE...');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "clients" RESTART IDENTITY CASCADE');
    console.log('Tabela clients limpa com sucesso.');
  }

  const result = await upsertLegacyClients(legacyClients);

  if (strict && result.skipped > 0) {
    throw new Error(`Modo estrito violado: ${result.skipped} cliente(s) legado(s) foram ignorados.`);
  }

  console.log('Importação concluída com sucesso.');
  console.log(`Strict: ${strict}`);
  console.log(`Criados: ${result.created}`);
  console.log(`Atualizados: ${result.updated}`);
  console.log(`Ignorados: ${result.skipped}`);
}

main()
  .catch((error) => {
    console.error('Falha na importação de clientes legados:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
