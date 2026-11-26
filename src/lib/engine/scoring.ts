// Точкуване на игрите — чисти функции (общи за сървъра и тестовете).

import type { Answer, Attempt, QuizInput, QuizType, StoredQuestion } from "./types";

/** Корица: 5 стъпки (100/80/60/40/20), както при слушането. */
export const COVER_POINTS = [100, 80, 60, 40, 20] as const;
/** Серия (по-нова / по-популярна): точки за всеки верен отговор. */
export const STREAK_POINTS = 10;
/** Максимален брой рундове в серия (после играта свършва като победа). */
export const STREAK_MAX = 30;

/** Година: 0 разлика = 100, всяка година по -20, от 5 години нагоре = 0. */
export function yearPoints(guess: number, actual: number): number {
  return Math.max(0, 100 - 20 * Math.abs(Math.round(guess) - actual));
}

/**
 * Хронология: коя песен е на точното си място. Позиция i е вярна, ако годината на песента там
 * е i-тата по ред (песни от една година могат да си разменят местата).
 */
export function orderPlacement(guessIds: string[], years: Record<string, number>): boolean[] {
  const sorted = guessIds.map((id) => years[id]).filter((y): y is number => y !== undefined).sort((a, b) => a - b);
  return guessIds.map((id, i) => years[id] !== undefined && years[id] === sorted[i]);
}

/** Хронология: точки само за песните на точното им място (5 песни = по 20), 0–100. */
export function orderPoints(guessIds: string[], years: Record<string, number>): number {
  if (guessIds.length === 0) return 0;
  const placed = orderPlacement(guessIds, years).filter(Boolean).length;
  return Math.round((placed / guessIds.length) * 100);
}

export interface Evaluation {
  correct: boolean;
  points: number;
  done: boolean;
}

/** Валиден ли е ходът за този въпрос. */
export function inputFits(question: StoredQuestion, input: QuizInput): boolean {
  const q = question.public;
  switch (input.kind) {
    case "skip":
      return q.kind === "cover";
    case "option":
      return (q.kind === "cover" || q.kind === "choice" || q.kind === "word") && q.options.some((o) => o.id === input.id);
    case "pair":
      return q.kind === "pair";
    case "year":
      return q.kind === "year" && Number.isFinite(input.year);
    case "order":
      return (
        q.kind === "order" &&
        input.ids.length === q.items.length &&
        new Set(input.ids).size === input.ids.length &&
        input.ids.every((id) => q.items.some((it) => it.id === id))
      );
  }
}

function optionCorrect(answer: Answer, id: string): boolean {
  return answer.kind === "option" && answer.id === id;
}

/** Оценява нов ход спрямо досегашните опити в рунда. */
export function evaluate(type: QuizType, question: StoredQuestion, previous: Attempt[], input: QuizInput): Evaluation {
  const { answer } = question;
  switch (type) {
    case "cover": {
      const step = previous.length;
      const last = step >= COVER_POINTS.length - 1;
      if (input.kind === "option" && optionCorrect(answer, input.id)) return { correct: true, points: COVER_POINTS[step] ?? 0, done: true };
      return { correct: false, points: 0, done: last };
    }
    case "newer":
    case "higher": {
      const correct = input.kind === "pair" && answer.kind === "pair" && answer.correct === input.pick;
      return { correct, points: correct ? STREAK_POINTS : 0, done: true };
    }
    case "year": {
      if (input.kind !== "year" || answer.kind !== "year") return { correct: false, points: 0, done: true };
      const points = yearPoints(input.year, answer.year);
      return { correct: points === 100, points, done: true };
    }
    case "order": {
      if (input.kind !== "order" || answer.kind !== "order") return { correct: false, points: 0, done: true };
      const points = orderPoints(input.ids, answer.years);
      return { correct: points === 100, points, done: true };
    }
    case "album":
    case "singer":
    case "word": {
      const correct = input.kind === "option" && optionCorrect(answer, input.id);
      return { correct, points: correct ? 100 : 0, done: true };
    }
  }
}

/** Свършила ли е играта: серия — при първата грешка; иначе — когато всички рундове са приключили. */
export function isQuizFinished(type: QuizType, rounds: { done: boolean; correct: boolean }[]): boolean {
  if (type === "newer" || type === "higher") return rounds.some((r) => r.done && !r.correct) || rounds.every((r) => r.done);
  return rounds.every((r) => r.done);
}
