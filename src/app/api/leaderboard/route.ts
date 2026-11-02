import type { NextRequest } from "next/server";
import { todayInSofia } from "@/lib/game/daily-shared";
import { getLeaderboard } from "@/lib/game/social";

// Класация: ?board=daily[&date=YYYY-MM-DD] или ?board=week[&source=<sourceRef>]
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const date = params.get("date");
  const entries =
    params.get("board") === "daily"
      ? await getLeaderboard({ kind: "daily", date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayInSofia() })
      : await getLeaderboard({ kind: "week", sourceRef: params.get("source")?.slice(0, 500) || null });
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
}
