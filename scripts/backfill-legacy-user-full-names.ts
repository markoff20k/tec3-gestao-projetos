import 'dotenv/config';
import { prisma } from '../server/db.ts';
import { assertNoLocalDumpArgs, loadLegacySqlFromTables } from './legacy-source.ts';

type ParsedValue = string | null;

interface LegacyUserRow {
  userUsuario: string | null;
  nome: string | null;
}

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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

function mapLegacyUsers(sqlContent: string): LegacyUserRow[] {
  const rows = extractRows(sqlContent, 'Usuario');
  return rows.map(({ columns, values }) => {
    const row: Record<string, string | null> = {};
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]] = i < values.length ? values[i] : null;
    }

    return {
      userUsuario: row.userUsuario ?? null,
      nome: row.nome ?? null,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  assertNoLocalDumpArgs(args, 'backfill-legacy-user-full-names');

  const sqlContent = await loadLegacySqlFromTables(['Usuario']);
  const legacyUsers = mapLegacyUsers(sqlContent);

  if (legacyUsers.length === 0) {
    throw new Error('Nenhum usuário legado encontrado na tabela Usuario.');
  }

  const fullNameByLogin = new Map<string, string>();
  for (const legacy of legacyUsers) {
    const login = normalizeText(legacy.userUsuario)?.toLowerCase();
    const fullName = normalizeText(legacy.nome);
    if (!login || !fullName) continue;
    if (!fullNameByLogin.has(login)) {
      fullNameByLogin.set(login, fullName);
    }
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  let updated = 0;
  let skippedNoLegacyEmail = 0;
  let skippedNoFullName = 0;
  let unchanged = 0;

  for (const user of users) {
    const email = user.email.toLowerCase();
    if (!email.endsWith('@legacy.tec3.local')) {
      skippedNoLegacyEmail += 1;
      continue;
    }

    const login = email.split('@')[0].split('.')[0].toLowerCase();
    const fullName = fullNameByLogin.get(login);

    if (!fullName) {
      skippedNoFullName += 1;
      continue;
    }

    if (user.name.trim() === fullName.trim()) {
      unchanged += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: fullName },
      });
    }

    updated += 1;
  }

  console.log('Resumo backfill de nomes completos (usuários legados):');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- legacyUsersInDump: ${fullNameByLogin.size}`);
  console.log(`- updated: ${updated}`);
  console.log(`- unchanged: ${unchanged}`);
  console.log(`- skippedNoLegacyEmail: ${skippedNoLegacyEmail}`);
  console.log(`- skippedNoFullName: ${skippedNoFullName}`);
}

main()
  .catch((error) => {
    console.error('Falha ao atualizar nomes completos de usuários legados:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
