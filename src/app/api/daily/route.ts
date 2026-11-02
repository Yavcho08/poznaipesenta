import { createDailyGame } from "@/lib/game/daily";
import { handle } from "@/lib/game/http";
import { getGame } from "@/lib/game/server";

// Нова игра от днешното предизвикателство (еднакви песни за всички през деня).
export async function POST() {
  return handle(async () => {
    const { id, date } = await createDailyGame();
    return Response.json({ game: await getGame(id), date }, { status: 201 });
  });
}
