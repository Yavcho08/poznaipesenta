import type { NextRequest } from "next/server";
import { quizRoundRef, quizRoundState } from "@/lib/engine/server";
import type { QuizType } from "@/lib/engine/types";
import { handle, parseRoundIndex } from "@/lib/game/http";
import { GameError } from "@/lib/game/server";

/**
 * Корицата за „Познай албума“ в размер според стъпката. Клиентът получава само мъничкото
 * изображение (6×6 … 56×56 px) и го уголемява с image-rendering: pixelated — истинската
 * корица не може да се извади от него. След края на рунда — цялата.
 */
const SIZES = [6, 10, 16, 28, 56] as const;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/quiz/[id]/rounds/[index]/cover">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    const round = await quizRoundRef(id, parseRoundIndex(index));
    const url = round.album?.coverUrl;
    if (!url || !/^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(url)) throw new GameError("Няма корица", 404);
    const { step, done } = quizRoundState(round, round.game.gameType as QuizType);
    const size = done ? 500 : SIZES[step];
    const upstream = await fetch(url.replace(/\/\d+x\d+-/, `/${size}x${size}-`), { cache: "no-store" });
    if (!upstream.ok) throw new GameError("Корицата не можа да се зареди", 502);
    return new Response(await upstream.arrayBuffer(), {
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "no-store" },
    });
  });
}
