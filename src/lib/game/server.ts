import "server-only";
import { prisma } from "@/lib/prisma";
import { getPreviewUrl, getTrack } from "@/lib/deezer";
import { findItunesPreview } from "@/lib/itunes";
import { isSameSong, songKey } from "@/lib/normalize";
import type { Prisma, Track } from "@/generated/prisma/client";
import { parseSource, type GameSource } from "@/lib/game/source";
import { formatDate } from "@/lib/game/daily-shared";
import {
  isRoundDone,
  pointsForStep,
  ROUNDS_PER_GAME,
  type Answer,
  type GameView,
  type Guess,
  type RoundView,
} from "@/lib/game/rules";

export class GameError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GameError";
  }
}

// --- Аудио ---

export interface AudioSource {
  url: string;
  origin: "deezer" | "itunes";
}

/** Свеж URL за звука: Deezer preview, резервно iTunes. */
export async function resolveAudio(track: Pick<Track, "deezerId" | "title" | "artistName">): Promise<AudioSource | null> {
  const deezer = await getPreviewUrl(track.deezerId);
  if (deezer) return { url: deezer, origin: "deezer" };
  const itunes = await findItunesPreview(track.title, track.artistName);
  return itunes ? { url: itunes, origin: "itunes" } : null;
}

// --- Пул и създаване на игра ---

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Всички песни от избрания източник. */
export async function getPool(source: GameSource): Promise<Track[]> {
  switch (source.type) {
    case "popfolk":
      return prisma.track.findMany({ where: { artist: { isPopFolk: true } } });
    case "genre":
      return prisma.track.findMany({ where: { artist: { genres: { some: { slug: source.slug } } } } });
    case "artists":
      return prisma.track.findMany({ where: { artistId: { in: source.ids } } });
    case "playlist":
      return (
        await prisma.playlistTrack.findMany({ where: { playlistId: source.id }, include: { track: true } })
      ).map((pt) => pt.track);
  }
}

/** Име на източника за показване („Поп-фолк“, „Рап“, „Азис, Галена“, име на плейлист). */
export async function describeSource(source: GameSource): Promise<string> {
  switch (source.type) {
    case "popfolk":
      return "Поп-фолк";
    case "genre":
      return (await prisma.genre.findUnique({ where: { slug: source.slug } }))?.name ?? "Жанр";
    case "playlist":
      return (await prisma.playlist.findUnique({ where: { id: source.id } }))?.name ?? "Плейлист";
    case "artists": {
      const artists = await prisma.artist.findMany({ where: { id: { in: source.ids } }, select: { name: true } });
      const names = artists.map((a) => a.name);
      return names.length > 3 ? `${names.slice(0, 3).join(", ")} и още ${names.length - 3}` : names.join(", ");
    }
  }
}

/**
 * Избира `count` случайни песни със звук от пула, без две версии на една песен.
 * Песни без звук се пропускат.
 */
export async function pickPlayableTracks(pool: Track[], count: number, random = Math.random): Promise<Track[]> {
  const seen = new Set<string>();
  const candidates = shuffle(pool, random).filter((track) => {
    const key = songKey(track.title, track.artistName);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Проверяваме на партиди, за да е бързо.
  const picked: Track[] = [];
  const BATCH = 12;
  for (let i = 0; i < candidates.length && picked.length < count; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const audio = await Promise.all(batch.map((track) => resolveAudio(track).catch(() => null)));
    batch.forEach((track, j) => {
      if (audio[j] && picked.length < count) picked.push(track);
    });
  }
  return picked;
}

export async function createGame(source: GameSource): Promise<string> {
  const pool = await getPool(source);
  const picked = await pickPlayableTracks(pool, ROUNDS_PER_GAME);

  if (picked.length < ROUNDS_PER_GAME) {
    throw new GameError(
      `В този избор има само ${picked.length} песни със звук, а са нужни ${ROUNDS_PER_GAME}. Избери повече артисти или друг източник.`,
      409,
    );
  }

  return createSession({ sourceType: source.type, sourceRef: JSON.stringify(source) }, picked);
}

export async function createSession(meta: { sourceType: string; sourceRef: string }, tracks: Track[]): Promise<string> {
  const session = await prisma.gameSession.create({
    data: {
      ...meta,
      rounds: {
        create: tracks.map((track, index) => ({ index, trackId: track.id, guesses: [] })),
      },
    },
  });
  return session.id;
}

// --- Състояние ---

function parseGuesses(value: Prisma.JsonValue): Guess[] {
  return Array.isArray(value) ? (value as unknown as Guess[]) : [];
}

function toAnswer(track: Track): Answer {
  return { deezerId: track.deezerId, title: track.title, artist: track.artistName, cover: track.albumCover };
}

const sessionInclude = { rounds: { include: { track: true }, orderBy: { index: "asc" } } } as const;

type SessionWithRounds = Prisma.GameSessionGetPayload<{ include: typeof sessionInclude }>;

function toView(session: SessionWithRounds, label: string): GameView {
  const rounds: RoundView[] = session.rounds.map((round) => {
    const guesses = parseGuesses(round.guesses);
    const done = isRoundDone(guesses);
    return {
      index: round.index,
      step: done ? guesses.length - 1 : guesses.length,
      done,
      solvedAtStep: round.solvedAtStep,
      points: round.points,
      guesses,
      answer: done ? toAnswer(round.track) : null,
    };
  });
  const current = rounds.find((r) => !r.done);
  return {
    id: session.id,
    label,
    rounds,
    currentRound: current ? current.index : null,
    total: rounds.reduce((sum, r) => sum + r.points, 0),
    finished: !current,
  };
}

export async function getGame(sessionId: string): Promise<GameView> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!session) throw new GameError("Играта не е намерена", 404);
  return toView(session, await sessionLabel(session.sourceType, session.sourceRef));
}

