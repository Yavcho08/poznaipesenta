import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getAlbumTracks, getArtistAlbums, getArtistTop, getTrack, type DeezerAlbum, type DeezerTrack } from "@/lib/deezer";
import { upsertDeezerTrack } from "@/lib/catalog/tracks";
import { hasCyrillic, songKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { selectNewTracks, titlesLookBulgarian } from "./filters";

// Нощна синхронизация на каталога с Deezer (/api/cron/sync-catalog или ръчно от админа).
// Обработва артистите поред (по id), пази докъде е стигнала (cursor) и спира преди лимита
// на Vercel функцията — следващото пускане продължава от същото място.

/** Песни с година от тук нататък влизат автоматично в „Нов поп-фолк“. */
export const NEW_POPFOLK_FROM_YEAR = 2020;
const NEW_PLAYLIST_NAME = "Нов поп-фолк";
/** Албуми по-стари от толкова дни не се проверяват за нови песни (освен при първа синхронизация на артиста). */
const RECENT_ALBUM_DAYS = 400;

interface SyncError {
  artist: string;
  message: string;
}

interface Cursor {
  afterArtistId: string | null;
}

export interface SyncSummary {
  runId: string;
  status: "ok" | "partial" | "error";
  artistsProcessed: number;
  newTracks: number;
  updatedTracks: number;
  errors: SyncError[];
  remaining: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
}

async function newPopFolkPlaylist(): Promise<string | null> {
  const playlist = await prisma.playlist.findFirst({ where: { name: NEW_PLAYLIST_NAME, source: "curated" }, select: { id: true } });
  return playlist?.id ?? null;
}

const FOREIGN_CYRILLIC_ISRC = new Set(["RU", "UA", "BY", "KZ"]);

/**
 * Български ли е албумът: ISRC, регистриран в България (BG…), или заглавия на българска кирилица
 * (без руски/украински букви).
 * Deezer понякога слага под един профил песни на чужди изпълнители със същото име
 * (напр. испанска „Ivana“) — за българските артисти такива албуми се пропускат.
 */
async function albumLooksBulgarian(tracks: DeezerTrack[]): Promise<boolean> {
  const first = tracks[0];
  if (!first) return false;
  const full = await getTrack(String(first.id)).catch(() => null);
  const country = full?.isrc?.slice(0, 2).toUpperCase();
  if (country === "BG") return true;
  // Записи, регистрирани в Русия/Украйна/Беларус/Казахстан — чужд изпълнител със същото име.
  if (country && FOREIGN_CYRILLIC_ISRC.has(country)) return false;
  return titlesLookBulgarian([...tracks.map((t) => t.title), first.album?.title ?? ""]);
}

/** Дял (0–1) на „българските“ песни на артиста в базата — над половината → артистът е български. */
async function bulgarianShare(artistId: string): Promise<number> {
  const tracks = await prisma.track.findMany({ where: { artistId }, select: { title: true, isrc: true } });
  if (tracks.length === 0) return 0;
  return tracks.filter((t) => hasCyrillic(t.title) || t.isrc?.toUpperCase().startsWith("BG")).length / tracks.length;
}

async function syncArtist(
  artist: { id: string; name: string; deezerId: string; isPopFolk: boolean },
  patterns: string[],
  newPlaylistId: string | null,
): Promise<{ added: number; updated: number }> {
  // 1) Нови албуми/сингли.
  const albums = await getArtistAlbums(artist.deezerId);
  const known = new Set(
    (await prisma.album.findMany({ where: { deezerId: { in: albums.map((a) => String(a.id)) } }, select: { deezerId: true } })).map((a) => a.deezerId),
  );
  const hasAny = (await prisma.track.count({ where: { artistId: artist.id } })) > 0;
  const cutoff = Date.now() - RECENT_ALBUM_DAYS * 24 * 60 * 60 * 1000;
  const fresh = (albums as (DeezerAlbum & { record_type?: string })[]).filter((a) => {
    if (known.has(String(a.id))) return false;
    // Компилациите са с чужди песни (и стари хитове) — не ги внасяме.
    if (a.record_type === "compile") return false;
    if (!hasAny) return true;
    const date = a.release_date ? Date.parse(a.release_date) : NaN;
    return Number.isNaN(date) || date >= cutoff;
  });

  let added = 0;
  const bulgarian = fresh.length > 0 && (artist.isPopFolk || (await bulgarianShare(artist.id)) >= 0.5);
  if (fresh.length > 0) {
    const existing = new Set(
      (await prisma.track.findMany({ where: { artistId: artist.id }, select: { title: true, artistName: true } })).map((t) => songKey(t.title, t.artistName)),
    );
    for (const album of fresh as (DeezerAlbum & { record_type?: string })[]) {
      // Само песни, на които артистът е основен изпълнител (иначе „гостуващи“ песни биха се водили на него).
      const albumTracks = (await getAlbumTracks(album)).filter((t) => String(t.artist.id) === artist.deezerId);
      const tracks = bulgarian && !(await albumLooksBulgarian(albumTracks)) ? [] : albumTracks;
      const { keep } = selectNewTracks(
        tracks.map((t) => ({ id: String(t.id), title: t.title, version: t.title_version, artist: t.artist.name, hasPreview: Boolean(t.preview) && t.readable !== false })),
        existing,
        patterns,
      );
      const keepIds = new Set(keep.map((k) => k.id));
      for (const t of tracks) {
        if (!keepIds.has(String(t.id))) continue;
        const saved = await upsertDeezerTrack(t, artist.id);
        existing.add(songKey(t.title, t.artist.name));
        added++;
        if (artist.isPopFolk && newPlaylistId && saved.releaseYear !== null && saved.releaseYear >= NEW_POPFOLK_FROM_YEAR) {
          const last = await prisma.playlistTrack.aggregate({ where: { playlistId: newPlaylistId }, _max: { position: true } });
          await prisma.playlistTrack.createMany({
            data: [{ playlistId: newPlaylistId, trackId: saved.id, position: (last._max.position ?? 0) + 1 }],
            skipDuplicates: true,
          });
        }
      }
      // Албумът се записва и без песни (напр. всички филтрирани) — за да не се проверява пак.
      await prisma.album.upsert({
        where: { deezerId: String(album.id) },
        update: { ...(album.record_type && { recordType: album.record_type }) },
        create: {
          deezerId: String(album.id),
          artistId: artist.id,
          title: album.title,
          coverUrl: album.cover_big ?? album.cover_medium ?? null,
          recordType: album.record_type ?? null,
          releaseDate: album.release_date && /^\d{4}-\d{2}-\d{2}$/.test(album.release_date) && !album.release_date.startsWith("0000") ? new Date(`${album.release_date}T00:00:00Z`) : null,
        },
      });
    }
  }

  // 2) Популярност (rank) на съществуващите песни от top 100 на артиста.
  const top = await getArtistTop(artist.deezerId, 100);
  const current = new Map(
    (await prisma.track.findMany({ where: { deezerId: { in: top.map((t) => String(t.id)) } }, select: { id: true, deezerId: true, rank: true } })).map((t) => [t.deezerId, t]),
  );
  const changes = top.flatMap((t) => {
    const row = current.get(String(t.id));
    return row && t.rank !== undefined && row.rank !== t.rank ? [{ id: row.id, rank: t.rank }] : [];
  });
  for (let i = 0; i < changes.length; i += 25) {
    await Promise.all(changes.slice(i, i + 25).map((c) => prisma.track.update({ where: { id: c.id }, data: { rank: c.rank } })));
  }
  return { added, updated: changes.length };
}

/**
 * Пуска (или продължава) синхронизация. `budgetMs` — колко време най-много да работи.
 * Незавършено пускане (partial) от последните 24 часа се продължава от курсора си.
 */
export async function runSync(options: { trigger: "cron" | "manual"; budgetMs: number }): Promise<SyncSummary> {
  const started = Date.now();
  const previous = await prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
  const resume =
    previous && (previous.status === "partial" || previous.status === "running") && Date.now() - previous.startedAt.getTime() < 24 * 60 * 60 * 1000;
  const run = resume
    ? await prisma.syncRun.update({ where: { id: previous.id }, data: { status: "running" } })
    : await prisma.syncRun.create({ data: { trigger: options.trigger, status: "running", cursor: { afterArtistId: null } } });

  const cursor = (run.cursor as unknown as Cursor | null) ?? { afterArtistId: null };
  const errors: SyncError[] = Array.isArray(run.errors) ? (run.errors as unknown as SyncError[]) : [];
  let processed = run.artistsProcessed;
  let added = run.newTracks;
  let updated = run.updatedTracks;
  let after = cursor.afterArtistId;

  const patterns = (await prisma.syncFilter.findMany({ where: { isActive: true }, select: { pattern: true } })).map((f) => f.pattern);
  const newPlaylistId = await newPopFolkPlaylist();
  const artists = await prisma.artist.findMany({
    where: { isActive: true, deezerId: { not: null }, ...(after && { id: { gt: after } }) },
    orderBy: { id: "asc" },
    select: { id: true, name: true, deezerId: true, isPopFolk: true },
  });

  // По няколко артиста наведнъж (общият rate limit към Deezer в src/lib/deezer.ts пази лимита).
  const PARALLEL = 4;
  let index = 0;
  while (index < artists.length) {
    if (Date.now() - started > options.budgetMs) break;
    const chunk = artists.slice(index, index + PARALLEL);
    const results = await Promise.all(
      chunk.map((artist) =>
        syncArtist({ ...artist, deezerId: artist.deezerId as string }, patterns, newPlaylistId).catch((error: unknown) => {
          errors.push({ artist: artist.name, message: message(error) });
          return { added: 0, updated: 0 };
        }),
      ),
    );
    for (const r of results) {
      added += r.added;
      updated += r.updated;
    }
    processed += chunk.length;
    index += chunk.length;
    after = chunk[chunk.length - 1].id;
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        cursor: { afterArtistId: after },
        artistsProcessed: processed,
        newTracks: added,
        updatedTracks: updated,
        errors: errors as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const remaining = artists.length - index;
  const status: SyncSummary["status"] = remaining > 0 ? "partial" : errors.length > 0 && processed === errors.length ? "error" : "ok";
  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status, ...(status !== "partial" && { finishedAt: new Date() }) },
  });
  return { runId: run.id, status, artistsProcessed: processed, newTracks: added, updatedTracks: updated, errors, remaining };
}
