// Статистики — чисти функции върху рундовете на играча (общи за сървъра и тестовете).

import { STEPS } from "@/lib/game/rules";

/** Един изигран рунд (приключил). */
export interface RoundRow {
  gameId: string;
  gameType: string;
  gameTotal: number;
  finishedAt: Date | null;
  trackId: string | null;
  title: string | null;
  artistId: string | null;
  artistName: string | null;
  albumId: string | null;
  albumTitle: string | null;
  releaseYear: number | null;
  /** За „Познай песента“: стъпката (0–4), на която е познато; null = не е познато */
  solvedStep: number | null;
  points: number;
  answerMs: number | null;
  /** Нормализирани точки на играта (до 1000) */
  gameScore?: number | null;
  /** Рундът е изигран (в серия рундовете след грешката не се играят) */
  roundDone?: boolean;
}

export interface ArtistStat {
  artistId: string;
  name: string;
  played: number;
  solved: number;
  /** 0–100 */
  accuracy: number;
  /** Средна стъпка при познаване (0–4) или null */
  avgStep: number | null;
  /** Секунди на средната стъпка (интерполирано между стъпките) */
  avgSeconds: number | null;
  /** Различни познати песни от артиста */
  distinctSolved: number;
}

export const MIN_PLAYED_FOR_RANKING = 5;

/** Секунди за „средна стъпка“ (напр. 1.5 → между 1 и 2 сек.). */
export function stepToSeconds(avgStep: number): number {
  const lo = Math.max(0, Math.min(STEPS.length - 1, Math.floor(avgStep)));
  const hi = Math.min(STEPS.length - 1, lo + 1);
  const t = avgStep - lo;
  return Math.round((STEPS[lo] + (STEPS[hi] - STEPS[lo]) * t) * 10) / 10;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Точност по артист в „Познай песента“: познати / изиграни, средна стъпка, различни познати песни. */
export function artistStats(rows: RoundRow[]): ArtistStat[] {
  const map = new Map<string, { name: string; played: number; solved: number; stepSum: number; tracks: Set<string> }>();
  for (const r of rows) {
    if (r.gameType !== "listen" || !r.artistId) continue;
    const cur = map.get(r.artistId) ?? { name: r.artistName ?? "", played: 0, solved: 0, stepSum: 0, tracks: new Set<string>() };
    cur.played++;
    if (r.solvedStep !== null) {
      cur.solved++;
      cur.stepSum += r.solvedStep;
      if (r.trackId) cur.tracks.add(r.trackId);
    }
    map.set(r.artistId, cur);
  }
  return [...map.entries()]
    .map(([artistId, s]) => {
      const avgStep = s.solved > 0 ? s.stepSum / s.solved : null;
      return {
        artistId,
        name: s.name,
        played: s.played,
        solved: s.solved,
        accuracy: pct(s.solved, s.played),
        avgStep,
        avgSeconds: avgStep === null ? null : stepToSeconds(avgStep),
        distinctSolved: s.tracks.size,
      };
    })
    .sort((a, b) => b.played - a.played || b.accuracy - a.accuracy);
}

/** Какъв дял от другите играчи (с поне MIN_PLAYED изиграни) имат по-ниска точност. 0–100. */
export function percentileBetter(mine: number, others: number[]): number | null {
  if (others.length === 0) return null;
  return pct(others.filter((o) => o < mine).length, others.length);
}

export interface GroupStat {
  key: string;
  label: string;
  played: number;
  solved: number;
  accuracy: number;
}

/** Точност по албум (за един артист) в „Познай песента“. */
export function albumStats(rows: RoundRow[], artistId: string): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const r of rows) {
    if (r.gameType !== "listen" || r.artistId !== artistId || !r.albumId) continue;
    const cur = map.get(r.albumId) ?? { key: r.albumId, label: r.albumTitle ?? "", played: 0, solved: 0, accuracy: 0 };
    cur.played++;
    if (r.solvedStep !== null) cur.solved++;
    map.set(r.albumId, cur);
  }
  return [...map.values()].map((g) => ({ ...g, accuracy: pct(g.solved, g.played) })).sort((a, b) => b.played - a.played);
}

/** Точност по десетилетие в „Познай песента“. */
export function decadeStats(rows: RoundRow[]): GroupStat[] {
  const map = new Map<number, GroupStat>();
  for (const r of rows) {
    if (r.gameType !== "listen" || r.releaseYear === null) continue;
    const decade = Math.floor(r.releaseYear / 10) * 10;
    const cur = map.get(decade) ?? { key: String(decade), label: `${String(decade).slice(2)}-те`, played: 0, solved: 0, accuracy: 0 };
    cur.played++;
    if (r.solvedStep !== null) cur.solved++;
    map.set(decade, cur);
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([, g]) => ({ ...g, accuracy: pct(g.solved, g.played) }));
}

export interface ModeStat {
  gameType: string;
  games: number;
  /** Средно и най-добре — нормализирани точки (до 1000 на игра), както в класацията */
  avgTotal: number;
  best: number;
  /** Изиграни въпроси/песни и верни сред тях */
  played: number;
  correct: number;
  accuracy: number;
}

/** Верен рунд: позната песен / верен отговор (частичните точки не са „верен“). */
export const roundCorrect = (r: RoundRow): boolean => r.solvedStep !== null;
const roundPlayed = (r: RoundRow): boolean => r.roundDone ?? true;

