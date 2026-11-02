import "server-only";
import { randomInt } from "node:crypto";
import { todayInSofia } from "@/lib/game/daily-shared";
import { cleanPlayerName, rankBest, rankOf, type RankedEntry, type ScoreEntry } from "@/lib/game/leaderboard";
import { createSession, describeSource, GameError } from "@/lib/game/server";
import { parseSource } from "@/lib/game/source";
import { prisma } from "@/lib/prisma";
import type { Track } from "@/generated/prisma/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// --- Име в класацията ---

export interface NameResult {
  name: string;
  /** Място в класацията, в която участва играта (седмица за източника / днешното дневно). */
  rank: number | null;
  board: Board;
}

export async function setPlayerName(sessionId: string, rawName: string): Promise<NameResult> {
  const name = cleanPlayerName(rawName);
  if (!name) throw new GameError("Въведи име");
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: { score: true } });
  if (!session?.score || !session.finishedAt) throw new GameError("Играта още не е свършила", 409);
  await prisma.score.update({ where: { sessionId }, data: { playerName: name } });

  const board = boardFor(session.sourceType, session.sourceRef);
  const entries = await loadEntries(board);
  return { name, rank: rankOf(entries, name), board };
}

// --- Класации ---

/** daily — днешното (или дадената дата); week — последните 7 дни, по желание само за един източник. */
export type Board = { kind: "daily"; date: string } | { kind: "week"; sourceRef: string | null };

function boardFor(sourceType: string | null, sourceRef: string | null): Board {
  if (sourceType === "daily" && sourceRef) return { kind: "daily", date: sourceRef };
  return { kind: "week", sourceRef: sourceType === "challenge" ? null : sourceRef };
}

async function loadEntries(board: Board): Promise<ScoreEntry[]> {
  const rows = await prisma.score.findMany({
    where: {
      playerName: { not: null },
      session:
        board.kind === "daily"
          ? { sourceType: "daily", sourceRef: board.date }
          : {
              finishedAt: { gte: new Date(Date.now() - WEEK_MS) },
              // Предизвикателствата повтарят чужди песни, а дневното си има своя класация.
              sourceType: { notIn: ["daily", "challenge"] },
              ...(board.sourceRef ? { sourceRef: board.sourceRef } : {}),
            },
    },
    orderBy: { total: "desc" },
    take: 1000,
    select: { playerName: true, total: true, createdAt: true },
  });
  return rows.map((r) => ({ name: r.playerName ?? "", total: r.total, at: r.createdAt.getTime() }));
}

export async function getLeaderboard(board: Board, limit = 20): Promise<RankedEntry[]> {
  return rankBest(await loadEntries(board), limit);
}

export function todayBoard(): Board {
  return { kind: "daily", date: todayInSofia() };
}

/** Източниците, за които има резултати тази седмица — за филтъра в страницата „Класация“. */
export async function weeklySources(): Promise<{ sourceRef: string; label: string; count: number }[]> {
  const rows = await prisma.gameSession.groupBy({
    by: ["sourceRef"],
    where: {
      finishedAt: { gte: new Date(Date.now() - WEEK_MS) },
      sourceType: { notIn: ["daily", "challenge"] },
      score: { playerName: { not: null } },
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
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new GameError("Играта не е намерена", 404);
  if (!session.finishedAt) throw new GameError("Довърши играта, за да предизвикаш приятел", 409);
  if (session.challengeCode) return session.challengeCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const updated = await prisma.gameSession
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
  const session = await prisma.gameSession.findUnique({
    where: { challengeCode: code },
    include: { score: true, rounds: { orderBy: { index: "asc" } } },
  });
  if (!session?.score) throw new GameError("Предизвикателството не е намерено", 404);
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
    name: session.score.playerName ?? "Приятел",
    total: session.score.total,
    label,
    rounds: session.rounds.map((r) => ({ points: r.points, solvedAtStep: r.solvedAtStep })),
  };
}

/** Нова игра със същите песни в същия ред. */
export async function createChallengeGame(code: string): Promise<string> {
  const session = await prisma.gameSession.findUnique({
    where: { challengeCode: code },
    include: { rounds: { orderBy: { index: "asc" }, include: { track: true } } },
  });
  if (!session) throw new GameError("Предизвикателството не е намерено", 404);
  const tracks: Track[] = session.rounds.map((r) => r.track);
  return createSession({ sourceType: "challenge", sourceRef: code }, tracks);
}

export function isChallengeCode(value: string): boolean {
  return /^[a-z0-9]{8}$/.test(value);
}
