import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../server/db.ts';

interface MappingRow {
  legacyLogin: string;
  userId: string;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function normalizeKey(value: string | null | undefined): string {
  return normalizeText(value).toLowerCase();
}

function safeEmailLocal(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '')
    .slice(0, 64);
}

function displayNameFromLegacyLogin(login: string): string {
  const normalized = normalizeText(login);
  if (!normalized) return 'Usuário legado';

  const spaced = normalized
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) return `Legado ${normalized}`;

  return spaced
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const createLegacyUsers = !args.includes('--no-create-users');

  const mappingFileArg = args.find((arg) => arg.startsWith('--mapping-file='));
  const mappingFile = mappingFileArg ? mappingFileArg.split('=')[1] : null;

  const exportTemplateArg = args.find((arg) => arg.startsWith('--export-template='));
  const exportTemplate = exportTemplateArg ? exportTemplateArg.split('=')[1] : 'scripts/legacy-time-entry-user-mapping.template.csv';

  return {
    dryRun,
    createLegacyUsers,
    mappingFile: mappingFile ? path.resolve(mappingFile) : null,
    exportTemplate: path.resolve(exportTemplate),
  };
}

function loadMappingFile(filePath: string): MappingRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de mapeamento não encontrado: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const [header, ...rows] = lines;
  const separator = header.includes(';') ? ';' : ',';

  const parsedHeader = header.split(separator).map((item) => item.trim().toLowerCase());
  const legacyIndex = parsedHeader.findIndex((item) => item === 'legacylogin' || item === 'legacy_login');
  const userIdIndex = parsedHeader.findIndex((item) => item === 'userid' || item === 'user_id');

  if (legacyIndex === -1 || userIdIndex === -1) {
    throw new Error('Cabeçalho inválido no arquivo de mapeamento. Use: legacyLogin;userId');
  }

  const parsed: MappingRow[] = [];

  for (const row of rows) {
    const cols = row.split(separator).map((item) => item.trim());
    const legacyLogin = normalizeText(cols[legacyIndex]);
    const userId = normalizeText(cols[userIdIndex]);
    if (!legacyLogin || !userId) continue;
    parsed.push({ legacyLogin, userId });
  }

  return parsed;
}

