import type { NextRequest } from "next/server";
import { answerQuiz, parseQuizInput } from "@/lib/engine/server";
import { handle, parseRoundIndex } from "@/lib/game/http";
import { GameError } from "@/lib/game/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Отговор в рунд: { kind: "option" | "skip" | "pair" | "year" | "order", ..., elapsedMs? } → { quiz, correct, points }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/quiz/[id]/rounds/[index]">) {
  if (!rateLimit(`quiz-move:${clientIp(req)}`, 120, 60_000)) return tooManyRequests();
  return handle(async () => {
    const { id, index } = await ctx.params;
    const body: unknown = await req.json().catch(() => null);
    const input = parseQuizInput(body);
    if (!input) throw new GameError("Невалиден отговор");
    const elapsed =
      typeof body === "object" && body !== null && "elapsedMs" in body && typeof body.elapsedMs === "number" ? body.elapsedMs : undefined;
    return Response.json(await answerQuiz(id, parseRoundIndex(index), input, elapsed));
  });
}
