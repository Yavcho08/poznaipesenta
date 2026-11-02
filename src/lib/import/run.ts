import "server-only";
import { DeezerError, getPlaylist, getPlaylistTracks as getDeezerPlaylistTracks, type DeezerTrack } from "@/lib/deezer";
import { isDeezerShortLink, parseDeezerPlaylistId, parseSpotifyPlaylistId } from "@/lib/import/links";
import { matchToDeezer } from "@/lib/import/match";
import type { SourceTrack } from "@/lib/import/similarity";
import { getPlaylistTracks as getSpotifyPlaylistTracks, SpotifyApiError } from "@/lib/import/spotify-api";
import { readSpotifyEmbed } from "@/lib/import/spotify-embed";
import { prisma } from "@/lib/prisma";
import { upsertDeezerTrack } from "@/lib/tracks";
import type { PlaylistSource } from "@/generated/prisma/client";

export type ImportRequest =
  | { kind: "deezer"; url: string }
  | { kind: "spotify-api"; playlistId: string }
  | { kind: "spotify-link"; url: string };

export type ImportEvent =
  | { type: "start"; name: string; total: number; notice?: string }
  | { type: "progress"; done: number; total: number; ready: number }
  | { type: "done"; playlistId: string; name: string; ready: number; total: number; missing: string[] }
  | { type: "error"; message: string };

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// Без лимит на броя песни. Скоростта се определя от ограничението на Deezer (~45 заявки / 5 сек.),
// а не от паралелността — 8 работника стигат, за да е винаги запълнено.
const CONCURRENCY = 8;
// Spotify embed страницата връща само първите 100 песни.
const EMBED_LIMIT = 100;

/** Подготвен внос: източникът е прочетен, остава съпоставяне + запис (може да е бавно). */
export interface PreparedImport {
  name: string;
  source: PlaylistSource;
  externalId: string;
  total: number;
  /** Предупреждение за потребителя (напр. „само първите 100 песни“). */
  notice?: string;
  run: (emit: (e: ImportEvent) => void) => Promise<void>;
}

async function resolveDeezerId(url: string): Promise<string> {
  let target = url.trim();
  if (isDeezerShortLink(target)) {
    // Кратките линкове от приложението пренасочват към deezer.com/…/playlist/ID.
    const res = await fetch(target, { redirect: "follow", cache: "no-store" }).catch(() => null);
    target = res?.url ?? target;
  }
  const id = parseDeezerPlaylistId(target);
  if (!id) throw new ImportError("Това не прилича на линк към Deezer плейлист.");
  return id;
}

function label(t: SourceTrack): string {
  return `${t.title} – ${t.artists.join(", ")}`;
}

async function save(
  meta: { name: string; source: PlaylistSource; externalId: string; total: number },
  tracks: DeezerTrack[],
): Promise<string> {
  const playlist = await prisma.playlist.upsert({
    where: { source_externalId: { source: meta.source, externalId: meta.externalId } },
    update: { name: meta.name, sourceTotal: meta.total },
    create: { name: meta.name, source: meta.source, externalId: meta.externalId, sourceTotal: meta.total },
  });

  // Set пази реда на добавяне и маха повторенията (една песен два пъти в плейлиста).
  const ids = new Set<string>();
  for (const t of tracks) ids.add((await upsertDeezerTrack(t)).id);
  await prisma.$transaction([
    prisma.playlistTrack.deleteMany({ where: { playlistId: playlist.id } }),
    prisma.playlistTrack.createMany({ data: [...ids].map((trackId, position) => ({ playlistId: playlist.id, trackId, position })) }),
  ]);
  return playlist.id;
}

function isPlayable(t: DeezerTrack): boolean {
  return t.readable !== false && Boolean(t.preview);
}

/**
 * Съпоставя песните с Deezer паралелно. `known` са вече намерени (напр. песни от Deezer плейлист
 * с откъс); за останалите се търси версия с откъс. Подредбата на плейлиста се запазва.
 */
async function matchAll(
  sources: SourceTrack[],
  known: (DeezerTrack | null)[],
  emit: (e: ImportEvent) => void,
): Promise<{ found: DeezerTrack[]; missing: string[] }> {
  const total = sources.length;
  const results = [...known];
  const todo = results.flatMap((t, i) => (t ? [] : [i]));
  let done = total - todo.length;
  let ready = done;
  emit({ type: "progress", done, total, ready });

  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = todo[next++];
      const match = await matchToDeezer(sources[i]).catch(() => null);
      results[i] = match?.track ?? null;
      done++;
      if (match) ready++;
      emit({ type: "progress", done, total, ready });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return {
    found: results.filter((t): t is DeezerTrack => t !== null),
    missing: sources.filter((_, i) => results[i] === null).map(label),
  };
}

