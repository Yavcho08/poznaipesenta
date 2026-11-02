// Сходство между песен от Spotify и кандидат от Deezer. Без зависимости от сървъра.
import { artistKey, cleanTitle, looseKey, mainArtist, titleKey } from "@/lib/normalize";

export interface SourceTrack {
  title: string;
  artists: string[];
  isrc?: string | null;
  durationMs?: number | null;
}

export interface CandidateTrack {
  title: string;
  artist: string;
  /** Секунди (както ги дава Deezer). */
  duration?: number | null;
}

/** Коефициент на Dice върху биграми (0–1). */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      overlap++;
      grams.set(g, n - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

export const MATCH_THRESHOLD = 0.8;

/** 0–1+: колко вероятно кандидатът е същата песен. */
export function matchScore(source: SourceTrack, candidate: CandidateTrack): number {
  const sTitle = titleKey(source.title);
  const cTitle = titleKey(candidate.title);
  const title = sTitle === cTitle ? 1 : dice(sTitle, cTitle);

  const cArtist = artistKey(candidate.artist);
  const artist = Math.max(
    0,
    ...source.artists.map((a) => (looseKey(a) === cArtist ? 1 : dice(looseKey(a), looseKey(mainArtist(candidate.artist))))),
  );

  let durationAdjust = 0;
  if (source.durationMs && candidate.duration) {
    const diff = Math.abs(source.durationMs / 1000 - candidate.duration);
    if (diff <= 3) durationAdjust = 0.05;
    else if (diff > 20) durationAdjust = -0.15;
  }

  return 0.6 * title + 0.4 * artist + durationAdjust;
}

/** Заявка за търсене в Deezer: основен артист + заглавие без „feat./Remix“. */
export function searchQueryFor(source: SourceTrack): { strict: string; loose: string } {
  const artist = source.artists[0] ?? "";
  const title = cleanTitle(source.title);
  return {
    strict: `artist:"${artist.replace(/"/g, "")}" track:"${title.replace(/"/g, "")}"`,
    loose: `${artist} ${title}`.trim(),
  };
}
