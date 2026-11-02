import type { NextRequest } from "next/server";
import { isDeezerId } from "@/lib/deezer";
import { handle, parseRoundIndex } from "@/lib/game/http";
import { GameError, playMove, type Move } from "@/lib/game/server";

function parseMove(body: unknown): Move {
  if (typeof body === "object" && body !== null && "kind" in body) {
    if (body.kind === "skip") return { kind: "skip" };
    if (body.kind === "guess" && "deezerId" in body && typeof body.deezerId === "string" && isDeezerId(body.deezerId)) {
      return { kind: "guess", deezerId: body.deezerId };
    }
  }
  throw new GameError("Невалиден ход");
}

// Ход в рунда: избрана песен или „Пропусни“.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/game/[id]/rounds/[index]">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    const move = parseMove(await req.json().catch(() => null));
    const game = await playMove(id, parseRoundIndex(index), move);
    return Response.json({ game });
  });
}