function prepare(
  meta: { name: string; source: PlaylistSource; externalId: string },
  sources: SourceTrack[],
  known: (DeezerTrack | null)[],
  notice?: string,
): PreparedImport {
  const total = sources.length;
  return {
    ...meta,
    total,
    notice,
    run: async (emit) => {
      const { found, missing } = await matchAll(sources, known, emit);
      const playlistId = await save({ ...meta, total }, found);
      emit({ type: "done", playlistId, name: meta.name, ready: found.length, total, missing });
    },
  };
}

function prepareDeezer(id: string, name: string, tracks: DeezerTrack[]): PreparedImport {
  // Песни без откъс (напр. недостъпни в BG) — търсим друга версия на същата песен.
  const sources: SourceTrack[] = tracks.map((t) => ({
    title: t.title,
    artists: [t.artist.name],
    isrc: t.isrc ?? null,
    durationMs: t.duration ? t.duration * 1000 : null,
  }));
  return prepare({ name, source: "deezer", externalId: id }, sources, tracks.map((t) => (isPlayable(t) ? t : null)));
}

function prepareSpotify(id: string, name: string, tracks: SourceTrack[], notice?: string): PreparedImport {
  return prepare({ name, source: "spotify", externalId: id }, tracks, tracks.map(() => null), notice);
}

/**
 * Чете източника (бързо). Трябва да се извика преди да започне стриймингът на отговора,
 * защото Spotify входът ползва бисквитки на заявката.
 */
export async function prepareImport(req: ImportRequest): Promise<PreparedImport> {
  if (req.kind === "deezer") {
    const id = await resolveDeezerId(req.url);
    try {
      const meta = await getPlaylist(id);
      const tracks = await getDeezerPlaylistTracks(id);
      return prepareDeezer(id, meta.title, tracks);
    } catch (error) {
      if (error instanceof DeezerError) throw new ImportError("Плейлистът не е намерен в Deezer или не е публичен.");
      throw error;
    }
  }

  if (req.kind === "spotify-api") {
    try {
      const { name, tracks } = await getSpotifyPlaylistTracks(req.playlistId);
      return prepareSpotify(req.playlistId, name, tracks);
    } catch (error) {
      // Development Mode: песните на чужд (следван) плейлист не се дават → публичният линк.
      if (!(error instanceof SpotifyApiError && error.status === 403)) throw error;
      return prepareSpotifyEmbed(req.playlistId);
    }
  }

  const id = parseSpotifyPlaylistId(req.url);
  if (!id) throw new ImportError("Това не прилича на линк към Spotify плейлист.");
  return prepareSpotifyEmbed(id);
}

async function prepareSpotifyEmbed(id: string): Promise<PreparedImport> {
  const { name, tracks } = await readSpotifyEmbed(id);
  if (tracks.length === 0) throw new ImportError("Плейлистът е празен.");
  // Embed страницата не казва общия брой — точно 100 означава, че вероятно има още.
  const notice =
    tracks.length >= EMBED_LIMIT
      ? `Внесени са първите ${EMBED_LIMIT} песни — за чужди плейлисти Spotify не дава повече. За всички песни: в Spotify добави песните в свой плейлист и го внеси през „Свържи Spotify“, или използвай Deezer линк.`
      : undefined;
  return prepareSpotify(id, name, tracks, notice);
}

export function parseImportRequest(body: unknown): ImportRequest | null {
  if (typeof body !== "object" || body === null || !("kind" in body)) return null;
  const str = (key: string): string | null => {
    const v = (body as Record<string, unknown>)[key];
    return typeof v === "string" && v.length > 0 && v.length < 500 ? v : null;
  };
  if (body.kind === "deezer" && str("url")) return { kind: "deezer", url: str("url")! };
  if (body.kind === "spotify-link" && str("url")) return { kind: "spotify-link", url: str("url")! };
  if (body.kind === "spotify-api" && str("playlistId")) return { kind: "spotify-api", playlistId: str("playlistId")! };
  return null;
}
