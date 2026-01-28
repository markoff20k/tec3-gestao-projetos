import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Ensure DATABASE_URL is a string
const databaseUrl = String(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: databaseUrl,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
