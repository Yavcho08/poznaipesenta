import "server-only";
import { randomInt } from "node:crypto";
import { todayInSofia } from "@/lib/game/daily-shared";
import { cleanPlayerName, rankBest, rankOf, type RankedEntry, type ScoreEntry } from "@/lib/game/leaderboard";
import { createSession, describeSource, GameError } from "@/lib/game/server";
import { parseSource } from "@/lib/game/source";
import { prisma } from "@/lib/prisma";
import { getViewer, type Owner } from "@/lib/auth/viewer";
import type { Prisma, Track } from "@/generated/prisma/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// --- Място в класацията ---
// В класациите участват само влезли потребители (с име). Гостът може да въведе име само за
// „Предизвикай приятел“ (приятелят вижда от кого е) — то не влиза в класациите.

export type Standing =
  | { kind: "ranked"; name: string; rank: number | null; board: Board }
  | { kind: "no_username" }
  | { kind: "guest"; name: string | null };

export async function getStanding(sessionId: string, rawGuestName?: string): Promise<Standing> {
  const session = await prisma.game.findUnique({ where: { id: sessionId } });
  if (!session?.finishedAt) throw new GameError("Играта още не е свършила", 409);
  const viewer = await getViewer();
  if (viewer && session.userId === viewer.userId) {
    const name = viewer.profile.username;
    if (!name) return { kind: "no_username" };
    const board = boardFor(session.sourceType, session.sourceRef);
    return { kind: "ranked", name, rank: rankOf(await loadEntries(board), name), board };
  }
  const name = rawGuestName === undefined ? null : cleanPlayerName(rawGuestName);
  if (name && !session.userId) await prisma.game.update({ where: { id: sessionId }, data: { playerName: name } });
  return { kind: "guest", name: name ?? session.playerName };
}

// --- Класации ---

/**
 * daily — днешното (или дадената дата); week/month — последните 7/30 дни (по желание за един източник);
 * archive — старите резултати по име отпреди профилите.
 */
export type Board =
  | { kind: "daily"; date: string }
  | { kind: "week"; sourceRef: string | null }
  | { kind: "month"; sourceRef: string | null }
  | { kind: "archive" };

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function boardFor(sourceType: string | null, sourceRef: string | null): Board {
  if (sourceType === "daily" && sourceRef) return { kind: "daily", date: sourceRef };
  return { kind: "week", sourceRef: sourceType === "challenge" ? null : sourceRef };
}

async function loadEntries(board: Board): Promise<ScoreEntry[]> {
  if (board.kind === "archive") {
    const rows = await prisma.game.findMany({
      where: { userId: null, guestId: null, playerName: { not: null }, finishedAt: { not: null }, gameType: "listen" },
      orderBy: { total: "desc" },
      take: 1000,
      select: { playerName: true, total: true, finishedAt: true, createdAt: true },
    });
    return rows.map((r) => ({ name: r.playerName ?? "", total: r.total, at: (r.finishedAt ?? r.createdAt).getTime() }));
  }
  const period: Prisma.GameWhereInput =
    board.kind === "daily"
      ? { sourceType: "daily", sourceRef: board.date }
      : {
          // Предизвикателствата повтарят чужди песни, а дневното си има своя класация.
          sourceType: { notIn: ["daily", "challenge"] },
          ...(board.sourceRef ? { sourceRef: board.sourceRef } : {}),
        };
  const rows = await prisma.game.findMany({
    where: {
      ...period,
      finishedAt: { not: null, ...(board.kind === "daily" ? {} : { gte: new Date(Date.now() - (board.kind === "month" ? MONTH_MS : WEEK_MS)) }) },
      gameType: "listen",
      user: { username: { not: null } },
    },
    orderBy: { total: "desc" },
    take: 2000,
    select: { total: true, finishedAt: true, createdAt: true, user: { select: { username: true } } },
  });
  return rows.map((r) => ({ name: r.user?.username ?? "", total: r.total, at: (r.finishedAt ?? r.createdAt).getTime() }));
}

export async function getLeaderboard(board: Board, limit = 20): Promise<RankedEntry[]> {
  return rankBest(await loadEntries(board), limit);
}

export function todayBoard(): Board {
  return { kind: "daily", date: todayInSofia() };
}

/** Източниците, за които има резултати тази седмица — за филтъра в страницата „Класация“. */
export async function weeklySources(): Promise<{ sourceRef: string; label: string; count: number }[]> {
  const rows = await prisma.game.groupBy({
    by: ["sourceRef"],
    where: {
      finishedAt: { gte: new Date(Date.now() - WEEK_MS) },
      sourceType: { notIn: ["daily", "challenge"] },
      gameType: "listen",
      user: { username: { not: null } },
    },
    _count: { _all: true },
  });
  const out: { sourceRef: string; label: string; count: number }[] = [];
  for (const row of rows) {
    if (!row.sourceRef) continue;
    try {
      const source = parseSource(JSON.parse(row.sourceRef));
      if (source) out.push({ sourceRef: row.sourceRef, label: await describeSource(source), count: row._count._all });
    } catch {
      // стар/невалиден sourceRef — пропускаме
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

// --- Предизвикай приятел ---

function newCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Кодът за линка „Предизвикай приятел“ (създава се при първото поискване). */
export async function challengeCodeFor(sessionId: string): Promise<string> {
  const session = await prisma.game.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("Играта не е намерена", 404);
  if (!session.finishedAt) throw new GameError("Довърши играта, за да предизвикаш приятел", 409);
  if (session.challengeCode) return session.challengeCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const updated = await prisma.game
      .update({ where: { id: sessionId }, data: { challengeCode: code } })
      .catch(() => null);
    if (updated) return code;
  }
  throw new GameError("Не успях да създам линк. Опитай пак.", 500);
}

export interface ChallengeInfo {
  code: string;
  name: string;
  total: number;
  label: string;
  /** Само точки и стъпка по рундове — без заглавия, за да не се издават песните. */
  rounds: { points: number; solvedAtStep: number | null }[];
}

export async function getChallenge(code: string): Promise<ChallengeInfo> {
  const session = await prisma.game.findUnique({
    where: { challengeCode: code },
    include: { rounds: { orderBy: { index: "asc" } }, user: { select: { username: true } } },
  });
  if (!session?.finishedAt) throw new GameError("Предизвикателството не е намерено", 404);
  let label = "";
  if (session.sourceType === "daily") label = "Дневно предизвикателство";
  else if (session.sourceRef) {
    try {
      const source = parseSource(JSON.parse(session.sourceRef));
      if (source) label = await describeSource(source);
    } catch {
      label = "";
    }
  }
  return {
    code,
    name: session.user?.username ?? session.playerName ?? "Приятел",
    total: session.total,
    label,
    rounds: session.rounds.map((r) => ({ points: r.points, solvedAtStep: r.solvedStep })),
  };
}

/** Нова игра със същите песни в същия ред. */
export async function createChallengeGame(code: string, owner: Owner): Promise<string> {
  const session = await prisma.game.findUnique({
    where: { challengeCode: code },
    include: { rounds: { orderBy: { index: "asc" }, include: { track: true } } },
  });
  if (!session) throw new GameError("Предизвикателството не е намерено", 404);
  const tracks: Track[] = session.rounds.flatMap((r) => (r.track ? [r.track] : []));
  return createSession({ sourceType: "challenge", sourceRef: code }, tracks, owner);
}

export function isChallengeCode(value: string): boolean {
  return /^[a-z0-9]{8}$/.test(value);
}
