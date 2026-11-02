import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Един клиент за целия процес; в dev HMR иначе създава нова връзка при всяка промяна.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//.test(url);
}

// SQLite при разработка, Postgres (Neon) в продукция — според DATABASE_URL.
// Клиентът трябва да е генериран от съответната схема (виж prisma.config.ts).
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Липсва DATABASE_URL в .env");
  const adapter = isPostgresUrl(url) ? new PrismaPg(url) : new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
