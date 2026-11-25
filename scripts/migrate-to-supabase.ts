// Пренася данните от старата база (SQLite файл или Neon Postgres със старата Prisma схема)
// в новата Supabase база (DATABASE_URL). Може да се пуска многократно — пропуска вече пренесеното.
//
//   npm run db:migrate-data -- --from=prisma/dev.db
//   npm run db:migrate-data -- --from="postgresql://...neon.tech/neondb" [--only=catalog|play]
//
// catalog = артисти, жанрове, песни, плейлисти; play = игри, резултати, дневни, стаи.
// Без --only — всичко. Песните се свързват по deezer_id, не по старото id.
import "./env";
import Database from "better-sqlite3";
import { Client } from "pg";
import { prisma } from "@/lib/prisma";
import { PlaylistSource, Prisma } from "@/generated/prisma/client";

type Row = Record<string, unknown>;

interface OldDb {
  all(table: string): Promise<Row[]>;
  close(): Promise<void>;
}

function openSqlite(file: string): OldDb {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  return {
    all: async (table) => db.prepare(`SELECT * FROM "${table}"`).all() as Row[],
    close: async () => {
      db.close();
    },
  };
}

async function openPostgres(url: string): Promise<OldDb> {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return {
    all: async (table) => (await client.query<Row>(`SELECT * FROM "${table}"`)).rows,
    close: () => client.end(),
  };
}

// --- Нормализиране (SQLite пази датите като текст, булевите като 0/1, JSON като текст) ---

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown, fallback = 0): number => (v === null || v === undefined || v === "" ? fallback : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const bool = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";
const date = (v: unknown): Date => (v instanceof Date ? v : new Date(typeof v === "number" ? v : String(v)));
const dateOrNull = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : date(v));
function json(v: unknown): Prisma.InputJsonValue {
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Prisma.InputJsonValue;
    } catch {
      return [];
    }
  }
  return (v ?? []) as Prisma.InputJsonValue;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function insertMany<T>(label: string, rows: T[], create: (batch: T[]) => Promise<{ count: number }>): Promise<void> {
  let inserted = 0;
  for (const batch of chunks(rows, 500)) inserted += (await create(batch)).count;
  console.log(`  ${label}: ${inserted} нови (от ${rows.length})`);
}

// --- Каталог ---

async function migrateCatalog(old: OldDb): Promise<void> {
  console.log("Каталог…");
  const artists = await old.all("Artist");
  await insertMany("артисти", artists, (batch) =>
    prisma.artist.createMany({
      skipDuplicates: true,
      data: batch.map((a) => ({
        id: str(a.id),
        deezerId: strOrNull(a.deezerId),
        name: str(a.name),
        nameLatin: strOrNull(a.nameLatin),
        imageUrl: strOrNull(a.imageUrl),
        isPopFolk: bool(a.isPopFolk),
        createdAt: date(a.createdAt),
        updatedAt: date(a.updatedAt),
      })),
    }),
  );
  // Старо id → ново (по deezer_id; артисти без deezer_id запазват id-то си).
  const targetArtists = await prisma.artist.findMany({ select: { id: true, deezerId: true } });
  const artistByDeezer = new Map(targetArtists.filter((a) => a.deezerId).map((a) => [a.deezerId, a.id]));
  const targetArtistIds = new Set(targetArtists.map((a) => a.id));
  const artistId = new Map<string, string>();
  for (const a of artists) {
    const mapped = (a.deezerId ? artistByDeezer.get(str(a.deezerId)) : undefined) ?? str(a.id);
    if (targetArtistIds.has(mapped)) artistId.set(str(a.id), mapped);
  }

  const genres = await old.all("Genre");
  await insertMany("жанрове", genres, (batch) =>
    prisma.genre.createMany({
      skipDuplicates: true,
      data: batch.map((g) => ({ id: str(g.id), slug: str(g.slug), name: str(g.name) })),
    }),
  );
  const genreBySlug = new Map((await prisma.genre.findMany()).map((g) => [g.slug, g.id]));
  const genreId = new Map(genres.map((g) => [str(g.id), genreBySlug.get(str(g.slug))]));

  // Неявната m:n таблица на старата Prisma: A = Artist.id, B = Genre.id
  const links = await old.all("_ArtistToGenre");
  await insertMany(
    "артист↔жанр",
    links.flatMap((l) => {
      const a = artistId.get(str(l.A));
      const g = genreId.get(str(l.B));
      return a && g ? [{ artistId: a, genreId: g }] : [];
    }),
    (batch) => prisma.artistGenre.createMany({ skipDuplicates: true, data: batch }),
  );

  const tracks = await old.all("Track");
  await insertMany("песни", tracks, (batch) =>
    prisma.track.createMany({
      skipDuplicates: true,
      data: batch.map((t) => ({
        id: str(t.id),
        deezerId: str(t.deezerId),
        isrc: strOrNull(t.isrc),
        title: str(t.title),
        artistName: str(t.artistName),
        artistId: t.artistId ? (artistId.get(str(t.artistId)) ?? null) : null,
        albumCover: strOrNull(t.albumCover),
        releaseYear: numOrNull(t.releaseYear),
        rank: num(t.rank),
        searchKey: str(t.searchKey),
        hookStart: numOrNull(t.hookStart),
        createdAt: date(t.createdAt),
        updatedAt: date(t.updatedAt),
      })),
    }),
  );

  const playlists = await old.all("Playlist");
  await insertMany("плейлисти", playlists, (batch) =>
    prisma.playlist.createMany({
      skipDuplicates: true,
      data: batch.map((p) => ({
        id: str(p.id),
        name: str(p.name),
        description: strOrNull(p.description),
        source: str(p.source) as PlaylistSource,
        externalId: strOrNull(p.externalId),
        category: strOrNull(p.category),
        sortOrder: num(p.sortOrder),
        sourceTotal: numOrNull(p.sourceTotal),
        createdAt: date(p.createdAt),
        updatedAt: date(p.updatedAt),
      })),
    }),
  );
  const targetPlaylists = await prisma.playlist.findMany({ select: { id: true, source: true, externalId: true } });
  const playlistId = new Map<string, string>();
  for (const p of playlists) {
    const match =
      targetPlaylists.find((t) => t.id === str(p.id)) ??
      targetPlaylists.find((t) => p.externalId && t.source === str(p.source) && t.externalId === str(p.externalId));
    if (match) playlistId.set(str(p.id), match.id);
  }

  const trackId = await trackIdMap(old);
  const playlistTracks = await old.all("PlaylistTrack");
  await insertMany(
    "песни в плейлисти",
    playlistTracks.flatMap((pt) => {
      const p = playlistId.get(str(pt.playlistId));
      const t = trackId.get(str(pt.trackId));
      return p && t ? [{ playlistId: p, trackId: t, position: num(pt.position) }] : [];
    }),
    (batch) => prisma.playlistTrack.createMany({ skipDuplicates: true, data: batch }),
  );
}