/** Обща точност във всички игри. */
export function overallAccuracy(rows: RoundRow[]): { played: number; correct: number; accuracy: number } {
  const played = rows.filter(roundPlayed);
  const correct = played.filter(roundCorrect).length;
  return { played: played.length, correct, accuracy: played.length ? Math.round((correct / played.length) * 100) : 0 };
}

/** По игра: брой игри, точност, среден и най-добър резултат (довършени игри). */
export function modeStats(rows: RoundRow[]): ModeStat[] {
  const games = new Map<string, { gameType: string; score: number }>();
  for (const r of rows) if (r.finishedAt) games.set(r.gameId, { gameType: r.gameType, score: r.gameScore ?? r.gameTotal });
  const map = new Map<string, { games: number; sum: number; best: number; played: number; correct: number }>();
  const entry = (type: string) => {
    const cur = map.get(type) ?? { games: 0, sum: 0, best: 0, played: 0, correct: 0 };
    map.set(type, cur);
    return cur;
  };
  for (const g of games.values()) {
    const cur = entry(g.gameType);
    cur.games++;
    cur.sum += g.score;
    cur.best = Math.max(cur.best, g.score);
  }
  for (const r of rows) {
    if (!roundPlayed(r)) continue;
    const cur = entry(r.gameType);
    cur.played++;
    if (roundCorrect(r)) cur.correct++;
  }
  return [...map.entries()]
    .map(([gameType, s]) => ({
      gameType,
      games: s.games,
      avgTotal: s.games ? Math.round(s.sum / s.games) : 0,
      best: s.best,
      played: s.played,
      correct: s.correct,
      accuracy: s.played ? Math.round((s.correct / s.played) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games || b.played - a.played);
}

export interface WeekStat {
  /** Понеделник на седмицата, YYYY-MM-DD */
  week: string;
  games: number;
  points: number;
  /** Обща точност във всички игри (0–100) или null без игри */
  accuracy: number | null;
}

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Прогрес по седмици (последните `weeks`, включително текущата; празните седмици също). */
export function weeklyStats(rows: RoundRow[], now: Date, weeks = 12): WeekStat[] {
  const keys: string[] = [];
  const start = new Date(mondayOf(now) + "T00:00:00Z");
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    keys.push(d.toISOString().slice(0, 10));
  }
  const byWeek = new Map(keys.map((k) => [k, { games: new Map<string, number>(), played: 0, solved: 0 }]));
  for (const r of rows) {
    if (!r.finishedAt) continue;
    const w = byWeek.get(mondayOf(r.finishedAt));
    if (!w) continue;
    w.games.set(r.gameId, r.gameScore ?? r.gameTotal);
    if (roundPlayed(r)) {
      w.played++;
      if (roundCorrect(r)) w.solved++;
    }
  }
  return keys.map((week) => {
    const w = byWeek.get(week) as { games: Map<string, number>; played: number; solved: number };
    return {
      week,
      games: w.games.size,
      points: [...w.games.values()].reduce((a, b) => a + b, 0),
      accuracy: w.played > 0 ? pct(w.solved, w.played) : null,
    };
  });
}

export interface SongStat {
  trackId: string;
  title: string;
  artist: string;
  plays: number;
  solves: number;
  bestMs: number | null;
  bestStep: number | null;
}

function songStats(rows: RoundRow[]): SongStat[] {
  const map = new Map<string, SongStat>();
  for (const r of rows) {
    if (r.gameType !== "listen" || !r.trackId) continue;
    const cur = map.get(r.trackId) ?? { trackId: r.trackId, title: r.title ?? "", artist: r.artistName ?? "", plays: 0, solves: 0, bestMs: null, bestStep: null };
    cur.plays++;
    if (r.solvedStep !== null) {
      cur.solves++;
      if (cur.bestStep === null || r.solvedStep < cur.bestStep) cur.bestStep = r.solvedStep;
      if (r.answerMs !== null && (cur.bestMs === null || r.answerMs < cur.bestMs)) cur.bestMs = r.answerMs;
    }
    map.set(r.trackId, cur);
  }
  return [...map.values()];
}

/** Най-бързо познати песни: по стъпка, после по време. */
export function fastestSongs(rows: RoundRow[], limit = 5): SongStat[] {
  return songStats(rows)
    .filter((s) => s.bestStep !== null)
    .sort((a, b) => (a.bestStep ?? 9) - (b.bestStep ?? 9) || (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity))
    .slice(0, limit);
}

/** „Тренирай тези“: песни, които най-често не познаваш (поне веднъж изиграни и с повече пропуски от познавания). */
export function trainSongs(rows: RoundRow[], limit = 8): SongStat[] {
  return songStats(rows)
    .filter((s) => s.plays - s.solves > 0 && s.solves < s.plays / 2)
    .sort((a, b) => b.plays - b.solves - (a.plays - a.solves) || b.plays - a.plays)
    .slice(0, limit);
}

/** Най-силни и най-слаби артисти (с поне MIN_PLAYED_FOR_RANKING изиграни песни). */
export function strongWeak(stats: ArtistStat[], n = 3): { strong: ArtistStat[]; weak: ArtistStat[] } {
  const ranked = stats.filter((s) => s.played >= MIN_PLAYED_FOR_RANKING).sort((a, b) => b.accuracy - a.accuracy || b.played - a.played);
  const strong = ranked.slice(0, n);
  const weak = ranked
    .slice(n)
    .reverse()
    .slice(0, n);
  return { strong, weak };
}
