import type { NextRequest } from "next/server";
import { handle } from "@/lib/game/http";
import { setPlayerName } from "@/lib/game/social";

// Име в класацията за приключила игра: { name } → { name, rank, board }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/game/[id]/name">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body: unknown = await req.json().catch(() => null);
    const name = typeof body === "object" && body !== null && "name" in body && typeof body.name === "string" ? body.name : "";
    return Response.json(await setPlayerName(id, name));
  });
}
