import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { getTrack } from "@/lib/deezer";
import { LAST_STEP, pointsForStep, ROUNDS_PER_GAME, type Answer } from "@/lib/game/rules";
import { describeSource, getPool, pickPlayableTracks } from "@/lib/game/server";
import { parseSource, type GameSource } from "@/lib/game/source";
import { isSameSong } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { COUNTDOWN_S, fullRoundEnd, REVEAL_S, roundPhase } from "@/lib/room/timeline";
import { REACTIONS, ROOM_ROUND_OPTIONS, type RoomPlayerView, type RoomState } from "@/lib/room/types";
import type { Room, Track } from "@/generated/prisma/client";

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RoomError";
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 20;
const ONLINE_MS = 15_000;
// Минимално време между обявяването на рунд и първия откъс — за да го чуят всички.
const MIN_LEAD_MS = 2_000;
// Реакциите се показват толкова време; по-старите се трият при следваща реакция.
const REACTION_VISIBLE_MS = 8_000;
const REACTION_KEEP_MS = 60_000;
// Най-много една реакция на играч за толкова време (срещу спам).
const REACTION_COOLDOWN_MS = 600;

function newCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  if (!clean) throw new RoomError("Въведи име");
  return clean;
}

async function findRoom(code: string): Promise<Room> {
  const room = await prisma.room.findUnique({ where: { code: normalizeCode(code) } });
  if (!room) throw new RoomError("Няма стая с този код", 404);
  return room;
}

function roundEnd(room: Room): number | null {
  if (!room.roundStartAt) return null;
  return room.roundEndAt?.getTime() ?? fullRoundEnd(room.roundStartAt.getTime());
}

// --- Създаване и влизане ---

export async function createRoom(
  source: GameSource,
  hostName: string,
  roundCount: number = ROUNDS_PER_GAME,
): Promise<{ code: string; token: string }> {
  const name = cleanName(hostName);
  const count = (ROOM_ROUND_OPTIONS as readonly number[]).includes(roundCount) ? roundCount : ROUNDS_PER_GAME;
  const tracks = await pickPlayableTracks(await getPool(source), count);
  if (tracks.length < count) {
    throw new RoomError(`В този избор има само ${tracks.length} песни със звук, а са нужни ${count}.`, 409);
  }
  const label = await describeSource(source);
  const token = newToken();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await prisma.room.findUnique({ where: { code } })) continue;
    const room = await prisma.room.create({
      data: {
        code,
        source: JSON.stringify(source),
        label,
        rounds: { create: tracks.map((t, index) => ({ index, trackId: t.id })) },
        players: { create: { name, token } },
      },
      include: { players: true },
    });
    await prisma.room.update({ where: { id: room.id }, data: { hostId: room.players[0].id } });
    return { code, token };
  }
  throw new RoomError("Не успях да създам стая. Опитай пак.", 500);
}

export async function joinRoom(code: string, playerName: string): Promise<{ code: string; token: string }> {
  const room = await findRoom(code);
  const name = cleanName(playerName);
  if (room.status === "finished") throw new RoomError("Играта в тази стая вече свърши");
  const count = await prisma.roomPlayer.count({ where: { roomId: room.id } });
  if (count >= MAX_PLAYERS) throw new RoomError("Стаята е пълна");
  if (await prisma.roomPlayer.findUnique({ where: { roomId_name: { roomId: room.id, name } } })) {
    throw new RoomError("Това име е заето в стаята — избери друго");
  }
  const token = newToken();
  await prisma.roomPlayer.create({ data: { roomId: room.id, name, token } });
  return { code: room.code, token };
}

async function playerByToken(room: Room, token: string | null) {
  if (!token) return null;
  const player = await prisma.roomPlayer.findUnique({ where: { token } });
  return player && player.roomId === room.id ? player : null;
}

