// Класация — чисти функции (общи за сървъра и тестовете).

export interface ScoreEntry {
  name: string;
  total: number;
  /** ms */
  at: number;
}

export interface RankedEntry extends ScoreEntry {
  rank: number;
}

/** Име за класацията: 1–20 знака, единични интервали. null, ако е празно. */
export function cleanPlayerName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 20);
  return clean || null;
}

/**
 * Всеки играч участва веднъж — с най-добрия си резултат (името без значение от главни/малки букви).
 * При равни точки — по-ранният резултат е по-напред. Равните резултати делят място.
 */
export function rankBest(entries: ScoreEntry[], limit = 20): RankedEntry[] {
  const best = new Map<string, ScoreEntry>();
  for (const e of entries) {
    const key = e.name.toLocaleLowerCase("bg");
    const cur = best.get(key);
    if (!cur || e.total > cur.total || (e.total === cur.total && e.at < cur.at)) best.set(key, e);
  }
  const sorted = [...best.values()].sort((a, b) => b.total - a.total || a.at - b.at);
  const ranked: RankedEntry[] = [];
  sorted.forEach((e, i) => {
    const rank = i > 0 && sorted[i - 1].total === e.total ? ranked[i - 1].rank : i + 1;
    ranked.push({ ...e, rank });
  });
  return ranked.slice(0, limit);
}

/** Мястото на играча (по най-добрия му резултат) или null, ако го няма. */
export function rankOf(entries: ScoreEntry[], name: string): number | null {
  const key = name.toLocaleLowerCase("bg");
  return rankBest(entries, Number.MAX_SAFE_INTEGER).find((e) => e.name.toLocaleLowerCase("bg") === key)?.rank ?? null;
}
