import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { recomputeAllYears } from "@/lib/catalog/years-recompute";
import { runSync } from "@/lib/sync/run";

// Vercel Cron (vercel.json) вика този адрес веднъж дневно с „Authorization: Bearer <CRON_SECRET>“.
// Hobby планът позволява до 60 сек. — синхронизацията спира малко преди това и продължава при следващото пускане.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  await connection();
  if (!cronAuthorized(req)) return Response.json({ error: "Неоторизиран" }, { status: 401 });
  try {
    const summary = await runSync({ trigger: "cron", budgetMs: 25_000 });
    // Новите песни/албуми → годините наново (най-ранното издание; ~7 сек.).
    const years = await recomputeAllYears();
    return Response.json({ ...summary, years });
  } catch (error) {
    console.error("sync-catalog", error);
    return Response.json({ error: "Синхронизацията не успя" }, { status: 500 });
  }
}
