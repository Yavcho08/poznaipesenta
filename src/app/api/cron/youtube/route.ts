import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { runYoutubeSync } from "@/lib/youtube";

// Vercel Cron (vercel.json): клипове и гледания в YouTube на части (квотата е дневна — виж src/lib/youtube.ts).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  await connection();
  if (!cronAuthorized(req)) return Response.json({ error: "Неоторизиран" }, { status: 401 });
  try {
    return Response.json(await runYoutubeSync(25_000));
  } catch (error) {
    console.error("cron youtube", error);
    return Response.json({ error: "YouTube синхронизацията не успя" }, { status: 500 });
  }
}
