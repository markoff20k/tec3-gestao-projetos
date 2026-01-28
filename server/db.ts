import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure Neon for serverless environment
neonConfig.webSocketConstructor = ws;

// Get connection string - ensure it's a valid string
const connectionString = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  if (typeof url !== 'string') {
    console.warn("DATABASE_URL is not a string, attempting to convert");
    return String(url);
  }
  return url;
})();

const pool = new Pool({ connectionString });
const adapter = new PrismaNeon(pool);

export const prisma = new PrismaClient({ adapter });
