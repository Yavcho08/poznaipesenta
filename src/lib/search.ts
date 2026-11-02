import "server-only";
import { getArtistTop, searchArtists, searchTracks, type DeezerTrack } from "@/lib/deezer";
import { artistKey, looseKey, queryVariants, songKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

export interface SearchResult {
  deezerId: string;
  title: string;
  artist: string;
  cover: string | null;
}

interface Candidate extends SearchResult {
  rank: number;
}

const MAX_RESULTS = 30;

function fromDeezer(t: DeezerTrack): Candidate {
  return {
    deezerId: String(t.id),
    title: t.title,
    artist: t.artist.name,
    cover: t.album.cover_small ?? t.album.cover_medium ?? null,
    rank: t.rank ?? 0,
  };
}

/** Колко добре съвпада песента със заявката: 2 = начало на заглавие/артист, 1 = всички думи, 0 = друго. */
function relevance(c: Candidate, words: string[], whole: string): number {
  const title = looseKey(c.title);
  const artist = looseKey(c.artist);
  if (title.startsWith(whole) || artist.startsWith(whole)) return 2;
  const haystack = `${title} ${artist}`;
  return words.every((w) => haystack.includes(w)) ? 1 : 0;
}

/** Deezer артист, чието име съвпада със заявката (по нормализирано име), с най-много фенове. */
async function matchArtist(variants: string[], wanted: string): Promise<number | null> {
  const lists = await Promise.all(variants.map((v) => searchArtists(v, 10).catch(() => [])));
  const matches = lists.flat().filter((a) => artistKey(a.name) === wanted);
  if (matches.length === 0) return null;
  matches.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
  return matches[0].id;
}

async function searchLocal(words: string[]): Promise<Candidate[]> {
  if (words.length === 0) return [];
  const rows = await prisma.track.findMany({
    where: { AND: words.map((w) => ({ searchKey: { contains: w } })) },
    orderBy: { rank: "desc" },
    take: 25,
  });
  return rows.map((t) => ({
    deezerId: t.deezerId,
    title: t.title,
    artist: t.artistName,
    cover: t.albumCover,
    rank: t.rank,
  }));
}

/**
 * Търсене за падащото меню. Търси в целия Deezer каталог + нашата база (не само в пула,
 * за да не се издава отговорът), на кирилица и латиница.
 * Ако заявката е име на артист — първо неговите песни по популярност, после останалите.
 */
export async function searchSongs(query: string): Promise<SearchResult[]> {
  const variants = queryVariants(query);
  const whole = looseKey(query);
  const words = query.split(/\s+/).map(looseKey).filter(Boolean);
  if (!whole) return [];

  const [artistId, trackLists, local] = await Promise.all([
    matchArtist(variants, whole),
    Promise.all(variants.map((v) => searchTracks(v, 25).catch(() => []))),
    searchLocal(words),
  ]);

  const artistTracks = artistId
    ? (await getArtistTop(String(artistId), 50).catch(() => []))
        .map(fromDeezer)
        .sort((a, b) => b.rank - a.rank)
    : [];

  const others = [...trackLists.flat().map(fromDeezer), ...local]
    .map((c) => ({ c, score: relevance(c, words, whole) }))
    .sort((a, b) => b.score - a.score || b.c.rank - a.c.rank)
    .map(({ c }) => c);

  // Без дубликати: една песен от различни албуми/версии се показва веднъж.
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const c of [...artistTracks, ...others]) {
    const key = songKey(c.title, c.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ deezerId: c.deezerId, title: c.title, artist: c.artist, cover: c.cover });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}
