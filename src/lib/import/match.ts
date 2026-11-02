import "server-only";
import { getTrackByIsrc, searchTracks, type DeezerTrack } from "@/lib/deezer";
import { MATCH_THRESHOLD, matchScore, searchQueryFor, type SourceTrack } from "@/lib/import/similarity";

export interface MatchResult {
  track: DeezerTrack;
  via: "isrc" | "search";
}

function hasPreview(t: DeezerTrack): boolean {
  return t.readable !== false && Boolean(t.preview);
}

function best(source: SourceTrack, candidates: DeezerTrack[]): DeezerTrack | null {
  let top: { track: DeezerTrack; score: number } | null = null;
  for (const track of candidates) {
    if (!hasPreview(track)) continue;
    const score = matchScore(source, { title: track.title, artist: track.artist.name, duration: track.duration });
    if (score >= MATCH_THRESHOLD && (!top || score > top.score)) top = { track, score };
  }
  return top?.track ?? null;
}

/**
 * Намира песента в Deezer: първо по ISRC (точно), после по артист + заглавие със сходство.
 * Връща само версия с preview — иначе не може да се играе.
 */
export async function matchToDeezer(source: SourceTrack): Promise<MatchResult | null> {
  if (source.isrc) {
    const byIsrc = await getTrackByIsrc(source.isrc).catch(() => null);
    if (byIsrc && hasPreview(byIsrc)) return { track: byIsrc, via: "isrc" };
  }

  const { strict, loose } = searchQueryFor(source);
  for (const query of [strict, loose]) {
    const found = best(source, await searchTracks(query, 10).catch(() => []));
    if (found) return { track: found, via: "search" };
  }
  return null;
}
