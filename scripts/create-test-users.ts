import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../server/db";

async function main() {
  const users = [
    {
      email: "comercial@empresa.com",
      password: "comercial123",
      name: "Comercial (Teste)",
      role: "commercial" as const,
    },
    {
      email: "projetos@empresa.com",
      password: "projetos123",
      name: "Projetos (Teste)",
      role: "projects" as const,
    },
  ];

  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      // Keep output predictable for copy/paste
      console.log(`Já existe: ${user.email}`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);
    await prisma.user.create({
      data: {
        email: user.email,
        password: hashedPassword,
        name: user.name,
        role: user.role,
        isActive: true,
      },
    });

    console.log(`Criado: ${user.email} / ${user.password} (${user.role})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
