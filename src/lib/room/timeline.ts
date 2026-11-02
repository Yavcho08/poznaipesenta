// Времева линия на рунд в стая. Общо за клиента и сървъра.
// Всички започват песента едновременно (откъсът от 0.2 сек. звучи у всички в един и същ момент),
// после всеки играе сам като в нормалната игра — „Пропусни“ и грешен отговор отключват по-дълъг откъс.
// Рундът свършва след ROUND_TIME_S или по-рано, ако всички са готови.

/** Време за песен (сек.). Който не познае дотогава — 0 точки. */
export const ROUND_TIME_S = 45;
/** Показване на верния отговор между рундовете (сек.). */
export const REVEAL_S = 7;
/** Отброяване преди първия рунд (сек.). */
export const COUNTDOWN_S = 4;

export type RoundPhase =
  | { kind: "countdown"; untilMs: number }
  | { kind: "playing"; endsMs: number }
  | { kind: "reveal"; nextRoundMs: number };

/**
 * Фаза на рунда в момента `now` (ms).
 * startMs — началото на рунда; endMs — краят (ранен или пълен).
 */
export function roundPhase(now: number, startMs: number, endMs: number): RoundPhase {
  if (now < startMs) return { kind: "countdown", untilMs: startMs };
  if (now >= endMs) return { kind: "reveal", nextRoundMs: endMs + REVEAL_S * 1000 };
  return { kind: "playing", endsMs: endMs };
}

export function fullRoundEnd(startMs: number): number {
  return startMs + ROUND_TIME_S * 1000;
}
