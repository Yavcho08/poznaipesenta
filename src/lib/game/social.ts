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

// --- Класации по XP и по артист ---

export interface XpEntry {
  rank: number;
  name: string;
  xp: number;
}

/** Общата класация: всички профили с име по XP (кеширано в profiles.xp след всяка игра). */
export async function getXpBoard(limit = 50): Promise<XpEntry[]> {
  const rows = await prisma.profile.findMany({
    where: { username: { not: null }, xp: { gt: 0 } },
    orderBy: [{ xp: "desc" }, { createdAt: "asc" }],
    take: limit,
    select: { username: true, xp: true },
  });
  return rows.map((r, i) => ({ rank: i + 1, name: r.username ?? "", xp: r.xp }));
}

export interface ArtistEntry {
  rank: number;
  name: string;
  solved: number;
  played: number;
  /** 0–100 */
  accuracy: number;
}

/** Кой познава най-добре артиста: познати песни в „Познай песента“ (поне 5 изиграни). */
export async function getArtistBoard(artistId: string, limit = 50): Promise<ArtistEntry[]> {
  const rows = await prisma.$queryRaw<{ name: string; solved: number; played: number }[]>`
    SELECT p.username AS name,
           count(*) FILTER (WHERE gr.solved_step IS NOT NULL)::int AS solved,
           count(*)::int AS played
    FROM game_rounds gr
    JOIN games g ON g.id = gr.game_id
    JOIN profiles p ON p.id = g.user_id
    WHERE g.game_type = 'listen' AND gr.artist_id = ${artistId} AND gr.finished_at IS NOT NULL AND p.username IS NOT NULL
    GROUP BY p.username
    HAVING count(*) >= 5
    ORDER BY solved DESC, played ASC
    LIMIT ${limit}`;
  return rows.map((r, i) => ({ ...r, rank: i + 1, accuracy: r.played ? Math.round((r.solved / r.played) * 100) : 0 }));
}

// --- Класация по нормализирани точки (games.score, до 1000 на игра) ---

export type ScorePeriod = "week" | "month";

export interface ScoreRow {
  rank: number;
  name: string;
  score: number;
  games: number;
}

/**
 * gameType = null → „Всички игри“: сбор от точките на всички игри за периода.
 * Иначе — най-добрата игра от този вид за периода.
 */
export async function getScoreBoard(options: { period: ScorePeriod; gameType: string | null }, limit = 50): Promise<ScoreRow[]> {
  const since = new Date(Date.now() - (options.period === "month" ? MONTH_MS : WEEK_MS));
  const groups = await prisma.game.groupBy({
    by: ["userId"],
    where: {
      finishedAt: { gte: since },
      score: { not: null },
      userId: { not: null },
      user: { username: { not: null } },
      ...(options.gameType && { gameType: options.gameType }),
    },
    _sum: { score: true },
    _max: { score: true },
    _count: { _all: true },
  });
  const users = await prisma.profile.findMany({
    where: { id: { in: groups.map((g) => g.userId).filter((id): id is string => id !== null) } },
    select: { id: true, username: true },
  });
  const names = new Map(users.map((u) => [u.id, u.username]));
  const rows = groups
    .map((g) => ({
      name: (g.userId && names.get(g.userId)) || "",
      score: (options.gameType ? g._max.score : g._sum.score) ?? 0,
      games: g._count._all,
    }))
    .filter((r) => r.name)
    .sort((a, b) => b.score - a.score || a.games - b.games || a.name.localeCompare(b.name, "bg"));
  const ranked: ScoreRow[] = [];
  rows.forEach((r, i) => ranked.push({ ...r, rank: i > 0 && rows[i - 1].score === r.score ? ranked[i - 1].rank : i + 1 }));
  return ranked.slice(0, limit);
}
