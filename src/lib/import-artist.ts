import "server-only";
import {
  getAlbumTracks,
  getArtist,
  getArtistAlbums,
  getArtistTop,
  getTrack,
  searchArtists,
  type DeezerArtist,
} from "@/lib/deezer";
import { hasCyrillic, looseKey, songKey, transliterate } from "@/lib/normalize";

/** Под толкова песни от „top“ списъка добавяме и песни от албумите. */
const MIN_TRACKS_BEFORE_ALBUMS = 40;
const MAX_TRACKS = 100;
import { prisma } from "@/lib/prisma";
import { upsertDeezerTrack } from "@/lib/tracks";

export interface ArtistCandidate {
  id: number;
  name: string;
  fans: number;
  albums: number;
  picture: string | null;
  /** Дял (0–1) от top песните, които изглеждат български. */
  bgScore: number;
  /** Няколко top песни за ориентир при ръчен избор. */
  sample: string[];
}

export type ArtistMatch =
  | { kind: "certain"; candidate: ArtistCandidate; others: ArtistCandidate[] }
  | { kind: "uncertain"; candidates: ArtistCandidate[] }
  | { kind: "none" };

const MIN_FANS = 500;
const DOMINANCE = 3;
const MIN_BG_SCORE = 0.3;
// Колко кандидата (по брой фенове) да проверим по-подробно.
const MAX_CHECKED = 5;

function capitalizeWords(text: string): string {
  return text.replace(/(^|\s)(\p{L})/gu, (_m, space: string, letter: string) => space + letter.toUpperCase());
}

export function latinName(name: string): string {
  return capitalizeWords(transliterate(name));
}

/**
 * Колко „български“ са top песните на профила: кирилица в заглавието/артиста
 * или участие на артист, който вече е в нашата база.
 */
async function bulgarianScore(deezerId: number, knownArtists: Set<string>): Promise<{ score: number; sample: string[] }> {
  const top = await getArtistTop(String(deezerId), 10).catch(() => []);
  if (top.length === 0) return { score: 0, sample: [] };
  const bg = top.filter(
    (t) =>
      hasCyrillic(t.title) ||
      hasCyrillic(t.artist.name) ||
      knownArtists.has(looseKey(t.artist.name)) ||
      (t.contributors ?? []).some((c) => hasCyrillic(c.name) || knownArtists.has(looseKey(c.name))),
  ).length;
  return { score: bg / top.length, sample: top.slice(0, 3).map((t) => t.title) };
}

/**
 * Търси артиста на кирилица и латиница. Deezer често има няколко профила с едно име
 * (напр. „Азис“ с 1 албум и „Azis“ с 81) и чужди артисти със същото име
 * (напр. „Andrea“), затова:
 *  1. оставяме само профили с точно същото нормализирано име;
 *  2. оставяме само „българските“ (по top песните) — освен за чуждестранни артисти;
 *  3. сигурно е само ясно водещото по фенове съвпадение — иначе питаме.
 */
export async function findArtist(name: string, options: { international?: boolean } = {}): Promise<ArtistMatch> {
  const queries = [...new Set([name, latinName(name)])];
  const results = (await Promise.all(queries.map((q) => searchArtists(q, 25)))).flat();

  const wanted = looseKey(name);
  const byId = new Map<number, DeezerArtist>();
  for (const a of results) if (looseKey(a.name) === wanted) byId.set(a.id, a);
  if (byId.size === 0) return { kind: "none" };

  const known = new Set(
    (await prisma.artist.findMany({ select: { name: true, nameLatin: true } }))
      .flatMap((a) => [a.name, a.nameLatin ?? ""])
      .map(looseKey)
      .filter((k) => k && k !== wanted),
  );

  const byFans = [...byId.values()].sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0)).slice(0, MAX_CHECKED);
  const candidates: ArtistCandidate[] = await Promise.all(
    byFans.map(async (a) => {
      const { score, sample } = await bulgarianScore(a.id, known);
      return {
        id: a.id,
        name: a.name,
        fans: a.nb_fan ?? 0,
        albums: a.nb_album ?? 0,
        picture: a.picture_medium ?? null,
        bgScore: score,
        sample,
      };
    }),
  );

  const eligible = options.international ? candidates : candidates.filter((c) => c.bgScore >= MIN_BG_SCORE);
  const [best, second] = eligible;
  if (best) {
    const dominant = !second || best.fans >= second.fans * DOMINANCE;
    if (best.fans >= MIN_FANS && dominant) {
      return { kind: "certain", candidate: best, others: candidates.filter((c) => c.id !== best.id) };
    }
  }
  return { kind: "uncertain", candidates };
}

export interface ImportResult {
  artistId: string;
  deezerId: number;
  name: string;
  imported: number;
  skippedNoPreview: number;
}

/** Записва артиста и top песните му (до 100 — толкова дава Deezer; само с preview). */
export async function importArtist(
  name: string,
  deezerId: number,
  options: { isPopFolk?: boolean; genreSlugs?: string[] } = {},
): Promise<ImportResult> {
  const remote = await getArtist(String(deezerId));
  const genres = (options.genreSlugs ?? []).map((slug) => ({ slug }));

  const artist = await prisma.artist.upsert({
    where: { deezerId: String(deezerId) },
    update: {
      name,
      nameLatin: latinName(name),
      imageUrl: remote.picture_big ?? remote.picture_medium ?? null,
      ...(options.isPopFolk !== undefined && { isPopFolk: options.isPopFolk }),
      ...(genres.length > 0 && { genres: { connect: genres } }),
    },
    create: {
      name,
      nameLatin: latinName(name),
      deezerId: String(deezerId),
      imageUrl: remote.picture_big ?? remote.picture_medium ?? null,
      isPopFolk: options.isPopFolk ?? false,
      genres: { connect: genres },
    },
  });

  const top = await getArtistTop(String(deezerId), 100);
  let imported = 0;
  let skippedNoPreview = 0;

  for (const item of top) {
    if (!item.preview) {
      skippedNoPreview++;
      continue;
    }
    // Годината (за плейлистите по десетилетия) има само в пълния обект на пистата — една заявка
    // повече на песен, затова само за поп-фолк. За останалите стига обектът от top списъка.
    const track = artist.isPopFolk ? await getTrack(String(item.id)) : item;
    await upsertDeezerTrack(track, artist.id);
    imported++;
  }

  // По-малките профили имат само няколко „top“ песни (напр. Десислава — 1), а с под 10 не може
  // да се играе. Допълваме от албумите им (годината идва от албума — без допълнителни заявки).
  if (imported < MIN_TRACKS_BEFORE_ALBUMS) {
    const seen = new Set(top.map((t) => t.id));
    const seenSongs = new Set(top.map((t) => songKey(t.title, t.artist.name)));
    for (const album of await getArtistAlbums(String(deezerId)).catch(() => [])) {
      if (imported >= MAX_TRACKS) break;
      for (const t of await getAlbumTracks(album).catch(() => [])) {
        if (imported >= MAX_TRACKS) break;
        const key = songKey(t.title, t.artist.name);
        if (seen.has(t.id) || seenSongs.has(key)) continue;
        seen.add(t.id);
        seenSongs.add(key);
        if (!t.preview || t.readable === false) {
          skippedNoPreview++;
          continue;
        }
        await upsertDeezerTrack(t, artist.id);
        imported++;
      }
    }
  }

  return { artistId: artist.id, deezerId, name, imported, skippedNoPreview };
}
