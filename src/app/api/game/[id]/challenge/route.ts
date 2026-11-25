import type { NextRequest } from "next/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { handle } from "@/lib/game/http";
import { challengeCodeFor } from "@/lib/game/social";

// „Предизвикай приятел“: код за линка към същите песни.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/game/[id]/challenge">) {
  if (!rateLimit(`challenge:${clientIp(req)}`, 20, 60_000)) return tooManyRequests();
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ code: await challengeCodeFor(id) });
  });
}
