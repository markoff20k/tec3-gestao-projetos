import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

// Ensure DATABASE_URL is a string for production compatibility
const connectionString = process.env.DATABASE_URL 
  ? String(process.env.DATABASE_URL) 
  : '';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
