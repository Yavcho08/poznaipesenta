// Нормализирани точки за класацията: всяка игра дава най-много 1000, независимо от режима.
// Чиста функция (обща за сървъра, миграцията и тестовете).

export const MAX_GAME_SCORE = 1000;
/** Серия (по-нова / по-популярна): 100 за всеки верен отговор, т.е. 10 поред = 1000. */
export const STREAK_SCORE_PER_CORRECT = 100;

export function normalizedScore(gameType: string, total: number, rounds: number, correct: number): number {
  if (gameType === "newer" || gameType === "higher") return Math.min(MAX_GAME_SCORE, correct * STREAK_SCORE_PER_CORRECT);
  // Всички останали: до 100 на въпрос → мащабираме до 1000 за цялата игра (напр. хронологията е 5 × 100).
  if (rounds <= 0) return 0;
  return Math.max(0, Math.min(MAX_GAME_SCORE, Math.round((total / (rounds * 100)) * MAX_GAME_SCORE)));
}
