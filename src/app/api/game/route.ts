import type { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth/viewer";
import { handle } from "@/lib/game/http";
import { createGame, getGame } from "@/lib/game/server";
import { createChallengeGame, isChallengeCode } from "@/lib/game/social";
import { DEFAULT_SOURCE, parseSource } from "@/lib/game/source";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Нова игра от 10 рунда.
// Тяло: { source: GameSource } (по подразбиране — поп-фолк) или { challenge: код } — същите песни като приятеля.
export async function POST(req: NextRequest) {
  if (!rateLimit(`game:${clientIp(req)}`, 20, 60_000)) return tooManyRequests();
  return handle(async () => {
    const body: unknown = await req.json().catch(() => null);
    const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const challenge = typeof obj.challenge === "string" && isChallengeCode(obj.challenge) ? obj.challenge : null;
    const owner = await currentOwner();
    const id = challenge
      ? await createChallengeGame(challenge, owner)
      : await createGame(parseSource(obj.source) ?? DEFAULT_SOURCE, owner);
    return Response.json({ game: await getGame(id) }, { status: 201 });
  });
}
