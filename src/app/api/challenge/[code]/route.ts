import type { NextRequest } from "next/server";
import { GameError } from "@/lib/game/server";
import { handle } from "@/lib/game/http";
import { getChallenge, isChallengeCode } from "@/lib/game/social";

// Резултатът на предизвикващия (точки по рундове, без заглавия).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/challenge/[code]">) {
  return handle(async () => {
    const { code } = await ctx.params;
    if (!isChallengeCode(code)) throw new GameError("Невалиден линк", 400);
    return Response.json(await getChallenge(code));
  });
}
