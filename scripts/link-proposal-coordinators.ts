import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../server/db.ts';

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugifyName(value: string): string {
  return normalizeName(value)
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '.');
}

async function main() {
  const proposals = await prisma.proposal.findMany({
    where: {
      coordinatorName: {
        not: null,
      },
    },
    select: {
      id: true,
      coordinatorId: true,
      coordinatorName: true,
    },
  });

  const distinctResponsibleNames = [...new Set(
    proposals
      .map((proposal) => (proposal.coordinatorName ?? '').trim())
      .filter(Boolean)
  )];

  if (distinctResponsibleNames.length === 0) {
    console.log('Nenhuma proposta com responsável para vincular.');
    return;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const userByNormalizedName = new Map<string, { id: string; name: string; email: string }>();
  const usedEmails = new Set(users.map((user) => user.email.toLowerCase()));

  for (const user of users) {
    userByNormalizedName.set(normalizeName(user.name), user);
  }

  let createdUsers = 0;

  for (const responsibleName of distinctResponsibleNames) {
    const normalized = normalizeName(responsibleName);
    if (userByNormalizedName.has(normalized)) continue;

    const baseSlug = slugifyName(responsibleName) || 'legacy.user';
    let candidateEmail = `${baseSlug}@legacy.tec3.local`;
    let suffix = 1;

    while (usedEmails.has(candidateEmail.toLowerCase())) {
      candidateEmail = `${baseSlug}.${suffix}@legacy.tec3.local`;
      suffix += 1;
    }

    const randomPassword = randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    const created = await prisma.user.create({
      data: {
        email: candidateEmail,
        password: hashedPassword,
        name: responsibleName,
        role: 'projects',
        isActive: true,
        receivesEmails: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    usedEmails.add(created.email.toLowerCase());
    userByNormalizedName.set(normalized, created);
    createdUsers += 1;
  }

  let updatedProposals = 0;
  let skippedProposals = 0;

  for (const proposal of proposals) {
    const responsibleName = (proposal.coordinatorName ?? '').trim();
    if (!responsibleName) {
      skippedProposals += 1;
      continue;
    }

    const matchedUser = userByNormalizedName.get(normalizeName(responsibleName));
    if (!matchedUser) {
      skippedProposals += 1;
      continue;
    }

    if (proposal.coordinatorId === matchedUser.id) continue;

    await prisma.proposal.update({
      where: { id: proposal.id },
      data: {
        coordinatorId: matchedUser.id,
        coordinatorName: matchedUser.name,
      },
    });

    updatedProposals += 1;
  }

  const remainingNullCoordinatorId = await prisma.proposal.count({
    where: {
      coordinatorName: {
        not: null,
      },
      coordinatorId: null,
    },
  });

  console.log('Vinculação de coordenadores concluída com sucesso.');
  console.log(`Nomes distintos de responsável: ${distinctResponsibleNames.length}`);
  console.log(`Usuários criados: ${createdUsers}`);
  console.log(`Propostas atualizadas com coordinatorId: ${updatedProposals}`);
  console.log(`Propostas ignoradas: ${skippedProposals}`);
  console.log(`Propostas com coordinatorId nulo após backfill: ${remainingNullCoordinatorId}`);
}

main()
  .catch((error) => {
    console.error('Falha ao vincular responsáveis/coordenadores das propostas:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
