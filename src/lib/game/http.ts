import "server-only";
import { GameError } from "@/lib/game/server";

/** Превръща грешките в JSON отговор с текст на български. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GameError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Нещо се обърка. Опитай пак." }, { status: 500 });
  }
}

export function parseRoundIndex(value: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) throw new GameError("Невалиден рунд");
  return index;
}
