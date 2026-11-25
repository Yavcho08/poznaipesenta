import type { NextRequest } from "next/server";
import { currentOwner } from "@/lib/auth/viewer";
import { createDailyGame } from "@/lib/game/daily";
import { handle } from "@/lib/game/http";
import { getGame } from "@/lib/game/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

// Днешното предизвикателство (еднакви песни за всички). Една игра на ден на играч — повторно извикване я продължава.
export async function POST(req: NextRequest) {
  if (!rateLimit(`daily:${clientIp(req)}`, 20, 60_000)) return tooManyRequests();
  return handle(async () => {
    const { id, date } = await createDailyGame(await currentOwner());
    return Response.json({ game: await getGame(id), date }, { status: 201 });
  });
}
