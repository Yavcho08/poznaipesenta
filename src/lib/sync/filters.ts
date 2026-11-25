// Филтри срещу нежелани версии при синхронизацията — чисти функции (общи за сървъра и тестовете).
// Списъкът с думи е в таблицата sync_filters (редактира се от /admin/sinhronizaciya).

import { songKey } from "@/lib/normalize";

/** Нормализира за сравнение: малки букви, без пунктуация, единични интервали. */
function norm(text: string): string {
  return ` ${text
    .toLocaleLowerCase("bg")
    .replace(/[^\p{L}\d]+/gu, " ")
    .trim()} `;
}

/**
 * Дали заглавието (с версията от Deezer, напр. „(Remix)“) съдържа нежелана дума/фраза.
 * Сравнява се по цели думи: „live“ хваща „Live at…“, но не и „Oliver“.
 */
export function unwantedMatch(title: string, version: string | null | undefined, patterns: string[]): string | null {
  const text = norm(`${title} ${version ?? ""}`);
  for (const p of patterns) {
    const needle = norm(p);
    if (needle.trim() && text.includes(needle)) return p;
  }
  return null;
}

export interface Candidate {
  id: string;
  title: string;
  version?: string | null;
  artist: string;
  hasPreview: boolean;
}

export type SkipReason = "no_preview" | "filtered" | "duplicate";

/**
 * Кои от новите песни да влязат: с откъс, без нежелани версии и без дубликати
 * (същата песен вече е в базата или по-рано в списъка — напр. сингъл и албумна версия).
 */
export function selectNewTracks(
  candidates: Candidate[],
  existingKeys: Set<string>,
  patterns: string[],
): { keep: Candidate[]; skipped: { id: string; reason: SkipReason; detail?: string }[] } {
  const seen = new Set(existingKeys);
  const keep: Candidate[] = [];
  const skipped: { id: string; reason: SkipReason; detail?: string }[] = [];
  for (const c of candidates) {
    if (!c.hasPreview) {
      skipped.push({ id: c.id, reason: "no_preview" });
      continue;
    }
    const match = unwantedMatch(c.title, c.version, patterns);
    if (match) {
      skipped.push({ id: c.id, reason: "filtered", detail: match });
      continue;
    }
    const key = songKey(c.title, c.artist);
    if (seen.has(key)) {
      skipped.push({ id: c.id, reason: "duplicate" });
      continue;
    }
    seen.add(key);
    keep.push(c);
  }
  return { keep, skipped };
}

/**
 * Кирилица, която не е българска: ы э ё і ї є ґ или „ь“, което не е пред „о“ (на български „ь“ е само в „ьо“).
 * Така руски/украински песни под профил със същото име не минават за български.
 */
export function nonBulgarianCyrillic(text: string): boolean {
  const t = text.toLocaleLowerCase("ru");
  return /[ыэёіїєґ]/u.test(t) || /ь(?!о)/u.test(t);
}

/** Албумът изглежда български по заглавията: има кирилица и никъде няма руски/украински белези. */
export function titlesLookBulgarian(titles: string[]): boolean {
  const cyr = titles.some((t) => /\p{Script=Cyrillic}/u.test(t));
  return cyr && !titles.some(nonBulgarianCyrillic);
}
