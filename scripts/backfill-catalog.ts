// Допълва каталога от Deezer (еднократно след миграцията; може да се пуска многократно —
// продължава оттам, докъдето е стигнал):
//  1. песни без дължина → пълният обект: албум, дата, ISRC, дуети, има ли откъс (is_active);
//  2. албуми без тип → album/single/ep/compile и точната дата;
//  3. година на всяка песен = най-ранната от версиите ѝ (src/lib/catalog/year.ts).
//
//   npm run catalog:backfill [-- --only=tracks|albums|years]
import "./env";
import { DeezerError, DEEZER_NOT_FOUND, getAlbum, getTrack } from "@/lib/deezer";
import { upsertDeezerTrack } from "@/lib/catalog/tracks";
import { dateYear, earliestYear, isrcYear, parseDeezerDate } from "@/lib/catalog/year";
import { songKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";

const CONCURRENCY = 8;

async function pool<T>(items: T[], label: string, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let done = 0;
  let failed = 0;
  const started = Date.now();
  async function worker(): Promise<void> {
    while (next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (error) {
        failed++;
        console.error(`  ! ${error instanceof Error ? error.message : String(error)}`);
      }
      done++;
      if (done % 250 === 0 || done === items.length) {
        const rate = done / ((Date.now() - started) / 1000);
        const left = Math.round((items.length - done) / rate / 60);
        console.log(`  ${label}: ${done}/${items.length}${failed ? ` (грешки: ${failed})` : ""} · ~${left} мин.`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function backfillTracks(): Promise<void> {
  const todo = await prisma.track.findMany({
    where: { duration: null, deactivatedReason: null },
    select: { id: true, deezerId: true, artistId: true },
  });
  console.log(`1) Песни за допълване: ${todo.length}`);
  await pool(todo, "песни", async (t) => {
    try {
      await upsertDeezerTrack(await getTrack(t.deezerId), t.artistId);
    } catch (error) {
      if (error instanceof DeezerError && error.code === DEEZER_NOT_FOUND) {
        await prisma.track.update({ where: { id: t.id }, data: { isActive: false, deactivatedReason: "not_found" } });
        return;
      }
      throw error;
    }
  });
}

async function backfillAlbums(): Promise<void> {
  const todo = await prisma.album.findMany({ where: { recordType: null }, select: { id: true, deezerId: true } });
  const artists = new Map(
    (await prisma.artist.findMany({ where: { deezerId: { not: null } }, select: { id: true, deezerId: true } })).map((a) => [
      a.deezerId,
      a.id,
    ]),
  );
  console.log(`2) Албуми за допълване: ${todo.length}`);
  await pool(todo, "албуми", async (a) => {
    try {
      const full = await getAlbum(a.deezerId);
      const releaseDate = parseDeezerDate(full.release_date);
      const artistId = full.artist ? artists.get(String(full.artist.id)) : undefined;
      await prisma.album.update({
        where: { id: a.id },
        data: {
          recordType: full.record_type ?? "unknown",
          ...(releaseDate && { releaseDate }),
          ...(artistId && { artistId }),
          ...(full.cover_big && { coverUrl: full.cover_big }),
        },
      });
    } catch (error) {
      if (error instanceof DeezerError && error.code === DEEZER_NOT_FOUND) {
        await prisma.album.update({ where: { id: a.id }, data: { recordType: "unknown" } });
        return;
      }
      throw error;
    }
  });
}

/** Годината на всяка песен = най-ранната от всичките ѝ версии в базата. */
async function recomputeYears(): Promise<void> {
  const tracks = await prisma.track.findMany({
    select: { id: true, title: true, artistName: true, isrc: true, releaseDate: true, releaseYear: true, album: { select: { releaseDate: true } } },
  });
  const own = new Map(
    tracks.map((t) => [t.id, earliestYear(dateYear(t.releaseDate), dateYear(t.album?.releaseDate), isrcYear(t.isrc), t.releaseYear)]),
  );
  const bySong = new Map<string, number>();
  for (const t of tracks) {
    const year = own.get(t.id);
    if (year == null) continue;
    const key = songKey(t.title, t.artistName);
    bySong.set(key, Math.min(year, bySong.get(key) ?? Infinity));
  }
  const changes = tracks.flatMap((t) => {
    const year = bySong.get(songKey(t.title, t.artistName)) ?? own.get(t.id) ?? null;
    return year !== t.releaseYear ? [{ id: t.id, year }] : [];
  });
  console.log(`3) Години за поправка: ${changes.length} от ${tracks.length}`);
  for (let i = 0; i < changes.length; i += 20) {
    await Promise.all(
      changes.slice(i, i + 20).map((c) => prisma.track.update({ where: { id: c.id }, data: { releaseYear: c.year } })),
    );
  }
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  console.log(`База: ${new URL(process.env.DATABASE_URL ?? "postgres://?").host}`);
  if (!only || only === "tracks") await backfillTracks();
  if (!only || only === "albums") await backfillAlbums();
  if (!only || only === "years") await recomputeYears();

  const [active, inactive, withYear, total, albums] = await Promise.all([
    prisma.track.count({ where: { isActive: true } }),
    prisma.track.groupBy({ by: ["deactivatedReason"], where: { isActive: false }, _count: { _all: true } }),
    prisma.track.count({ where: { releaseYear: { not: null } } }),
    prisma.track.count(),
    prisma.album.groupBy({ by: ["recordType"], _count: { _all: true } }),
  ]);
  console.log(`\nАктивни песни: ${active}/${total}; с година: ${withYear}`);
  console.log("Неактивни:", Object.fromEntries(inactive.map((r) => [r.deactivatedReason ?? "?", r._count._all])));
  console.log("Албуми по тип:", Object.fromEntries(albums.map((r) => [r.recordType ?? "?", r._count._all])));
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