export async function startRoom(code: string, token: string): Promise<void> {
  const room = await findRoom(code);
  const player = await playerByToken(room, token);
  if (!player || player.id !== room.hostId) throw new RoomError("Само домакинът може да започне играта", 403);
  if (room.status !== "lobby") throw new RoomError("Играта вече е започнала");
  await prisma.room.updateMany({
    where: { id: room.id, status: "lobby" },
    data: { status: "playing", roundIndex: 0, roundStartAt: new Date(Date.now() + COUNTDOWN_S * 1000), roundEndAt: null },
  });
}

// --- Напредване по времевата линия (при всяко четене) ---

/**
 * Когато текущият рунд свърши, веднага насрочва следващия (след показването на отговора),
 * така че клиентите знаят началото му предварително. Условните updateMany пазят от двойно напредване.
 */
async function advance(room: Room): Promise<Room> {
  const now = Date.now();
  const end = roundEnd(room);
  if (room.status !== "playing" || end === null || now < end) return room;

  const total = await prisma.roomRound.count({ where: { roomId: room.id } });
  if (room.roundIndex + 1 >= total) {
    await prisma.room.updateMany({ where: { id: room.id, roundIndex: room.roundIndex, status: "playing" }, data: { status: "finished" } });
  } else {
    const nextStart = Math.max(end + REVEAL_S * 1000, now + MIN_LEAD_MS);
    await prisma.room.updateMany({
      where: { id: room.id, roundIndex: room.roundIndex },
      data: { roundIndex: room.roundIndex + 1, roundStartAt: new Date(nextStart), roundEndAt: null },
    });
  }
  return prisma.room.findUniqueOrThrow({ where: { id: room.id } });
}

// --- Състояние ---

function toAnswer(track: Track): Answer {
  return { deezerId: track.deezerId, title: track.title, artist: track.artistName, cover: track.albumCover };
}

