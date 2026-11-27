import type { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth/viewer";
import { createQuiz, getQuiz } from "@/lib/engine/server";
import { isQuizType } from "@/lib/engine/types";
import { GameError } from "@/lib/game/server";
import { handle } from "@/lib/game/http";
import { assertSourceAccess } from "@/lib/game/playlists";
import { parseSource } from "@/lib/game/source";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Нова игра от новите режими: { type, source?, daily? } → { quiz }
export async function POST(req: NextRequest) {
  if (!rateLimit(`quiz:${clientIp(req)}`, 20, 60_000)) return tooManyRequests();
  return handle(async () => {
    const body: unknown = await req.json().catch(() => null);
    const obj = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (!isQuizType(obj.type)) throw new GameError("Непозната игра");
    const owner = await currentOwner();
    const source = parseSource(obj.source) ?? undefined;
    if (source && obj.daily !== true) await assertSourceAccess(source, owner.userId ?? null);
    const id = await createQuiz(obj.type, { source, daily: obj.daily === true }, owner);
    return Response.json({ quiz: await getQuiz(id) }, { status: 201 });
  });
}
