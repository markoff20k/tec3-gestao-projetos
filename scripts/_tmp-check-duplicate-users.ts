import { prisma } from '../server/db';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, isActive: true, role: true },
    orderBy: { name: 'asc' },
  });

  const byName = new Map<string, typeof users>();
  for (const u of users) {
    const key = u.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(u);
  }

  for (const [, list] of byName) {
    if (list.length > 1) {
      console.log(JSON.stringify(list, null, 2));
    }
  }

  await prisma.$disconnect();
}

main();
