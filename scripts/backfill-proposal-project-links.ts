import 'dotenv/config';
import { prisma } from '../server/db.ts';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const projects = await prisma.project.findMany({
    select: {
      id: true,
      code: true,
      legacyProposalCode: true,
      legacyRevision: true,
    },
  });

  const proposals = await prisma.proposal.findMany({
    select: {
      id: true,
      code: true,
      revision: true,
      projectId: true,
    },
  });

  const projectByCodeRevision = new Map<string, { id: string; code: string }>();
  for (const project of projects) {
    if (!project.legacyProposalCode || project.legacyRevision === null) continue;
    const key = `${project.legacyProposalCode}::${project.legacyRevision}`;
    if (!projectByCodeRevision.has(key)) {
      projectByCodeRevision.set(key, { id: project.id, code: project.code });
    }
  }

  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let conflicts = 0;
  let noProjectMatch = 0;

  for (const proposal of proposals) {
    const key = `${proposal.code}::${proposal.revision}`;
    const project = projectByCodeRevision.get(key);

    if (!project) {
      noProjectMatch += 1;
      continue;
    }

    matched += 1;

    if (proposal.projectId === project.id) {
      unchanged += 1;
      continue;
    }

    if (proposal.projectId && proposal.projectId !== project.id) {
      conflicts += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { projectId: project.id },
      });
    }

    updated += 1;
  }

  const proposalsWithProjectIdAfter = dryRun
    ? proposals.filter((proposal) => proposal.projectId !== null).length + updated
    : await prisma.proposal.count({ where: { projectId: { not: null } } });

  console.log('Resumo backfill Proposal.projectId -> Project.id:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- projectsTotal: ${projects.length}`);
  console.log(`- proposalsTotal: ${proposals.length}`);
  console.log(`- proposalsMatchedByCodeRevision: ${matched}`);
  console.log(`- updated: ${updated}`);
  console.log(`- unchanged: ${unchanged}`);
  console.log(`- conflicts: ${conflicts}`);
  console.log(`- proposalsWithoutProjectMatch: ${noProjectMatch}`);
  console.log(`- proposalsWithProjectIdAfter: ${proposalsWithProjectIdAfter}`);
}

main()
  .catch((error) => {
    console.error('Falha ao fazer backfill de links Proposta -> Projeto:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
