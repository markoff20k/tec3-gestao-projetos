import 'dotenv/config';
import { prisma } from '../server/db.ts';

function normalizeText(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function proposalKey(code: string, revision: number): string {
  return `${code}::${revision}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const [projects, proposals, timeEntries] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        code: true,
        coordinatorId: true,
        legacyProposalCode: true,
        legacyRevision: true,
      },
    }),
    prisma.proposal.findMany({
      select: {
        code: true,
        revision: true,
        coordinatorId: true,
        createdAt: true,
      },
      where: {
        coordinatorId: {
          not: null,
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.timeEntry.findMany({
      select: {
        projectId: true,
        approvedById: true,
        status: true,
      },
      where: {
        approvedById: {
          not: null,
        },
      },
    }),
  ]);

  const proposalCoordinatorByCodeRevision = new Map<string, string>();
  const proposalCoordinatorByCodeLatest = new Map<string, string>();

  for (const proposal of proposals) {
    if (!proposal.coordinatorId) continue;

    const key = proposalKey(proposal.code, proposal.revision);
    if (!proposalCoordinatorByCodeRevision.has(key)) {
      proposalCoordinatorByCodeRevision.set(key, proposal.coordinatorId);
    }

    if (!proposalCoordinatorByCodeLatest.has(proposal.code)) {
      proposalCoordinatorByCodeLatest.set(proposal.code, proposal.coordinatorId);
    }
  }

  const approvedByCounterByProject = new Map<string, Map<string, number>>();

  for (const entry of timeEntries) {
    if (entry.status !== 'approved') continue;
    const approvedById = normalizeText(entry.approvedById);
    if (!approvedById) continue;

    const currentMap = approvedByCounterByProject.get(entry.projectId) ?? new Map<string, number>();
    currentMap.set(approvedById, (currentMap.get(approvedById) ?? 0) + 1);
    approvedByCounterByProject.set(entry.projectId, currentMap);
  }

  const chooseTopApprover = (projectId: string): string | null => {
    const counter = approvedByCounterByProject.get(projectId);
    if (!counter || counter.size === 0) return null;

    let top: { id: string; count: number } | null = null;

    for (const [id, count] of counter.entries()) {
      if (!top || count > top.count) {
        top = { id, count };
      }
    }

    return top?.id ?? null;
  };

  let updated = 0;
  let fromExactProposal = 0;
  let fromLatestProposal = 0;
  let fromApprovedEntries = 0;
  let unresolved = 0;

  for (const project of projects) {
    let targetCoordinatorId: string | null = null;
    let source: 'exact' | 'latest' | 'approver' | null = null;

    const proposalCode = normalizeText(project.legacyProposalCode);
    const revision = project.legacyRevision;

    if (proposalCode && typeof revision === 'number') {
      const key = proposalKey(proposalCode, revision);
      const exact = proposalCoordinatorByCodeRevision.get(key);
      if (exact) {
        targetCoordinatorId = exact;
        source = 'exact';
      }
    }

    if (!targetCoordinatorId && proposalCode) {
      const latest = proposalCoordinatorByCodeLatest.get(proposalCode);
      if (latest) {
        targetCoordinatorId = latest;
        source = 'latest';
      }
    }

    if (!targetCoordinatorId) {
      const approver = chooseTopApprover(project.id);
      if (approver) {
        targetCoordinatorId = approver;
        source = 'approver';
      }
    }

    if (!targetCoordinatorId) {
      unresolved += 1;
      continue;
    }

    if (project.coordinatorId === targetCoordinatorId) {
      continue;
    }

    if (!dryRun) {
      await prisma.project.update({
        where: { id: project.id },
        data: { coordinatorId: targetCoordinatorId },
      });
    }

    updated += 1;
    if (source === 'exact') fromExactProposal += 1;
    if (source === 'latest') fromLatestProposal += 1;
    if (source === 'approver') fromApprovedEntries += 1;
  }

  const withCoordinatorAfter = dryRun
    ? projects.filter((project) => project.coordinatorId !== null).length + updated
    : await prisma.project.count({ where: { coordinatorId: { not: null } } });

  console.log('Resumo vínculo de coordenadores em projetos:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- totalProjects: ${projects.length}`);
  console.log(`- updatedProjects: ${updated}`);
  console.log(`- sourceExactProposalCodeRevision: ${fromExactProposal}`);
  console.log(`- sourceLatestProposalByCode: ${fromLatestProposal}`);
  console.log(`- sourceMostFrequentApprover: ${fromApprovedEntries}`);
  console.log(`- unresolvedProjects: ${unresolved}`);
  console.log(`- projectsWithCoordinatorAfter: ${withCoordinatorAfter}`);
}

main()
  .catch((error) => {
    console.error('Falha ao vincular coordenadores dos projetos:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
