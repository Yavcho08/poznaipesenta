import type { NextRequest } from "next/server";
import { proxyAudio } from "@/lib/audio-proxy";
import { quizRoundRef } from "@/lib/engine/server";
import { handle, parseRoundIndex } from "@/lib/game/http";
import { GameError } from "@/lib/game/server";

// Звукът на рунда — без да издава коя е песента в мрежовите заявки.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/quiz/[id]/rounds/[index]/audio">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    const round = await quizRoundRef(id, parseRoundIndex(index));
    if (!round.track) throw new GameError("Този рунд няма звук", 404);
    return proxyAudio(round.track);
  });
}
