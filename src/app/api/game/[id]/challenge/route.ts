import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { challengeCodeFor } from "@/lib/game/social";

// „Предизвикай приятел“: код за линка към същите песни.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/game/[id]/challenge">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ code: await challengeCodeFor(id) });
  });
}
