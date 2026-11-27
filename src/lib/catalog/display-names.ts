import "server-only";
// Записва имената за показване (tracks.display_title / display_artist) — src/lib/catalog/display.ts.
// Пуска се след нощната синхронизация, след редакция в /admin/imena и на ръка: npm run catalog:names

import { computeDisplayNames } from "@/lib/catalog/display";
import { looseKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

const BATCH = 2000;

export async function recomputeDisplayNames(): Promise<{ tracks: number; changed: number; cyrillicTitles: number }> {
  const [tracks, artists] = await Promise.all([
    prisma.track.findMany({
      select: {
        id: true,
        title: true,
        artistName: true,
        isrc: true,
        artistId: true,
        titleOverride: true,
        displayTitle: true,
        displayArtist: true,
        artists: { select: { artistId: true, name: true, role: true, position: true } },
      },
    }),
    prisma.artist.findMany({ select: { id: true, name: true, nameLatin: true, isPopFolk: true } }),
  ]);
  const byId = new Map(artists.map((a) => [a.id, a.name]));
  const byKey = new Map<string, string>();
  // Поп-фолкът последен — при еднакъв ключ печели той.
  for (const a of [...artists].sort((x, y) => Number(x.isPopFolk) - Number(y.isPopFolk))) {
    for (const n of [a.name, a.nameLatin]) if (n) byKey.set(looseKey(n), a.name);
  }
  const result = computeDisplayNames(tracks, { byId, byKey });
  const changed = tracks.flatMap((t) => {
    const next = result.get(t.id);
    return next && (next.displayTitle !== t.displayTitle || next.displayArtist !== t.displayArtist) ? [{ id: t.id, ...next }] : [];
  });
  for (let i = 0; i < changed.length; i += BATCH) {
    const part = changed.slice(i, i + BATCH);
    await prisma.$executeRaw`
      update public.tracks t set display_title = v.dt, display_artist = v.da
      from unnest(${part.map((c) => c.id)}::text[], ${part.map((c) => c.displayTitle)}::text[], ${part.map((c) => c.displayArtist)}::text[]) as v(id, dt, da)
      where t.id = v.id`;
  }
  return {
    tracks: tracks.length,
    changed: changed.length,
    cyrillicTitles: [...result.values()].filter((r) => r.displayTitle !== null).length,
  };
}
