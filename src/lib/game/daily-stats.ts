// Статистика за дневното предизвикателство (като в Wordle). Пази се в браузъра; чисти функции.
import { LAST_STEP, type GameView } from "@/lib/game/rules";

export interface DailyRecord {
  total: number;
  solved: number;
  /** На коя стъпка е познат всеки рунд; null = не е познат. */
  steps: (number | null)[];
}

/** дата (YYYY-MM-DD) → резултат */
export type DailyHistory = Record<string, DailyRecord>;

export interface DailyStats {
  played: number;
  currentStreak: number;
  bestStreak: number;
  average: number;
  best: number;
  /** Брой познати рундове на всяка стъпка (0–4) + последният елемент = непознати. */
  distribution: number[];
}

export function toRecord(game: GameView): DailyRecord {
  return {
    total: game.total,
    solved: game.rounds.filter((r) => r.solvedAtStep !== null).length,
    steps: game.rounds.map((r) => r.solvedAtStep),
  };
}

function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Серия = поредни дни с изиграно предизвикателство. Текущата серия брои до днес,
 * а ако днес още не е изиграно — до вчера (иначе би се „скъсала“ сутринта преди играта).
 */
export function computeStats(history: DailyHistory, today: string): DailyStats {
  const dates = Object.keys(history).sort();
  const records = dates.map((d) => history[d]);

  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of dates) {
    run = prev !== null && previousDay(d) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = d;
  }

  let currentStreak = 0;
  let cursor = history[today] ? today : previousDay(today);
  while (history[cursor]) {
    currentStreak++;
    cursor = previousDay(cursor);
  }

  const distribution = new Array<number>(LAST_STEP + 2).fill(0);
  for (const r of records) {
    for (const step of r.steps) distribution[step === null ? LAST_STEP + 1 : step]++;
  }

  return {
    played: records.length,
    currentStreak,
    bestStreak,
    average: records.length ? Math.round(records.reduce((s, r) => s + r.total, 0) / records.length) : 0,
    best: records.reduce((m, r) => Math.max(m, r.total), 0),
    distribution,
  };
}
