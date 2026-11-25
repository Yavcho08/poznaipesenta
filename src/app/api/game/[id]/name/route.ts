import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { getStanding } from "@/lib/game/social";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Място в класацията за приключила игра. Влязъл играч → { kind: "ranked", rank, ... };
// гост → { kind: "guest" } (по желание { name } — име само за „Предизвикай приятел“).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/game/[id]/name">) {
  if (!rateLimit(`name:${clientIp(req)}`, 30, 60_000)) return tooManyRequests();
  return handle(async () => {
    const { id } = await ctx.params;
    const body: unknown = await req.json().catch(() => null);
    const name = typeof body === "object" && body !== null && "name" in body && typeof body.name === "string" ? body.name : undefined;
    return Response.json(await getStanding(id, name));
  });
}
