import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Един клиент за целия процес; в dev HMR иначе създава нова връзка при всяка промяна.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Supabase Postgres през пулера (transaction mode, порт 6543).
 * Сертификатът на пулера е от собствения CA на Supabase, затова без проверка на веригата
 * (връзката пак е криптирана).
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Липсва DATABASE_URL (виж .env.example)");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const adapter = new PrismaPg({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
    // Serverless: малко връзки на инстанция, пулерът на Supabase поема останалото.
    max: process.env.NODE_ENV === "production" ? 3 : 5,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
