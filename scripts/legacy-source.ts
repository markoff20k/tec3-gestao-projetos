import 'dotenv/config';
import mysql from 'mysql2/promise';

type LegacyDbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

const ENFORCED_HOST = '192.168.1.12';
const ENFORCED_DATABASE = 'bdtec3';

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value;
}

function getLegacyDbConfig(): LegacyDbConfig {
  const host = (process.env.LEGACY_DB_HOST ?? ENFORCED_HOST).trim();
  const database = (process.env.LEGACY_DB_NAME ?? ENFORCED_DATABASE).trim();

  if (host !== ENFORCED_HOST) {
    throw new Error(`LEGACY_DB_HOST invalido. Esperado: ${ENFORCED_HOST}. Recebido: ${host}`);
  }

  if (database !== ENFORCED_DATABASE) {
    throw new Error(`LEGACY_DB_NAME invalido. Esperado: ${ENFORCED_DATABASE}. Recebido: ${database}`);
  }

  const user = readRequiredEnv('LEGACY_DB_USER');
  const password = readRequiredEnv('LEGACY_DB_PASSWORD');
  const portRaw = (process.env.LEGACY_DB_PORT ?? '3306').trim();
  const port = Number.parseInt(portRaw, 10);

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`LEGACY_DB_PORT invalido: ${portRaw}`);
  }

  return { host, port, user, password, database };
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';

  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 19).replace('T', ' ');
    return `'${iso}'`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  const text = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  return `'${text}'`;
}

function buildInsertStatements(table: string, rows: Array<Record<string, unknown>>, chunkSize = 1000): string[] {
  if (rows.length === 0) {
    return [];
  }

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) {
    return [];
  }

  const columnSql = columns.map((column) => `\`${column}\``).join(', ');
  const statements: string[] = [];

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuesSql = chunk
      .map((row) => {
        const tuple = columns.map((column) => sqlLiteral(row[column])).join(', ');
        return `(${tuple})`;
      })
      .join(',\n');

    statements.push(`INSERT INTO \`${table}\` (${columnSql}) VALUES\n${valuesSql};`);
  }

  return statements;
}

export function assertNoLocalDumpArgs(args: string[], scriptName: string): void {
  const positional = args.filter((arg) => !arg.startsWith('--'));
  if (positional.length > 0) {
    throw new Error(
      `${scriptName}: argumentos posicionais foram desabilitados para evitar dump local. ` +
        `Use apenas flags e configure LEGACY_DB_* para leitura direta do legado.`,
    );
  }
}

export async function loadLegacySqlFromTables(tables: string[]): Promise<string> {
  if (tables.length === 0) {
    throw new Error('Nenhuma tabela legado informada para leitura.');
  }

  const config = getLegacyDbConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4',
  });

  try {
    const sqlParts: string[] = [
      `-- Fonte legado: host=${config.host} db=${config.database}`,
    ];

    for (const table of tables) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      const mappedRows = rows as Array<Record<string, unknown>>;
      const inserts = buildInsertStatements(table, mappedRows);
      sqlParts.push(...inserts);
    }

    return sqlParts.join('\n\n');
  } finally {
    await connection.end();
  }
}
