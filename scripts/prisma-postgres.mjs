// Генерира prisma/postgres/schema.prisma от основната (SQLite) схема.
// Пусни след всяка промяна в prisma/schema.prisma:  npm run db:pg:sync
// С --check само проверява дали файлът е актуален (за CI / преди деплой).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const SRC = "prisma/schema.prisma";
const OUT_DIR = "prisma/postgres";
const OUT = `${OUT_DIR}/schema.prisma`;

const source = readFileSync(SRC, "utf8");
const converted = source
  .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"')
  // Изходът е спрямо файла на схемата — postgres/ е една папка по-дълбоко.
  .replace(/output\s*=\s*"\.\.\/src\/generated\/prisma"/, 'output   = "../../src/generated/prisma"');

if (converted === source) {
  console.error("Не намерих provider = \"sqlite\" в prisma/schema.prisma");
  process.exit(1);
}

const result = `// ГЕНЕРИРАН ФАЙЛ — не редактирай. Източник: prisma/schema.prisma (npm run db:pg:sync)\n${converted}`;

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== result) {
    console.error("prisma/postgres/schema.prisma е остарял. Пусни: npm run db:pg:sync");
    process.exit(1);
  }
  console.log("Postgres схемата е актуална.");
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, result);
  console.log(`Записан ${OUT}`);
}
