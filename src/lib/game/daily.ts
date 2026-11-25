import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { seededRandom, todayInSofia } from "@/lib/game/daily-shared";
import { ROUNDS_PER_GAME } from "@/lib/game/rules";
import { createSession, GameError, getPool, pickPlayableTracks } from "@/lib/game/server";
import { prisma } from "@/lib/prisma";
import type { Track } from "@/generated/prisma/client";
import { ownerWhere, type Owner } from "@/lib/auth/viewer";

/**
 * Песните за деня — едни и същи за всички. Избират се веднъж (първата заявка за деня)
 * с генератор, зависещ от датата, и се записват, за да не се променят през деня.
 */
async function dailyTracks(date: string): Promise<Track[]> {
  const key = { date_gameType: { date, gameType: "listen" } };
  const existing = await prisma.dailyChallenge.findUnique({ where: key });
  if (!existing) {
    const tracks = await pickPlayableTracks(await getPool({ type: "popfolk" }), ROUNDS_PER_GAME, seededRandom(date));
    if (tracks.length < ROUNDS_PER_GAME) throw new GameError("Няма достатъчно поп-фолк песни за днешното предизвикателство", 503);
    try {
      await prisma.dailyChallenge.create({ data: { date, trackIds: tracks.map((t) => t.id) } });
    } catch (error) {
      // Друга заявка го е създала междувременно — ползваме нейния избор.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }

  const row = await prisma.dailyChallenge.findUniqueOrThrow({ where: key });
  const ids = Array.isArray(row.trackIds) ? row.trackIds.filter((id): id is string => typeof id === "string") : [];
  const tracks = await prisma.track.findMany({ where: { id: { in: ids } } });
  const byId = new Map(tracks.map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter((t): t is Track => t !== undefined);
}

/** Днешната игра на играча: една на ден — ако вече е започната (на което и да е устройство), продължава тя. */
export async function createDailyGame(owner: Owner): Promise<{ id: string; date: string }> {
  const date = todayInSofia();
  const existing = await prisma.game.findFirst({
    where: { ...ownerWhere(owner), mode: "daily", gameType: "listen", sourceRef: date },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, date };
  const tracks = await dailyTracks(date);
  if (tracks.length < ROUNDS_PER_GAME) throw new GameError("Днешното предизвикателство не е налично", 503);
  return { id: await createSession({ sourceType: "daily", sourceRef: date }, tracks, owner), date };
}
