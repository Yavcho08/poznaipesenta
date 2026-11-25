// Година на излизане на песен — чисти функции (общи за скриптовете, синхронизацията и тестовете).
//
// Deezer дава датата на албума, в който е тази версия на песента. Често е компилация или
// преиздаване (напр. хит от 2003 г. в „Best of 2019“). Затова взимаме НАЙ-РАННОТО от:
//  - датата на албума;
//  - годината в ISRC кода (позиции 6–7: годината на регистрация на записа);
//  - годините на другите версии на същата песен в базата (по songKey).

const MIN_YEAR = 1950;

/** Година от ISRC (напр. BGA261585008 → 2015) или null. */
export function isrcYear(isrc: string | null | undefined, now = new Date()): number | null {
  if (!isrc || !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(isrc)) return null;
  const yy = Number(isrc.slice(5, 7));
  const currentYY = now.getUTCFullYear() % 100;
  // ISRC съществува от 1986 г.: 00..(тази година) → 20xx, иначе 19xx.
  const year = yy <= currentYY ? 2000 + yy : 1900 + yy;
  return year >= 1986 ? year : null;
}

/** Година от дата "YYYY-MM-DD" (или Date); "0000-00-00" и невалидни → null. */
export function dateYear(value: string | Date | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const year = value instanceof Date ? value.getUTCFullYear() : Number(String(value).slice(0, 4));
  return Number.isInteger(year) && year >= MIN_YEAR && year <= now.getUTCFullYear() + 1 ? year : null;
}

/** Най-ранната валидна година или null. */
export function earliestYear(...years: (number | null | undefined)[]): number | null {
  const valid = years.filter((y): y is number => typeof y === "number" && Number.isInteger(y) && y >= MIN_YEAR);
  return valid.length > 0 ? Math.min(...valid) : null;
}

/** Дата "YYYY-MM-DD" от Deezer → Date (UTC полунощ) или null. */
export function parseDeezerDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
