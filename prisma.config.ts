import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Както Next.js: .env.local е с предимство пред .env.
config({ path: [".env.local", ".env"], quiet: true });

// Базата е Supabase Postgres. Миграциите са SQL в supabase/migrations/ (npm run db:push),
// а prisma/schema.prisma служи само за генерирането на клиента (npm run db:check я сверява с базата).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // react-server: модулите от src/lib импортират "server-only".
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Директна (session mode) връзка — пулираната (transaction mode) не става за introspection.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
