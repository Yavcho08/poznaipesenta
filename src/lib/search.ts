import "server-only";
import { getArtistTop, searchArtists, searchTracks, type DeezerTrack } from "@/lib/deezer";
import { artistKey, looseKey, queryVariants, songKey } from "@/lib/normalize";
import { shownArtist, shownTitle } from "@/lib/catalog/display";
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
/** Когато заявката е артист — всичките му песни (после още малко други съвпадения). */
const MAX_WITH_ARTIST = 200;

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

/** Наш артист със същото име (или началото на името, от 4 букви нагоре) — най-популярният. */
async function localArtist(whole: string): Promise<string | null> {
  const artists = await prisma.artist.findMany({
    where: { isActive: true },
    select: { id: true, name: true, nameLatin: true, isPopFolk: true, _count: { select: { tracks: { where: { isActive: true } } } } },
  });
  const keys = (a: (typeof artists)[number]) => [a.name, a.nameLatin ?? ""].map(looseKey).filter(Boolean);
  const exact = artists.filter((a) => keys(a).includes(whole));
  const prefix = whole.length >= 4 ? artists.filter((a) => keys(a).some((k) => k.startsWith(whole))) : [];
  const best = (exact.length ? exact : prefix).sort((a, b) => Number(b.isPopFolk) - Number(a.isPopFolk) || b._count.tracks - a._count.tracks)[0];
  return best?._count.tracks ? best.id : null;
}

/** Всички песни на артиста в играта (основен или участник), по популярност. */
async function localArtistTracks(artistId: string): Promise<Candidate[]> {
  const rows = await prisma.track.findMany({
    where: { isActive: true, OR: [{ artistId }, { artists: { some: { artistId } } }] },
    orderBy: [{ artistId: "asc" }, { rank: "desc" }],
    select: { deezerId: true, title: true, artistName: true, artistId: true, albumCover: true, rank: true },
  });
  // Първо песните, в които е основен, после участията — всяка група по популярност.
  return rows
    .sort((a, b) => Number(b.artistId === artistId) - Number(a.artistId === artistId) || b.rank - a.rank)
    .map((t) => ({ deezerId: t.deezerId, title: t.title, artist: t.artistName, cover: t.albumCover, rank: t.rank }));
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

  const [ourArtist, artistId, trackLists, local] = await Promise.all([
    localArtist(whole),
    matchArtist(variants, whole),
    Promise.all(variants.map((v) => searchTracks(v, 25).catch(() => []))),
    searchLocal(words),
  ]);
  const ourTracks = ourArtist ? await localArtistTracks(ourArtist) : [];

  const artistTracks = artistId
    ? (await getArtistTop(String(artistId), 50).catch(() => []))
        .map(fromDeezer)
        .sort((a, b) => b.rank - a.rank)
    : [];

  const scored = [...trackLists.flat().map(fromDeezer), ...local]
    .map((c) => ({ c, score: relevance(c, words, whole) }))
    .sort((a, b) => b.score - a.score || b.c.rank - a.c.rank);
  // Несвързаните резултати на Deezer (score 0) — само ако няма нищо по-добро.
  const others = (scored.some((x) => x.score > 0) || ourTracks.length || artistTracks.length ? scored.filter((x) => x.score > 0) : scored).map(({ c }) => c);

  // Без дубликати: една песен от различни албуми/версии се показва веднъж.
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const limit = ourTracks.length || artistTracks.length ? MAX_WITH_ARTIST : MAX_RESULTS;
  for (const c of [...ourTracks, ...artistTracks, ...others]) {
    const key = songKey(c.title, c.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ deezerId: c.deezerId, title: c.title, artist: c.artist, cover: c.cover });
    if (results.length === limit) break;
  }
  return withDisplayNames(results);
}

/** Имената както навсякъде в играта: от нашата база (кирилица, когато я имаме). */
async function withDisplayNames(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) return results;
  const [local, artists] = await Promise.all([
    prisma.track.findMany({
      where: { deezerId: { in: results.map((r) => r.deezerId) } },
      select: { deezerId: true, title: true, displayTitle: true, artistName: true, displayArtist: true },
    }),
    prisma.artist.findMany({ select: { name: true, nameLatin: true } }),
  ]);
  const byDeezer = new Map(local.map((t) => [t.deezerId, t]));
  const artistByKey = new Map<string, string>();
  for (const a of artists) for (const n of [a.name, a.nameLatin]) if (n) artistByKey.set(looseKey(n), a.name);
  return results.map((r) => {
    const t = byDeezer.get(r.deezerId);
    if (t) return { ...r, title: shownTitle(t), artist: shownArtist(t) };
    return { ...r, artist: artistByKey.get(looseKey(r.artist)) ?? r.artist };
  });
}
