// Нива, XP и серии — чисти функции (общи за клиента, сървъра и тестовете).

/** XP за изиграна игра: точките + 50 за довършване + 100 за дневно. */
export function gameXp(total: number, daily: boolean): number {
  return Math.max(0, total) + 50 + (daily ? 100 : 0);
}

/** XP за отключено постижение. */
export const ACHIEVEMENT_XP = 100;

const BASE = 100;
const EXP = 1.6;

/** Общо XP, нужно за ниво `level` (ниво 1 = 0). Расте плавно: 2 → 100, 5 → 920, 10 → 3374, 20 → 11 140. */
export function xpForLevel(level: number): number {
  return level <= 1 ? 0 : Math.round(BASE * Math.pow(level - 1, EXP));
}

export function levelFromXp(xp: number): number {
  let level = Math.max(1, Math.floor(Math.pow(Math.max(0, xp) / BASE, 1 / EXP)) + 1);
  // Поправка за закръгляне на границите.
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP от началото на текущото ниво */
  into: number;
  /** XP от текущото до следващото ниво */
  span: number;
}

export function levelInfo(xp: number): LevelInfo {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  return { level, xp, into: xp - start, span: xpForLevel(level + 1) - start };
}

/** Ден YYYY-MM-DD + n дни. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface Streak {
  /** Текуща серия (дни поред до днес или до вчера — днешният още може да се изиграе) */
  current: number;
  best: number;
  playedToday: boolean;
}

/** Серия от дни поред с изиграно дневно предизвикателство. `dates` — YYYY-MM-DD (в произволен ред, може с повторения). */
export function computeStreak(dates: string[], today: string): Streak {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const set = new Set(days);
  const playedToday = set.has(today);
  let current = 0;
  let cursor = playedToday ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, best, playedToday };
}
