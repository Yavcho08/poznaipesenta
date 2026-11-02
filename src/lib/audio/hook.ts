// Откъде в 30-секундния откъс да започват клиповете: най-разпознаваемата част (обикновено припевът).
// Имаме само откъса от Deezer, не цялата песен, затова търсим в него по сила на звука:
// припевът почти винаги е по-силен и по-наситен от куплета и „влиза“ с рязко усилване.
// Без зависимости — само числа, за да е тестваемо.

const FRAME_S = 0.05;
/** Най-дългият клип — началото трябва да остави място за него. */
const MAX_CLIP_S = 10;

// Тежести: кратките клипове (0.2/1/2 сек.) решават играта, затова първите 2 сек. тежат най-много.
const W_FIRST_2S = 0.45;
const W_FIRST_5S = 0.25;
const W_FIRST_10S = 0.15;
const W_ENTRY = 0.35;

function mean(values: Float64Array, from: number, to: number): number {
  const a = Math.max(0, from);
  const b = Math.min(values.length, to);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += values[i];
  return sum / (b - a);
}

/** Сила на звука (RMS) на всеки 50 ms, нормирана към максимума. */
export function frameEnergy(samples: Float32Array, sampleRate: number): Float64Array {
  const size = Math.max(1, Math.round(sampleRate * FRAME_S));
  const count = Math.floor(samples.length / size);
  const energy = new Float64Array(count);
  let max = 0;
  for (let f = 0; f < count; f++) {
    let sum = 0;
    const start = f * size;
    for (let i = start; i < start + size; i++) sum += samples[i] * samples[i];
    energy[f] = Math.sqrt(sum / size);
    if (energy[f] > max) max = energy[f];
  }
  if (max > 0) for (let f = 0; f < count; f++) energy[f] /= max;
  return energy;
}

/**
 * Секундата в откъса, от която да започват клиповете.
 * 0, ако откъсът е твърде къс или тих за анализ.
 */
export function findHookStart(samples: Float32Array, sampleRate: number): number {
  const energy = frameEnergy(samples, sampleRate);
  const perSecond = 1 / FRAME_S;
  const lastStart = energy.length - Math.ceil(MAX_CLIP_S * perSecond);
  if (lastStart <= 0) return 0;

  const f2 = 2 * perSecond;
  const f3 = 3 * perSecond;
  const f5 = 5 * perSecond;
  const f10 = 10 * perSecond;

  let best = 0;
  let bestScore = -Infinity;
  for (let s = 0; s <= lastStart; s++) {
    const first2 = mean(energy, s, s + f2);
    // „Влизане“: колко по-силно е след началото спрямо 3-те секунди преди него.
    // В самото начало на откъса няма „преди“ — не даваме нито бонус, нито наказание.
    const before = s >= f3 ? mean(energy, s - f3, s) : first2;
    const score =
      W_FIRST_2S * first2 +
      W_FIRST_5S * mean(energy, s, s + f5) +
      W_FIRST_10S * mean(energy, s, s + f10) +
      W_ENTRY * Math.max(0, first2 - before);
    // Строго по-голямо: при равенство остава по-ранното начало.
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = s;
    }
  }

  // Подравняване към най-близкия удар (най-голямото усилване) около избраното начало,
  // за да не започва 0.2-секундният клип насред тон.
  let onset = best;
  let bestRise = -Infinity;
  for (let f = Math.max(1, best - perSecond); f <= Math.min(lastStart, best + perSecond / 2); f++) {
    const rise = energy[f] - mean(energy, f - 4, f);
    if (rise > bestRise) {
      bestRise = rise;
      onset = f;
    }
  }
  const chosen = bestRise > 0.05 ? onset : best;
  return Math.round(chosen * FRAME_S * 100) / 100;
}
