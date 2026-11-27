import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ownerWhere, type Owner } from "@/lib/auth/viewer";
import { formatDate, seededRandom, todayInSofia } from "@/lib/game/daily-shared";
import { describeSource, GameError, poolWhere } from "@/lib/game/server";
import { DEFAULT_SOURCE, parseSource, type GameSource } from "@/lib/game/source";
import { prisma } from "@/lib/prisma";
import { generateRounds, NotEnoughData, type RoundSpec } from "./generators";
import { normalizedScore } from "@/lib/game/score";
import { evaluate, inputFits, isQuizFinished } from "./scoring";
import { QUIZZES, type Attempt, type QuizInput, type QuizRoundView, type QuizType, type QuizView, type StoredQuestion } from "./types";

const roundsInclude = { rounds: { orderBy: { index: "asc" } } } as const;
type GameWithRounds = Prisma.GameGetPayload<{ include: typeof roundsInclude }>;

// --- Пул и създаване ---

async function loadPool(source: GameSource) {
  return prisma.track.findMany({
    where: poolWhere(source),
    include: { album: true, artist: true, artists: true },
  });
}

async function buildRounds(type: QuizType, source: GameSource, random: () => number): Promise<RoundSpec[]> {
  // „Кой пее?“ е смислена само с много изпълнители — винаги от целия поп-фолк.
  const effective = type === "singer" && source.type === "artists" ? DEFAULT_SOURCE : source;
  try {
    return generateRounds(type, await loadPool(effective), random);
  } catch (error) {
    if (error instanceof NotEnoughData) throw new GameError(error.message, 409);
    throw error;
  }
}

/** Рундовете на дневния вариант (едни и същи за всички; пазят се за деня). */
async function dailyRounds(type: QuizType, date: string): Promise<RoundSpec[]> {
  const key = { date_gameType: { date, gameType: type } };
  const existing = await prisma.dailyChallenge.findUnique({ where: key });
  if (existing?.payload && Array.isArray(existing.payload)) return existing.payload as unknown as RoundSpec[];
  const rounds = await buildRounds(type, DEFAULT_SOURCE, seededRandom(`${date}:${type}`));
  try {
    await prisma.dailyChallenge.create({
      data: {
        date,
        gameType: type,
        trackIds: rounds.map((r) => r.trackId).filter((id): id is string => id !== null),
        payload: rounds as unknown as Prisma.InputJsonValue,
      },
    });
    return rounds;
  } catch (error) {
    // Друга заявка го е създала междувременно — ползваме нейния избор.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    const row = await prisma.dailyChallenge.findUniqueOrThrow({ where: key });
    return row.payload as unknown as RoundSpec[];
  }
}

export async function createQuiz(type: QuizType, options: { source?: GameSource; daily?: boolean }, owner: Owner): Promise<string> {
  if (options.daily) {
    const date = todayInSofia();
    const existing = await prisma.game.findFirst({
      where: { ...ownerWhere(owner), mode: "daily", gameType: type, sourceRef: date },
      select: { id: true },
    });
    if (existing) return existing.id;
    return saveQuiz(type, { mode: "daily", sourceType: "daily", sourceRef: date }, await dailyRounds(type, date), owner);
  }
  const source = options.source ?? DEFAULT_SOURCE;
  const rounds = await buildRounds(type, source, Math.random);
  return saveQuiz(type, { mode: "free", sourceType: source.type, sourceRef: JSON.stringify(source) }, rounds, owner);
}

async function saveQuiz(
  type: QuizType,
  meta: { mode: string; sourceType: string; sourceRef: string },
  rounds: RoundSpec[],
  owner: Owner,
): Promise<string> {
  const game = await prisma.game.create({
    data: {
      ...meta,
      ...ownerWhere(owner),
      gameType: type,
      rounds: {
        create: rounds.map((r, index) => ({
          index,
          trackId: r.trackId,
          albumId: r.albumId,
          artistId: r.artistId,
          question: r.question as unknown as Prisma.InputJsonValue,
          attempts: [],
        })),
      },
    },
  });
  return game.id;
}

// --- Състояние ---

function stored(round: GameWithRounds["rounds"][number]): StoredQuestion {
  return round.question as unknown as StoredQuestion;
}

function attemptsOf(round: GameWithRounds["rounds"][number]): Attempt[] {
  return Array.isArray(round.attempts) ? (round.attempts as unknown as Attempt[]) : [];
}

function roundDone(type: QuizType, attempts: Attempt[]): boolean {
  if (attempts.some((a) => a.correct)) return true;
  if (type === "cover") return attempts.length >= 5;
  return attempts.length > 0;
}

async function quizLabel(game: GameWithRounds): Promise<string> {
  const title = QUIZZES[game.gameType as QuizType]?.title ?? "Игра";
  if (game.mode === "daily" && game.sourceRef) return `${title} · Дневно ${formatDate(game.sourceRef)}`;
  try {
    const source = game.sourceRef ? parseSource(JSON.parse(game.sourceRef)) : null;
    return source && source.type !== "popfolk" ? `${title} · ${await describeSource(source)}` : title;
  } catch {
    return title;
  }
}

