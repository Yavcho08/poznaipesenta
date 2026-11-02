// Копира каталога (жанрове, артисти, песни, плейлисти, дневни предизвикателства) от локалната
// SQLite база в Postgres. Игрите и стаите не се копират — те са временни.
//
//   DATABASE_URL="postgresql://…" npx prisma generate      (клиент за Postgres)
//   DATABASE_URL="postgresql://…" npx tsx --conditions=react-server scripts/copy-to-postgres.ts [път/до/dev.db]
//   npx prisma generate                                     (обратно към SQLite)
//
// Записите се добавят с skipDuplicates — скриптът може да се пусне повторно.
import Database from "better-sqlite3";
import { isPostgresUrl, prisma } from "@/lib/prisma";

const SQLITE_PATH = process.argv[2] ?? "prisma/dev.db";
const BATCH = 500;
// Postgres поддържа skipDuplicates, SQLite — не. Локално клиентът обикновено е за SQLite, затова опцията
// е скрита от типовете (иначе typecheck гърми); скриптът винаги се пуска срещу Postgres клиент.
const SKIP_DUPLICATES = { skipDuplicates: true } as object;

type Row = Record<string, unknown>;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// SQLite пази DateTime като ms (число) или ISO низ, а Boolean като 0/1.
const date = (v: unknown): Date => new Date(typeof v === "number" ? v : String(v));
const bool = (v: unknown): boolean => v === 1 || v === true;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function main(): Promise<void> {
  if (!isPostgresUrl(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL трябва да е Postgres адрес");
  const db = new Database(SQLITE_PATH, { readonly: true });
  const all = (table: string): Row[] => db.prepare(`select * from "${table}"`).all() as Row[];

  const genres = all("Genre");
  await prisma.genre.createMany({
    data: genres.map((g) => ({ id: String(g.id), slug: String(g.slug), name: String(g.name) })),
    ...SKIP_DUPLICATES,
  });
  console.log(`Жанрове: ${genres.length}`);

  const artists = all("Artist");
  await prisma.artist.createMany({
    data: artists.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      nameLatin: str(a.nameLatin),
      deezerId: str(a.deezerId),
      imageUrl: str(a.imageUrl),
      isPopFolk: bool(a.isPopFolk),
      createdAt: date(a.createdAt),
      updatedAt: date(a.updatedAt),
    })),
    ...SKIP_DUPLICATES,
  });
  console.log(`Артисти: ${artists.length}`);

  // Неявната m:n таблица Artist↔Genre (A = Artist.id, B = Genre.id).
  const links = all("_ArtistToGenre");
  for (const part of chunks(links, BATCH)) {
    const values = part.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_ArtistToGenre" ("A", "B") VALUES ${values} ON CONFLICT DO NOTHING`,
      ...part.flatMap((l) => [String(l.A), String(l.B)]),
    );
  }
  console.log(`Връзки артист–жанр: ${links.length}`);

  const tracks = all("Track");
  for (const part of chunks(tracks, BATCH)) {
    await prisma.track.createMany({
      data: part.map((t) => ({
        id: String(t.id),
        deezerId: String(t.deezerId),
        isrc: str(t.isrc),
        title: String(t.title),
        artistName: String(t.artistName),
        artistId: str(t.artistId),
        albumCover: str(t.albumCover),
        releaseYear: num(t.releaseYear),
        rank: Number(t.rank ?? 0),
        searchKey: String(t.searchKey ?? ""),
        hookStart: num(t.hookStart),
        createdAt: date(t.createdAt),
        updatedAt: date(t.updatedAt),
      })),
      ...SKIP_DUPLICATES,
    });
    // Вече съществуващите песни: обновяваме артиста (при нов внос дуетът може да мине към друг артист)
    // и началото на припева, ако локално е изчислено, а в Postgres — още не.
    const values = part.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3}::double precision)`).join(", ");
    await prisma.$executeRawUnsafe(
      `UPDATE "Track" AS t SET "artistId" = v.a, "hookStart" = COALESCE(t."hookStart", v.h)
       FROM (VALUES ${values}) AS v(id, a, h) WHERE t.id = v.id`,
      ...part.flatMap((t) => [String(t.id), str(t.artistId), num(t.hookStart)]),
    );
  }
  console.log(`Песни: ${tracks.length}`);

  const playlists = all("Playlist");
  await prisma.playlist.createMany({
    data: playlists.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      description: str(p.description),
      source: String(p.source) as "curated" | "deezer" | "spotify",
      externalId: str(p.externalId),
      category: str(p.category),
      sortOrder: Number(p.sortOrder ?? 0),
      sourceTotal: num(p.sourceTotal),
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt),
    })),
    ...SKIP_DUPLICATES,
  });
  // Съдържанието на копираните плейлисти се заменя изцяло (напр. пресъздадените по десетилетия).
  await prisma.playlistTrack.deleteMany({ where: { playlistId: { in: playlists.map((p) => String(p.id)) } } });
  const playlistTracks = all("PlaylistTrack");
  for (const part of chunks(playlistTracks, BATCH)) {
    await prisma.playlistTrack.createMany({
      data: part.map((pt) => ({ playlistId: String(pt.playlistId), trackId: String(pt.trackId), position: Number(pt.position) })),
      ...SKIP_DUPLICATES,
    });
  }
  console.log(`Плейлисти: ${playlists.length} (${playlistTracks.length} песни в тях)`);

  const daily = all("DailyChallenge");
  await prisma.dailyChallenge.createMany({
    data: daily.map((d) => ({ date: String(d.date), trackIds: JSON.parse(String(d.trackIds)) as string[], createdAt: date(d.createdAt) })),
    ...SKIP_DUPLICATES,
  });
  console.log(`Дневни предизвикателства: ${daily.length}`);

  const [g, a, t, p] = await Promise.all([prisma.genre.count(), prisma.artist.count(), prisma.track.count(), prisma.playlist.count()]);
  console.log(`В Postgres: ${g} жанра, ${a} артиста, ${t} песни, ${p} плейлиста`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
