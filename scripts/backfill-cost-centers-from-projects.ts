import 'dotenv/config';
import { prisma } from '../server/db.ts';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const projects = await prisma.project.findMany({
    where: { isAdministrative: false },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  const byCode = new Map<string, { code: string; name: string; projectId: string }>();

  for (const project of projects) {
    const rawCode = String(project.code ?? '').trim();
    if (!rawCode) continue;

    const code = rawCode.toUpperCase();
    const name = String(project.name ?? '').trim() || code;

    if (!byCode.has(code)) {
      byCode.set(code, { code, name, projectId: project.id });
    }
  }

  const uniqueCenters = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const center of uniqueCenters) {
    const existing = await prisma.costCenter.findUnique({ where: { code: center.code } });

    if (!existing) {
      if (!dryRun) {
        await prisma.costCenter.create({
          data: {
            code: center.code,
            name: center.name,
            isActive: true,
            isAdministrative: false,
            projectId: center.projectId,
          },
        });
      }
      created += 1;
      continue;
    }

    // Centros de custo administrativos são mantidos pelo admin e nunca são
    // sobrescritos por um projeto de mesmo código.
    if (existing.isAdministrative) {
      unchanged += 1;
      continue;
    }

    const nextName = center.name;
    const sameName = existing.name.trim() === nextName;
    const sameActive = existing.isActive === true;
    const sameProject = existing.projectId === center.projectId;

    if (sameName && sameActive && sameProject) {
      unchanged += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.costCenter.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          isActive: true,
          projectId: center.projectId,
        },
      });
    }

    updated += 1;
  }

  const totalAfter = dryRun ? await prisma.costCenter.count() : await prisma.costCenter.count();

  console.log('Resumo backfill cost_centers <- projects:');
  console.log(`- dryRun: ${dryRun}`);
  console.log(`- projectsTotal: ${projects.length}`);
  console.log(`- uniqueProjectCodes: ${uniqueCenters.length}`);
  console.log(`- created: ${created}`);
  console.log(`- updated: ${updated}`);
  console.log(`- unchanged: ${unchanged}`);
  console.log(`- costCentersTotalAfter: ${totalAfter}`);
}

main()
  .catch((error) => {
    console.error('Falha no backfill de centros de custo a partir de projetos:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