function toView(game: GameWithRounds, label: string): QuizView {
  const type = game.gameType as QuizType;
  const rounds: QuizRoundView[] = game.rounds.map((round) => {
    const q = stored(round);
    const attempts = attemptsOf(round);
    const done = roundDone(type, attempts);
    return {
      index: round.index,
      question: q.public,
      attempts,
      step: Math.min(attempts.length, 4),
      done,
      correct: attempts.some((a) => a.correct),
      points: round.points,
      answer: done ? q.answer : null,
      reveal: done ? q.reveal : null,
    };
  });
  const finished = game.finishedAt !== null || isQuizFinished(type, rounds);
  // В серия неизиграните рундове след грешката не се показват.
  const visible = finished && (type === "newer" || type === "higher") ? rounds.filter((r) => r.done) : rounds;
  const current = finished ? undefined : rounds.find((r) => !r.done);
  return {
    id: game.id,
    type,
    label,
    daily: game.mode === "daily" ? game.sourceRef : null,
    rounds: visible,
    currentRound: current ? current.index : null,
    total: rounds.reduce((sum, r) => sum + r.points, 0),
    finished,
  };
}

async function loadQuiz(id: string): Promise<GameWithRounds> {
  const game = await prisma.game.findUnique({ where: { id }, include: roundsInclude });
  if (!game || !(game.gameType in QUIZZES)) throw new GameError("Играта не е намерена", 404);
  return game;
}

export async function getQuiz(id: string): Promise<QuizView> {
  const game = await loadQuiz(id);
  return toView(game, await quizLabel(game));
}

// --- Ход ---

export function parseQuizInput(body: unknown): QuizInput | null {
  if (typeof body !== "object" || body === null || !("kind" in body)) return null;
  const b = body as Record<string, unknown>;
  switch (b.kind) {
    case "skip":
      return { kind: "skip" };
    case "option":
      return typeof b.id === "string" && b.id.length < 20 ? { kind: "option", id: b.id } : null;
    case "pair":
      return b.pick === "left" || b.pick === "right" ? { kind: "pair", pick: b.pick } : null;
    case "year":
      return typeof b.year === "number" && Number.isFinite(b.year) ? { kind: "year", year: Math.round(b.year) } : null;
    case "order":
      return Array.isArray(b.ids) && b.ids.length <= 10 && b.ids.every((x) => typeof x === "string" && x.length < 20)
        ? { kind: "order", ids: b.ids as string[] }
        : null;
    default:
      return null;
  }
}

export interface MoveResult {
  quiz: QuizView;
  correct: boolean;
  points: number;
}

export async function answerQuiz(id: string, index: number, input: QuizInput, elapsedMs?: number): Promise<MoveResult> {
  const game = await loadQuiz(id);
  const type = game.gameType as QuizType;
  if (game.finishedAt || isQuizFinished(type, toView(game, "").rounds)) throw new GameError("Играта вече свърши", 409);
  const round = game.rounds.find((r) => r.index === index);
  if (!round) throw new GameError("Рундът не е намерен", 404);
  const attempts = attemptsOf(round);
  if (roundDone(type, attempts)) throw new GameError("Рундът вече е приключил", 409);
  // Рундовете се играят поред.
  const firstOpen = game.rounds.find((r) => !roundDone(type, attemptsOf(r)));
  if (firstOpen && firstOpen.index !== index) throw new GameError("Първо довърши предишния рунд", 409);
  const question = stored(round);
  if (!inputFits(question, input)) throw new GameError("Невалиден отговор");
  // Вече опитан вариант (корица) не се брои пак.
  if (input.kind === "option" && attempts.some((a) => a.input.kind === "option" && a.input.id === input.id)) {
    throw new GameError("Този отговор вече е опитан");
  }

  const result = evaluate(type, question, attempts, input);
  const all: Attempt[] = [...attempts, { input, correct: result.correct }];
  const now = new Date();
  const elapsed = elapsedMs === undefined ? undefined : Math.min(Math.max(0, Math.round(elapsedMs)), 10 * 60 * 1000);
  await prisma.gameRound.update({
    where: { id: round.id },
    data: {
      attempts: all as unknown as Prisma.InputJsonValue,
      points: result.points,
      solvedStep: result.correct ? attempts.length : null,
      startedAt: round.startedAt ?? new Date(now.getTime() - (elapsed ?? 0)),
      ...(result.done && { finishedAt: now, ...(elapsed !== undefined && { answerMs: elapsed }) }),
    },
  });

  const updated = await loadQuiz(id);
  const view = toView(updated, await quizLabel(updated));
  if (view.finished && !updated.finishedAt) {
    const score = normalizedScore(type, view.total, view.rounds.length, view.rounds.filter((r) => r.correct).length);
    await prisma.game.updateMany({ where: { id, finishedAt: null }, data: { finishedAt: new Date(), total: view.total, score } });
  }
  return { quiz: view, correct: result.correct, points: result.points };
}

/** Песента/албумът на рунда за звука и корицата (без да се издава в мрежата). */
export async function quizRoundRef(id: string, index: number) {
  const round = await prisma.gameRound.findFirst({
    where: { gameId: id, index },
    include: { track: true, album: true, game: { select: { gameType: true } } },
  });
  if (!round || !(round.game.gameType in QUIZZES)) throw new GameError("Рундът не е намерен", 404);
  return round;
}

export function quizRoundState(round: { attempts: Prisma.JsonValue }, type: QuizType): { step: number; done: boolean } {
  const attempts = Array.isArray(round.attempts) ? (round.attempts as unknown as Attempt[]) : [];
  return { step: Math.min(attempts.length, 4), done: roundDone(type, attempts) };
}
