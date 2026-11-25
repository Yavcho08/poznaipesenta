import type { NextRequest } from "next/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { searchSongs } from "@/lib/search";

export async function GET(req: NextRequest) {
  if (!rateLimit(`search:${clientIp(req)}`, 90, 60_000)) return tooManyRequests();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ results: [] });
  if (q.length > 100) return Response.json({ error: "Твърде дълга заявка" }, { status: 400 });

  try {
    const results = await searchSongs(q);
    return Response.json({ results }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Търсенето не работи в момента" }, { status: 502 });
  }
}
