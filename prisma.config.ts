import "dotenv/config";
import { defineConfig } from "prisma/config";

// SQLite при разработка (prisma/schema.prisma), Postgres в продукция (prisma/postgres/schema.prisma —
// генерира се от основната схема с `npm run db:pg:sync`). Изборът е по DATABASE_URL.
const url = process.env.DATABASE_URL ?? "";
const postgres = /^postgres(ql)?:\/\//.test(url);

export default defineConfig({
  schema: postgres ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma",
  migrations: {
    path: postgres ? "prisma/postgres/migrations" : "prisma/migrations",
    // react-server: модулите от src/lib импортират "server-only".
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Neon: миграциите минават през директната (непулирана) връзка, ако е зададена.
    // DATABASE_URL_UNPOOLED я задава интеграцията Vercel ↔ Neon.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || url,
  },
});
