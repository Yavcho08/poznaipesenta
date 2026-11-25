import "server-only";
import type { DeezerAlbum, DeezerTrack } from "@/lib/deezer";
import { findItunesPreview } from "@/lib/itunes";
import { searchKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import type { Album, Track } from "@/generated/prisma/client";
import { dateYear, earliestYear, isrcYear, parseDeezerDate } from "@/lib/catalog/year";

/** Има ли песента 30-сек. откъс в Deezer. */
export function hasDeezerPreview(track: Pick<DeezerTrack, "preview" | "readable">): boolean {
  return Boolean(track.preview) && track.readable !== false;
}

/** Записва/обновява албума от Deezer обекта (без допълнителни заявки). */
export async function upsertDeezerAlbum(
  album: DeezerAlbum & { record_type?: string },
  artistId?: string | null,
): Promise<Album> {
  const releaseDate = parseDeezerDate(album.release_date);
  const data = {
    title: album.title,
    coverUrl: album.cover_big ?? album.cover_medium ?? null,
    ...(releaseDate && { releaseDate }),
    ...(album.record_type && { recordType: album.record_type }),
    ...(artistId && { artistId }),
  };
  return prisma.album.upsert({
    where: { deezerId: String(album.id) },
    update: data,
    create: { deezerId: String(album.id), ...data },
  });
}

/**
 * Записва/обновява песен от Deezer обект — албум, година, дуети, активност.
 * С пълния обект (`GET /track/{id}`) има ISRC, дължина и всички изпълнители;
 * с частичен (от top/албум/плейлист) — каквото има.
 */
export async function upsertDeezerTrack(full: DeezerTrack, artistId?: string | null): Promise<Track> {
  const album = full.album?.id ? await upsertDeezerAlbum(full.album, artistId) : null;
  const releaseDate = parseDeezerDate(full.release_date) ?? album?.releaseDate ?? null;
  const existing = await prisma.track.findUnique({
    where: { deezerId: String(full.id) },
    select: { releaseYear: true, isActive: true, deactivatedReason: true },
  });
  const releaseYear = earliestYear(dateYear(releaseDate), isrcYear(full.isrc), existing?.releaseYear);
  // Без Deezer откъс песента пак става за игра, ако има резервен в iTunes.
  const playable =
    hasDeezerPreview(full) || Boolean(await findItunesPreview(full.title, full.artist.name).catch(() => null));
  // Ръчно скритите остават скрити; иначе активността следва наличието на откъс.
  const hidden = existing?.deactivatedReason === "hidden" || existing?.deactivatedReason === "duplicate";

  const data = {
    ...(full.isrc && { isrc: full.isrc }),
    title: full.title,
    artistName: full.artist.name,
    albumCover: full.album?.cover_medium ?? null,
    ...(album && { albumId: album.id }),
    releaseDate,
    releaseYear,
    rank: full.rank ?? 0,
    ...(full.duration && { duration: full.duration }),
    searchKey: searchKey(full.title, full.artist.name),
    ...(!hidden && { isActive: playable, deactivatedReason: playable ? null : "no_preview" }),
  };
  const track = await prisma.track.upsert({
    where: { deezerId: String(full.id) },
    // Не махаме вече зададен артист, ако сега идва без такъв (напр. от плейлист).
    update: { ...data, ...(artistId && { artistId }) },
    create: { deezerId: String(full.id), artistId: artistId ?? null, ...data },
  });

  await saveTrackArtists(track.id, full);
  return track;
}

/** Всички изпълнители (contributors в пълния обект; иначе само основният). */
async function saveTrackArtists(trackId: string, full: DeezerTrack): Promise<void> {
  const people = full.contributors?.length
    ? full.contributors
    : [{ id: full.artist.id, name: full.artist.name, role: "Main" }];
  const unique = [...new Map(people.map((p) => [String(p.id), p])).values()];
  const known = new Map(
    (
      await prisma.artist.findMany({
        where: { deezerId: { in: unique.map((p) => String(p.id)) } },
        select: { id: true, deezerId: true },
      })
    ).map((a) => [a.deezerId, a.id]),
  );
  await prisma.$transaction([
    prisma.trackArtist.deleteMany({ where: { trackId } }),
    prisma.trackArtist.createMany({
      data: unique.map((p, position) => ({
        trackId,
        deezerArtistId: String(p.id),
        artistId: known.get(String(p.id)) ?? null,
        name: p.name,
        role: p.id === full.artist.id || p.role === "Main" ? "main" : "featured",
        position,
      })),
    }),
  ]);
}
