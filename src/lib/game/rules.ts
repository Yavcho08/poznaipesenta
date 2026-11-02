// Правила на играта — общи за клиента и сървъра.

/** Дължина на клипа (сек.) за всяка стъпка; всички започват от позиция 0. */
export const STEPS = [0.2, 1, 2, 5, 10] as const;

/** Точки при познаване на съответната стъпка. */
export const POINTS = [100, 80, 60, 40, 20] as const;

export const ROUNDS_PER_GAME = 10;

export const LAST_STEP = STEPS.length - 1;

export type Guess =
  | { step: number; kind: "guess"; deezerId: string; title: string; artist: string; correct: boolean }
  | { step: number; kind: "skip" };

export interface Answer {
  deezerId: string;
  title: string;
  artist: string;
  cover: string | null;
}

export interface RoundView {
  index: number;
  /** Текуща стъпка (0–4); за приключил рунд — стъпката, на която е спрял. */
  step: number;
  done: boolean;
  solvedAtStep: number | null;
  points: number;
  guesses: Guess[];
  /** Само за приключили рундове — иначе би издало отговора. */
  answer: Answer | null;
}

export interface GameView {
  id: string;
  /** Откъде са песните, напр. „Поп-фолк 2010-те“. */
  label: string;
  rounds: RoundView[];
  /** Индекс на първия неприключил рунд; null = играта е свършила. */
  currentRound: number | null;
  total: number;
  finished: boolean;
}

export function pointsForStep(step: number): number {
  return POINTS[step] ?? 0;
}

export function isRoundDone(guesses: Guess[]): boolean {
  return guesses.some((g) => g.kind === "guess" && g.correct) || guesses.length > LAST_STEP;
}