async function main() {
  const { dryRun, createLegacyUsers, mappingFile, exportTemplate } = parseArgs();

  const [entries, users] = await Promise.all([
    prisma.timeEntry.findMany({
      select: { collaboratorId: true, approvedById: true },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, name: true },
    }),
  ]);

  if (entries.length === 0) {
    console.log('Nenhum lançamento de horas encontrado. Nada para vincular.');
    return;
  }

  const distinctLegacyLogins = new Set<string>();

  for (const entry of entries) {
    const collaborator = normalizeText(entry.collaboratorId);
    if (collaborator) distinctLegacyLogins.add(collaborator);

    const approver = normalizeText(entry.approvedById);
    if (approver) distinctLegacyLogins.add(approver);
  }

  const allUserIds = new Set(users.map((user) => user.id));
  const userByEmailPrefix = new Map<string, { id: string; email: string; name: string }>();

  for (const user of users) {
    const emailPrefix = normalizeKey(user.email.split('@')[0]);
    if (emailPrefix && !userByEmailPrefix.has(emailPrefix)) {
      userByEmailPrefix.set(emailPrefix, user);
    }
  }

  const manualMappings = mappingFile ? loadMappingFile(mappingFile) : [];
  const manualMap = new Map<string, string>();

  for (const row of manualMappings) {
    const legacyKey = normalizeKey(row.legacyLogin);
    if (!legacyKey) continue;

    if (!allUserIds.has(row.userId)) {
      console.warn(`Ignorando mapeamento manual inválido: ${row.legacyLogin} -> ${row.userId} (userId não existe)`);
      continue;
    }

    manualMap.set(legacyKey, row.userId);
  }

  const mapping = new Map<string, string>();
  let matchedByUserId = 0;
  let matchedByManual = 0;
  let matchedByEmailPrefix = 0;
  let createdUsers = 0;

  const usedEmails = new Set(users.map((user) => user.email.toLowerCase()));

  for (const legacyLogin of distinctLegacyLogins) {
    const legacyKey = normalizeKey(legacyLogin);
    if (!legacyKey) continue;

    if (allUserIds.has(legacyLogin)) {
      mapping.set(legacyLogin, legacyLogin);
      matchedByUserId += 1;
      continue;
    }

    const manualUserId = manualMap.get(legacyKey);
    if (manualUserId) {
      mapping.set(legacyLogin, manualUserId);
      matchedByManual += 1;
      continue;
    }

    const byEmailPrefix = userByEmailPrefix.get(legacyKey);
    if (byEmailPrefix) {
      mapping.set(legacyLogin, byEmailPrefix.id);
      matchedByEmailPrefix += 1;
      continue;
    }

    if (!createLegacyUsers) {
      continue;
    }

    const localPartBase = safeEmailLocal(legacyLogin) || 'legacy.user';
    let localPart = localPartBase;
    let candidateEmail = `${localPart}@legacy.tec3.local`;
    let suffix = 1;

    while (usedEmails.has(candidateEmail.toLowerCase())) {
      localPart = `${localPartBase}.${suffix}`;
      candidateEmail = `${localPart}@legacy.tec3.local`;
      suffix += 1;
    }

    if (dryRun) {
      mapping.set(legacyLogin, `DRY_RUN_USER_FOR_${legacyLogin}`);
      createdUsers += 1;
      continue;
    }

    const password = randomBytes(24).toString('hex');
    const hashed = await bcrypt.hash(password, 10);

    const created = await prisma.user.create({
      data: {
        email: candidateEmail,
        password: hashed,
        name: displayNameFromLegacyLogin(legacyLogin),
        role: 'projects',
        isActive: true,
        receivesEmails: false,
      },
      select: { id: true, email: true },
    });

    usedEmails.add(created.email.toLowerCase());
    allUserIds.add(created.id);
    mapping.set(legacyLogin, created.id);
    createdUsers += 1;
  }

  const unresolved = [...distinctLegacyLogins].filter((legacyLogin) => !mapping.has(legacyLogin));

  if (unresolved.length > 0) {
    const templateLines = ['legacyLogin;userId', ...unresolved.map((legacyLogin) => `${legacyLogin};`)];
    fs.writeFileSync(exportTemplate, templateLines.join('\n'), 'utf-8');
    console.log(`Template de mapeamento gerado: ${exportTemplate}`);
  }

  let updatedCollaboratorRows = 0;
  let updatedApproverRows = 0;

  if (!dryRun) {
    for (const [legacyLogin, userId] of mapping.entries()) {
      if (legacyLogin === userId) continue;
      if (!allUserIds.has(userId)) continue;

      const collaboratorResult = await prisma.timeEntry.updateMany({
        where: { collaboratorId: legacyLogin },
        data: { collaboratorId: userId },
      });

      const approverResult = await prisma.timeEntry.updateMany({
        where: { approvedById: legacyLogin },
        data: { approvedById: userId },
      });

      updatedCollaboratorRows += collaboratorResult.count;
      updatedApproverRows += approverResult.count;
    }
  } else {
    for (const entry of entries) {
      const mappedCollaborator = mapping.get(entry.collaboratorId);
      if (mappedCollaborator && mappedCollaborator !== entry.collaboratorId) {
        updatedCollaboratorRows += 1;
      }

      const approver = normalizeText(entry.approvedById);
      if (approver) {
        const mappedApprover = mapping.get(approver);
        if (mappedApprover && mappedApprover !== approver) {
          updatedApproverRows += 1;
        }
      }
    }
  }

  console.log('Resumo do vínculo de usuários legados em lançamentos:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- createLegacyUsers: ${createLegacyUsers}`);
  console.log(`- totalDistinctLegacyLogins: ${distinctLegacyLogins.size}`);
  console.log(`- matchedByUserId: ${matchedByUserId}`);
  console.log(`- matchedByManual: ${matchedByManual}`);
  console.log(`- matchedByEmailPrefix: ${matchedByEmailPrefix}`);
  console.log(`- createdUsers: ${createdUsers}`);
  console.log(`- unresolvedLegacyLogins: ${unresolved.length}`);
  console.log(`- collaboratorRowsToUpdate: ${updatedCollaboratorRows}`);
  console.log(`- approverRowsToUpdate: ${updatedApproverRows}`);

  if (unresolved.length > 0) {
    console.log(`- unresolvedSample: ${unresolved.slice(0, 15).join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error('Falha ao vincular usuários legados dos lançamentos de horas:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
