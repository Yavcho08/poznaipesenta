import type { NextRequest } from "next/server";
import { getQuiz } from "@/lib/engine/server";
import { handle } from "@/lib/game/http";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/quiz/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ quiz: await getQuiz(id) }, { headers: { "Cache-Control": "no-store" } });
  });
}
