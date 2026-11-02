import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { getGame } from "@/lib/game/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/game/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ game: await getGame(id) });
  });
}
