import 'dotenv/config';
import { prisma } from '../server/db';

async function main() {
  const before = await prisma.user.groupBy({
    by: ['receivesEmails'],
    _count: { _all: true },
  });

  const updated = await prisma.user.updateMany({
    where: { receivesEmails: false },
    data: { receivesEmails: true },
  });

  const after = await prisma.user.groupBy({
    by: ['receivesEmails'],
    _count: { _all: true },
  });

  console.log(JSON.stringify({ before, updatedCount: updated.count, after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });