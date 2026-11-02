// Дневно предизвикателство — общо за клиента и сървъра.
import { LAST_STEP, POINTS, ROUNDS_PER_GAME, type GameView } from "@/lib/game/rules";

/** Днешната дата (YYYY-MM-DD) по българско време — новото предизвикателство е в полунощ в София. */
export function todayInSofia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** 2026-10-23 → 23.10.2026 */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** Детерминиран генератор (mulberry32) от низ — една и съща дата дава един и същ ред. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ред квадратчета за рунд: 🟥 грешно, ⬜ пропуснато, 🟩 познато, ⬛ неизползвана стъпка.
 * Пример: познато на третия откъс → 🟥⬜🟩⬛⬛
 */
export function roundSquares(round: GameView["rounds"][number]): string {
  let line = "";
  for (let step = 0; step <= LAST_STEP; step++) {
    const g = round.guesses.find((x) => x.step === step);
    line += !g ? "⬛" : g.kind === "skip" ? "⬜" : g.correct ? "🟩" : "🟥";
  }
  return line;
}

export function shareText(game: GameView, date: string, url: string): string {
  const max = ROUNDS_PER_GAME * POINTS[0];
  const solved = game.rounds.filter((r) => r.solvedAtStep !== null).length;
  return [
    `Познай песента · ${formatDate(date)}`,
    `🎵 ${game.total}/${max} · позна ${solved}/${game.rounds.length}`,
    "",
    ...game.rounds.map(roundSquares),
    "",
    url,
  ].join("\n");
}
