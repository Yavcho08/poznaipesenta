import "server-only";
import type { DeezerTrack } from "@/lib/deezer";
import { searchKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import type { Track } from "@/generated/prisma/client";

/** Записва/обновява песен от пълния Deezer обект (`GET /track/{id}`). */
export async function upsertDeezerTrack(full: DeezerTrack, artistId?: string | null): Promise<Track> {
  const year = full.release_date ? Number(full.release_date.slice(0, 4)) : null;
  const data = {
    isrc: full.isrc ?? null,
    title: full.title,
    artistName: full.artist.name,
    albumCover: full.album.cover_medium ?? null,
    releaseYear: year && year > 1900 ? year : null,
    rank: full.rank ?? 0,
    searchKey: searchKey(full.title, full.artist.name),
  };
  return prisma.track.upsert({
    where: { deezerId: String(full.id) },
    // Не махаме вече зададен артист, ако сега идва без такъв (напр. от плейлист).
    update: { ...data, ...(artistId ? { artistId } : {}) },
    create: { deezerId: String(full.id), artistId: artistId ?? null, ...data },
  });
}
