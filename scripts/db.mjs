// Миграции на Supabase базата.
//
//   npm run db:push            — прилага новите SQL миграции от supabase/migrations/ върху DIRECT_URL
//   npm run db:check           — проверява, че prisma/schema.prisma съвпада с базата
//   npm run db:push -- --env=.env.production.local   — срещу друга база (напр. продукцията)
//
// Връзката е DIRECT_URL (session mode) от .env.local / .env или от файла в --env.
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const [command, ...rest] = process.argv.slice(2);
const envFile = rest.find((a) => a.startsWith("--env="))?.slice("--env=".length);
config({ path: envFile ? [envFile] : [".env.local", ".env"], quiet: true, override: Boolean(envFile) });

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("Липсва DIRECT_URL (виж .env.example).");
  process.exit(1);
}

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...extraEnv } });
  process.exit(result.status ?? 1);
}

const host = new URL(url).host;
switch (command) {
  case "push":
    console.log(`База: ${host}`);
    run("npx", ["supabase", "db", "push", `--remote="${url}"`, "--yes"]);
    break;
  case "check":
    console.log(`База: ${host}`);
    run("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], {
      DIRECT_URL: url,
    });
    break;
  default:
    console.error("Употреба: node scripts/db.mjs push|check [--env=файл]");
    process.exit(1);
}