async function sessionLabel(sourceType: string | null, sourceRef: string | null): Promise<string> {
  if (!sourceRef) return "";
  if (sourceType === "daily") return `Дневно предизвикателство · ${formatDate(sourceRef)}`;
  if (sourceType === "challenge") {
    // sourceRef = кодът на предизвикателството; името е на този, който предизвиква.
    const original = await prisma.gameSession.findUnique({ where: { challengeCode: sourceRef }, include: { score: true } });
    const name = original?.score?.playerName ?? "приятел";
    const base = original && original.sourceType !== "challenge" ? await sessionLabel(original.sourceType, original.sourceRef) : "";
    return base ? `Предизвикателство от ${name} · ${base}` : `Предизвикателство от ${name}`;
  }
  try {
    const source = parseSource(JSON.parse(sourceRef));
    return source ? await describeSource(source) : "";
  } catch {
    return "";
  }
}

export async function getRoundTrack(sessionId: string, index: number): Promise<Track> {
  const round = await prisma.round.findUnique({
    where: { sessionId_index: { sessionId, index } },
    include: { track: true },
  });
  if (!round) throw new GameError("Рундът не е намерен", 404);
  return round.track;
}

// --- Ход ---

export type Move = { kind: "skip" } | { kind: "guess"; deezerId: string };

/** Песента, която играчът е избрал: първо от базата, иначе от Deezer. */
async function resolveGuess(deezerId: string): Promise<{ title: string; artist: string }> {
  const local = await prisma.track.findUnique({ where: { deezerId } });
  if (local) return { title: local.title, artist: local.artistName };
  const remote = await getTrack(deezerId).catch(() => {
    throw new GameError("Тази песен не е намерена — избери друга от списъка", 404);
  });
  return { title: remote.title, artist: remote.artist.name };
}

export async function playMove(sessionId: string, index: number, move: Move): Promise<GameView> {
  const round = await prisma.round.findUnique({
    where: { sessionId_index: { sessionId, index } },
    include: { track: true },
  });
  if (!round) throw new GameError("Рундът не е намерен", 404);

  const guesses = parseGuesses(round.guesses);
  if (isRoundDone(guesses)) throw new GameError("Рундът вече е приключил", 409);

  const step = guesses.length;
  let next: Guess;
  if (move.kind === "skip") {
    next = { step, kind: "skip" };
  } else {
    const chosen = await resolveGuess(move.deezerId);
    const correct = isSameSong(chosen, { title: round.track.title, artist: round.track.artistName });
    next = { step, kind: "guess", deezerId: move.deezerId, ...chosen, correct };
  }

  const all = [...guesses, next];
  const solved = next.kind === "guess" && next.correct;
  await prisma.round.update({
    where: { id: round.id },
    data: {
      guesses: all,
      solvedAtStep: solved ? step : null,
      points: solved ? pointsForStep(step) : 0,
    },
  });

  const view = await getGame(sessionId);
  if (view.finished) await finishGame(sessionId, view.total);
  return view;
}

async function finishGame(sessionId: string, total: number): Promise<void> {
  await prisma.$transaction([
    prisma.gameSession.updateMany({ where: { id: sessionId, finishedAt: null }, data: { finishedAt: new Date() } }),
    prisma.score.upsert({ where: { sessionId }, update: { total }, create: { sessionId, total } }),
  ]);
}