/** Старо Track.id → ново (по deezer_id). */
async function trackIdMap(old: OldDb): Promise<Map<string, string>> {
  const target = new Map((await prisma.track.findMany({ select: { id: true, deezerId: true } })).map((t) => [t.deezerId, t.id]));
  const map = new Map<string, string>();
  for (const t of await old.all("Track")) {
    const id = target.get(str(t.deezerId));
    if (id) map.set(str(t.id), id);
  }
  return map;
}

// --- Игри, дневни, стаи ---

async function migratePlay(old: OldDb): Promise<void> {
  console.log("Игри и стаи…");
  const trackId = await trackIdMap(old);
  const trackArtist = new Map(
    (await prisma.track.findMany({ select: { id: true, artistId: true } })).map((t) => [t.id, t.artistId]),
  );

  const sessions = await old.all("GameSession");
  const scores = new Map((await old.all("Score")).map((s) => [str(s.sessionId), s]));
  const rounds = await old.all("Round");
  const roundsBySession = new Map<string, Row[]>();
  for (const r of rounds) {
    const list = roundsBySession.get(str(r.sessionId)) ?? [];
    list.push(r);
    roundsBySession.set(str(r.sessionId), list);
  }

  // Игра без всичките си песни в новия каталог се пропуска (не може да се покаже).
  const complete = sessions.filter((s) => (roundsBySession.get(str(s.id)) ?? []).every((r) => trackId.has(str(r.trackId))));
  await insertMany("игри", complete, (batch) =>
    prisma.game.createMany({
      skipDuplicates: true,
      data: batch.map((s) => {
        const score = scores.get(str(s.id));
        const own = roundsBySession.get(str(s.id)) ?? [];
        const sourceType = strOrNull(s.sourceType);
        return {
          id: str(s.id),
          gameType: "listen",
          mode: sourceType === "daily" ? "daily" : sourceType === "challenge" ? "challenge" : "free",
          sourceType,
          sourceRef: strOrNull(s.sourceRef),
          playerName: score ? strOrNull(score.playerName) : null,
          total: score ? num(score.total) : own.reduce((sum, r) => sum + num(r.points), 0),
          challengeCode: strOrNull(s.challengeCode),
          createdAt: date(s.createdAt),
          finishedAt: dateOrNull(s.finishedAt),
        };
      }),
    }),
  );
  const migrated = new Set(complete.map((s) => str(s.id)));
  await insertMany(
    "рундове",
    rounds
      .filter((r) => migrated.has(str(r.sessionId)))
      .map((r) => {
        const track = trackId.get(str(r.trackId)) ?? null;
        return {
          id: str(r.id),
          gameId: str(r.sessionId),
          index: num(r.index),
          trackId: track,
          artistId: track ? (trackArtist.get(track) ?? null) : null,
          attempts: json(r.guesses),
          solvedStep: numOrNull(r.solvedAtStep),
          points: num(r.points),
          startedAt: date(r.createdAt),
        };
      }),
    (batch) => prisma.gameRound.createMany({ skipDuplicates: true, data: batch }),
  );

  const daily = await old.all("DailyChallenge");
  await insertMany(
    "дневни",
    daily.map((d) => {
      const ids = json(d.trackIds);
      const mapped = Array.isArray(ids) ? ids.map((id) => trackId.get(str(id))).filter((id): id is string => !!id) : [];
      return { date: str(d.date), gameType: "listen", trackIds: mapped, createdAt: date(d.createdAt) };
    }),
    (batch) => prisma.dailyChallenge.createMany({ skipDuplicates: true, data: batch }),
  );

  const rooms = await old.all("Room");
  const roomRounds = await old.all("RoomRound");
  const okRooms = rooms.filter((room) =>
    roomRounds.filter((rr) => str(rr.roomId) === str(room.id)).every((rr) => trackId.has(str(rr.trackId))),
  );
  const okRoomIds = new Set(okRooms.map((r) => str(r.id)));
  await insertMany("стаи", okRooms, (batch) =>
    prisma.room.createMany({
      skipDuplicates: true,
      data: batch.map((r) => ({
        id: str(r.id),
        code: str(r.code),
        status: str(r.status),
        source: str(r.source),
        label: str(r.label),
        roundIndex: num(r.roundIndex, -1),
        roundStartAt: dateOrNull(r.roundStartAt),
        roundEndAt: dateOrNull(r.roundEndAt),
        hostId: strOrNull(r.hostId),
        nextCode: strOrNull(r.nextCode),
        createdAt: date(r.createdAt),
        updatedAt: date(r.updatedAt),
      })),
    }),
  );
  const players = (await old.all("RoomPlayer")).filter((p) => okRoomIds.has(str(p.roomId)));
  await insertMany("играчи в стаи", players, (batch) =>
    prisma.roomPlayer.createMany({
      skipDuplicates: true,
      data: batch.map((p) => ({
        id: str(p.id),
        roomId: str(p.roomId),
        name: str(p.name),
        token: str(p.token),
        score: num(p.score),
        lastSeenAt: date(p.lastSeenAt),
        joinedAt: date(p.joinedAt),
      })),
    }),
  );
  await insertMany(
    "рундове в стаи",
    roomRounds
      .filter((rr) => okRoomIds.has(str(rr.roomId)))
      .map((rr) => ({ roomId: str(rr.roomId), index: num(rr.index), trackId: trackId.get(str(rr.trackId)) ?? "" })),
    (batch) => prisma.roomRound.createMany({ skipDuplicates: true, data: batch }),
  );
  const guesses = (await old.all("RoomGuess")).filter((g) => okRoomIds.has(str(g.roomId)));
  await insertMany("ходове в стаи", guesses, (batch) =>
    prisma.roomGuess.createMany({
      skipDuplicates: true,
      data: batch.map((g) => ({
        id: str(g.id),
        roomId: str(g.roomId),
        playerId: str(g.playerId),
        roundIndex: num(g.roundIndex),
        step: num(g.step),
        kind: str(g.kind) || "guess",
        deezerId: str(g.deezerId),
        title: str(g.title),
        artist: str(g.artist),
        correct: bool(g.correct),
        points: num(g.points),
        createdAt: date(g.createdAt),
      })),
    }),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const from = args.find((a) => a.startsWith("--from="))?.slice("--from=".length);
  const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  if (!from) throw new Error('Липсва --from=<SQLite файл или postgres:// адрес>');
  if (only && only !== "catalog" && only !== "play") throw new Error("--only трябва да е catalog или play");

  const target = new URL(process.env.DATABASE_URL ?? "postgres://?").host;
  console.log(`От: ${/^postgres(ql)?:\/\//.test(from) ? new URL(from).host : from}\nКъм: ${target}`);

  const old = /^postgres(ql)?:\/\//.test(from) ? await openPostgres(from) : openSqlite(from);
  try {
    if (only !== "play") await migrateCatalog(old);
    if (only !== "catalog") await migratePlay(old);
  } finally {
    await old.close();
    await prisma.$disconnect();
  }
  console.log("Готово. Следва: npm run catalog:backfill (албуми, години, дуети, песни без звук).");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