export async function getRoomState(code: string, token: string | null): Promise<RoomState> {
  const room = await advance(await findRoom(code));
  const me = await playerByToken(room, token);
  const now = Date.now();
  if (me && now - me.lastSeenAt.getTime() > 5_000) {
    await prisma.roomPlayer.update({ where: { id: me.id }, data: { lastSeenAt: new Date(now) } });
  }

  const [players, rounds, guesses, reactions] = await Promise.all([
    prisma.roomPlayer.findMany({ where: { roomId: room.id }, orderBy: { joinedAt: "asc" } }),
    prisma.roomRound.findMany({ where: { roomId: room.id }, orderBy: { index: "asc" }, include: { track: true } }),
    prisma.roomGuess.findMany({ where: { roomId: room.id }, orderBy: { createdAt: "asc" } }),
    prisma.roomReaction.findMany({
      where: { roomId: room.id, createdAt: { gte: new Date(now - REACTION_VISIBLE_MS) } },
      orderBy: { createdAt: "asc" },
      include: { player: { select: { name: true } } },
    }),
  ]);

  const current = room.roundIndex;
  const currentGuesses = guesses.filter((g) => g.roundIndex === current);
  // Отговорът се показва само за приключили рундове (всички преди текущия; при край — всички).
  const revealedUpTo = room.status === "finished" ? rounds.length : current;

  const playerViews: RoomPlayerView[] = players
    .map((p) => {
      const mine = currentGuesses.filter((g) => g.playerId === p.id);
      return {
        id: p.id,
        name: p.name,
        score: p.score,
        isHost: p.id === room.hostId,
        online: now - p.lastSeenAt.getTime() < ONLINE_MS || p.id === me?.id,
        solvedStep: mine.find((g) => g.correct)?.step ?? null,
        triedSteps: mine.map((g) => g.step),
        done: isPlayerDone(mine),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    code: room.code,
    label: room.label,
    status: room.status === "playing" || room.status === "finished" ? room.status : "lobby",
    serverNow: now,
    totalRounds: rounds.length,
    roundIndex: current,
    roundStartAt: room.roundStartAt?.getTime() ?? null,
    roundEndAt: roundEnd(room),
    me: me ? { id: me.id, name: me.name, isHost: me.id === room.hostId } : null,
    players: playerViews,
    myGuesses: me
      ? currentGuesses
          .filter((g) => g.playerId === me.id)
          .map((g) => ({
            step: g.step,
            kind: g.kind === "skip" ? ("skip" as const) : ("guess" as const),
            title: g.title,
            artist: g.artist,
            correct: g.correct,
          }))
      : [],
    history: rounds.slice(0, Math.max(0, revealedUpTo)).map((r) => ({
      index: r.index,
      answer: toAnswer(r.track),
      points: Object.fromEntries(
        guesses.filter((g) => g.roundIndex === r.index && g.correct).map((g) => [g.playerId, g.points]),
      ),
    })),
    nextCode: room.nextCode,
    reactions: reactions.map((r) => ({ id: r.id, emoji: r.emoji, name: r.player.name })),
  };
}

// --- Реакции ---

export async function reactInRoom(code: string, token: string, emoji: string): Promise<void> {
  if (!(REACTIONS as readonly string[]).includes(emoji)) throw new RoomError("Непозната реакция");
  const room = await findRoom(code);
  const player = await playerByToken(room, token);
  if (!player) throw new RoomError("Не си в тази стая", 403);
  const now = Date.now();
  const last = await prisma.roomReaction.findFirst({ where: { playerId: player.id }, orderBy: { createdAt: "desc" } });
  if (last && now - last.createdAt.getTime() < REACTION_COOLDOWN_MS) return;
  await prisma.$transaction([
    prisma.roomReaction.create({ data: { roomId: room.id, playerId: player.id, emoji } }),
    prisma.roomReaction.deleteMany({ where: { roomId: room.id, createdAt: { lt: new Date(now - REACTION_KEEP_MS) } } }),
  ]);
}

// --- Реванш ---

/**
 * Нова стая със същите настройки. Първият, който натисне „Реванш“, я създава и става домакин;
 * останалите влизат в същата (кодът се пази в старата стая като nextCode).
 */
export async function rematch(code: string, token: string): Promise<{ code: string; token: string }> {
  const room = await findRoom(code);
  const player = await playerByToken(room, token);
  if (!player) throw new RoomError("Не си в тази стая", 403);
  if (room.status !== "finished") throw new RoomError("Играта още не е свършила");
  if (room.nextCode) return joinRoom(room.nextCode, player.name);

  const source = parseSource(JSON.parse(room.source));
  if (!source) throw new RoomError("Не успях да създам реванш", 500);
  const count = await prisma.roomRound.count({ where: { roomId: room.id } });
  const created = await createRoom(source, player.name, count);

  // Ако някой друг е създал реванш междувременно — махаме нашата стая и влизаме в неговата.
  const claimed = await prisma.room.updateMany({ where: { id: room.id, nextCode: null }, data: { nextCode: created.code } });
  if (claimed.count === 0) {
    await prisma.room.delete({ where: { code: created.code } });
    const fresh = await findRoom(code);
    return joinRoom(fresh.nextCode!, player.name);
  }
  return created;
}

// --- Ход ---

/** Готов с песента: познал или изчерпал всички стъпки (последното „Пропусни“ = „Предай се“). */
function isPlayerDone(moves: { correct: boolean }[]): boolean {
  return moves.some((m) => m.correct) || moves.length > LAST_STEP;
}

export type RoomMove = { kind: "skip" } | { kind: "guess"; deezerId: string };

export interface RoomMoveResult {
  correct: boolean;
  points: number;
  /** Стъпката, на която е играчът след хода (за следващия по-дълъг откъс). */
  step: number;
  done: boolean;
}

/**
 * Ход в стаята — като в нормалната игра: всеки играч си минава стъпките сам.
 * Грешен отговор или „Пропусни“ → следваща (по-дълга) стъпка; вярно → точки по стъпката.
 * Когато времето изтече, който не е познал, остава с 0 точки за песента.
 */
export async function moveInRoom(code: string, token: string, move: RoomMove): Promise<RoomMoveResult> {
  const room = await advance(await findRoom(code));
  const player = await playerByToken(room, token);
  if (!player) throw new RoomError("Не си в тази стая", 403);
  if (room.status !== "playing" || !room.roundStartAt) throw new RoomError("Няма активна песен");

  const now = Date.now();
  const phase = roundPhase(now, room.roundStartAt.getTime(), roundEnd(room)!);
  if (phase.kind !== "playing") throw new RoomError(phase.kind === "countdown" ? "Песента още не е започнала" : "Времето изтече");

  const previous = await prisma.roomGuess.findMany({ where: { playerId: player.id, roundIndex: room.roundIndex } });
  if (isPlayerDone(previous)) throw new RoomError("Вече си готов с тази песен — изчакай другите");
  const step = previous.length;

  let data: { kind: string; deezerId: string; title: string; artist: string; correct: boolean; points: number };
  if (move.kind === "skip") {
    data = { kind: "skip", deezerId: "", title: "", artist: "", correct: false, points: 0 };
  } else {
    const round = await prisma.roomRound.findUniqueOrThrow({
      where: { roomId_index: { roomId: room.id, index: room.roundIndex } },
      include: { track: true },
    });
    const local = await prisma.track.findUnique({ where: { deezerId: move.deezerId } });
    const chosen = local
      ? { title: local.title, artist: local.artistName }
      : await getTrack(move.deezerId)
          .then((t) => ({ title: t.title, artist: t.artist.name }))
          .catch(() => {
            throw new RoomError("Тази песен не е намерена — избери друга от списъка", 404);
          });
    const correct = isSameSong(chosen, { title: round.track.title, artist: round.track.artistName });
    data = { kind: "guess", deezerId: move.deezerId, ...chosen, correct, points: correct ? pointsForStep(step) : 0 };
  }

  try {
    await prisma.$transaction([
      prisma.roomGuess.create({ data: { roomId: room.id, playerId: player.id, roundIndex: room.roundIndex, step, ...data } }),
      prisma.roomPlayer.update({
        where: { id: player.id },
        data: { score: { increment: data.points }, lastSeenAt: new Date(now) },
      }),
    ]);
  } catch {
    // Два бързи хода едновременно → уникалният ключ (играч, рунд, стъпка) отказва втория.
    throw new RoomError("Ходът вече е записан — опитай пак", 409);
  }

  const moves = [...previous, data];
  const done = isPlayerDone(moves);
  if (done) await endRoundIfAllDone(room, now);
  return { correct: data.correct, points: data.points, step: done ? step : step + 1, done };
}

/** Всички онлайн играчи са готови с песента → рундът свършва по-рано (не се чакат 45 сек.). */
async function endRoundIfAllDone(room: Room, now: number): Promise<void> {
  const [online, moves] = await Promise.all([
    prisma.roomPlayer.findMany({ where: { roomId: room.id, lastSeenAt: { gte: new Date(now - ONLINE_MS) } }, select: { id: true } }),
    prisma.roomGuess.findMany({ where: { roomId: room.id, roundIndex: room.roundIndex }, select: { playerId: true, correct: true } }),
  ]);
  const byPlayer = new Map<string, { correct: boolean }[]>();
  for (const m of moves) byPlayer.set(m.playerId, [...(byPlayer.get(m.playerId) ?? []), m]);
  if (online.length > 0 && online.every((p) => isPlayerDone(byPlayer.get(p.id) ?? []))) {
    await prisma.room.updateMany({
      where: { id: room.id, roundIndex: room.roundIndex, roundEndAt: null },
      data: { roundEndAt: new Date(now) },
    });
  }
}
/** Песента за аудиото на рунд — само текущия и следващия (за предварително зареждане). */
export async function roomRoundTrack(code: string, index: number): Promise<Track> {
  const room = await findRoom(code);
  if (index > Math.max(room.roundIndex, 0) + 1) throw new RoomError("Още не", 403);
  const round = await prisma.roomRound.findUnique({
    where: { roomId_index: { roomId: room.id, index } },
    include: { track: true },
  });
  if (!round) throw new RoomError("Няма такъв рунд", 404);
  return round.track;
}
