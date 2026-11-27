// Имена за показване: кирилица, когато я имаме. Чисти функции (общи за клиента, сървъра и тестовете).
// Deezer често дава заглавията/артистите на латиница („Obrechi me na liubov“ / „Azis“), а в базата
// има и кирилско издание на същата песен или кирилско име на артиста. Навсякъде показваме една форма.

import { cleanTitle, looseKey, mainArtist, songKey } from "@/lib/normalize";

const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Заглавието за показване. */
export function shownTitle(t: { title: string; displayTitle?: string | null }): string {
  return t.displayTitle || t.title;
}

/** Изпълнителят за показване. */
export function shownArtist(t: { artistName: string; displayArtist?: string | null }): string {
  return t.displayArtist || t.artistName;
}

export interface DisplayInput {
  id: string;
  title: string;
  artistName: string;
  isrc: string | null;
  artistId: string | null;
  titleOverride: string | null;
  artists: { artistId: string | null; name: string; role: string; position: number }[];
}

export interface DisplayResult {
  displayTitle: string | null;
  displayArtist: string | null;
}

/**
 */
export interface ArtistNames {
  /** id → име за показване */
  byId: Map<string, string>;
  /** looseKey(име, латинско име) → име за показване (за песни без връзка към артист) */
  byKey: Map<string, string>;
}

export function computeDisplayNames(tracks: DisplayInput[], artistNames: ArtistNames): Map<string, DisplayResult> {
  // Изданията на една песен: същото ISRC или същото нормализирано заглавие + артист (транзитивно).
  const parent = tracks.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const firstBy = new Map<string, number>();
  tracks.forEach((t, i) => {
    const keys = [`k:${songKey(t.title, t.artistName)}`];
    if (t.isrc) keys.push(`i:${t.isrc.toUpperCase()}`);
    for (const key of keys) {
      const j = firstBy.get(key);
      if (j === undefined) firstBy.set(key, i);
      else parent[find(i)] = find(j);
    }
  });
  // Кирилските заглавия (без версията) във всяка група.
  const cyrillicByGroup = new Map<number, string[]>();
  tracks.forEach((t, i) => {
    const clean = cleanTitle(t.title) || t.title;
    if (!CYRILLIC.test(clean)) return;
    const root = find(i);
    cyrillicByGroup.set(root, [...(cyrillicByGroup.get(root) ?? []), clean]);
  });

  const result = new Map<string, DisplayResult>();
  tracks.forEach((t, i) => {
    result.set(t.id, { displayTitle: titleFor(t, cyrillicByGroup.get(find(i)) ?? []), displayArtist: artistFor(t, artistNames) });
  });
  return result;
}

function titleFor(t: DisplayInput, cyrillic: string[]): string | null {
  if (t.titleOverride?.trim()) return t.titleOverride.trim();
  if (CYRILLIC.test(t.title)) return null;
  const clean = cleanTitle(t.title) || t.title;
  // Само ако е същото заглавие (по транслитерация) — не превод под същото ISRC.
  const match = cyrillic.find((c) => looseKey(c) === looseKey(clean));
  if (!match) return null;
  // Версията („ (Remix)“, „ - Live“) остава както е.
  const suffix = t.title.startsWith(clean) ? t.title.slice(clean.length) : "";
  return match + suffix;
}

function artistFor(t: DisplayInput, names: ArtistNames): string | null {
  const lookup = (id: string | null, name: string): string | null => (id && names.byId.get(id)) || names.byKey.get(looseKey(name)) || null;
  // Участниците по реда на Deezer (основните първо); без тях — артистът на песента.
  const credits = t.artists.length
    ? [...t.artists].sort((a, b) => (a.role === b.role ? a.position - b.position : a.role === "main" ? -1 : 1))
    : [{ artistId: t.artistId, name: mainArtist(t.artistName) }];
  const parts: string[] = [];
  const seen = new Set<string>();
  let known = false;
  for (const c of credits) {
    const display = lookup(c.artistId, c.name);
    if (display) known = true;
    const name = display ?? c.name;
    if (seen.has(looseKey(name))) continue;
    seen.add(looseKey(name));
    parts.push(name);
  }
  if (!known) return null;
  const shown = parts.join(" & ");
  return shown === t.artistName ? null : shown;
}
