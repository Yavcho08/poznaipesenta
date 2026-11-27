import "server-only";
// Преизчислява годините на всички песни и албуми (src/lib/catalog/year.ts → computeYears).
// Пуска се след всяка синхронизация (нощно) и на ръка: npm run catalog:years

import { computeYears } from "@/lib/catalog/year";
import { songKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

export interface YearsSummary {
  tracks: number;
  changedTracks: number;
  changedAlbums: number;
  reliable: number;
}

const BATCH = 2000;

export async function recomputeAllYears(): Promise<YearsSummary> {
  const rows = await prisma.track.findMany({
    select: {
      id: true,
      title: true,
      artistName: true,
      isrc: true,
      releaseDate: true,
      releaseYear: true,
      yearReliable: true,
      albumId: true,
      album: { select: { releaseDate: true } },
    },
  });
  const result = computeYears(
    rows.map((t) => ({ ...t, albumDate: t.album?.releaseDate ?? null })),
    songKey,
  );

  const changed = rows.flatMap((t) => {
    const next = result.tracks.get(t.id);
    return next && (next.year !== t.releaseYear || next.reliable !== t.yearReliable) ? [{ id: t.id, ...next }] : [];
  });
  for (let i = 0; i < changed.length; i += BATCH) {
    const part = changed.slice(i, i + BATCH);
    await prisma.$executeRaw`
      update public.tracks t set release_year = v.y, year_reliable = v.r
      from unnest(${part.map((c) => c.id)}::text[], ${part.map((c) => c.year)}::int[], ${part.map((c) => c.reliable)}::bool[]) as v(id, y, r)
      where t.id = v.id`;
  }

  const albums = await prisma.album.findMany({ select: { id: true, releaseYear: true } });
  const changedAlbums = albums.flatMap((a) => {
    const year = result.albums.get(a.id) ?? null;
    return year !== a.releaseYear ? [{ id: a.id, year }] : [];
  });
  for (let i = 0; i < changedAlbums.length; i += BATCH) {
    const part = changedAlbums.slice(i, i + BATCH);
    await prisma.$executeRaw`
      update public.albums a set release_year = v.y
      from unnest(${part.map((c) => c.id)}::text[], ${part.map((c) => c.year)}::int[]) as v(id, y)
      where a.id = v.id`;
  }

  return {
    tracks: rows.length,
    changedTracks: changed.length,
    changedAlbums: changedAlbums.length,
    reliable: [...result.tracks.values()].filter((t) => t.reliable).length,
  };
}
