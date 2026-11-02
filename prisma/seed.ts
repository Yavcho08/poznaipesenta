// Seed: жанрове, артисти от Deezer и curated поп-фолк плейлисти по десетилетия.
//   npm run db:seed                 — внася само липсващите артисти
//   npm run db:seed -- --refresh    — обновява песните на всички
//   npm run db:seed -- --rebuild    — пресъздава плейлистите по десетилетия
// При несигурно съвпадение артистът се пропуска и се показват кандидатите.
import "dotenv/config";
import { findArtist, importArtist, type ArtistCandidate } from "@/lib/import-artist";
import { looseKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { GENRES, POP_FOLK_DECADES } from "./seed-data";

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const rebuild = args.includes("--rebuild");

interface Problem {
  name: string;
  reason: string;
  candidates: ArtistCandidate[];
}

async function seedGenres(): Promise<void> {
  for (const g of GENRES) {
    await prisma.genre.upsert({ where: { slug: g.slug }, update: { name: g.name }, create: { slug: g.slug, name: g.name } });
  }
  console.log(`Жанрове: ${GENRES.length}`);
}

async function seedArtists(): Promise<Problem[]> {
  const problems: Problem[] = [];
  const existing = await prisma.artist.findMany({ include: { _count: { select: { tracks: true } } } });
  const imported = new Set(existing.filter((a) => a._count.tracks > 0).map((a) => looseKey(a.name)));

  for (const genre of GENRES) {
    for (const artist of genre.artists) {
      const options = { isPopFolk: genre.isPopFolk ?? false, genreSlugs: [genre.slug] };
      // При зададен deezerId сравняваме по него: „Десислава“ и „Деси Слава“ имат еднакъв ключ по име.
      const alreadyImported = artist.deezerId
        ? existing.some((a) => a.deezerId === String(artist.deezerId) && a._count.tracks > 0)
        : imported.has(looseKey(artist.name));
      if (!refresh && alreadyImported) {
        // Само връзката с жанра, без нов внос на песни.
        const row = artist.deezerId
          ? existing.find((a) => a.deezerId === String(artist.deezerId))
          : existing.find((a) => looseKey(a.name) === looseKey(artist.name));
        if (row) {
          await prisma.artist.update({
            where: { id: row.id },
            data: { genres: { connect: { slug: genre.slug } }, ...(genre.isPopFolk && { isPopFolk: true }) },
          });
        }
        console.log(`  = ${artist.name} (вече е внесен)`);
        continue;
      }

      let deezerId = artist.deezerId;
      if (!deezerId) {
        const match = await findArtist(artist.name, { international: genre.international });
        if (match.kind === "none") {
          problems.push({ name: artist.name, reason: "не е намерен в Deezer", candidates: [] });
          console.log(`  ? ${artist.name} — не е намерен`);
          continue;
        }
        if (match.kind === "uncertain") {
          problems.push({ name: artist.name, reason: "несигурно съвпадение", candidates: match.candidates });
          console.log(`  ? ${artist.name} — несигурно, пропуснат`);
          continue;
        }
        deezerId = match.candidate.id;
      }

      const result = await importArtist(artist.name, deezerId, options);
      console.log(`  + ${artist.name} → deezer ${deezerId}: ${result.imported} песни`);
    }
  }
  return problems;
}

async function seedDecades(): Promise<void> {
  const popFolkTracks = await prisma.track.findMany({
    where: { artist: { isPopFolk: true }, releaseYear: { not: null } },
    orderBy: { rank: "desc" },
  });

  for (const [order, decade] of POP_FOLK_DECADES.entries()) {
    let playlist = await prisma.playlist.findFirst({ where: { category: "pop-folk", name: decade.name } });
    if (playlist && !rebuild && (await prisma.playlistTrack.count({ where: { playlistId: playlist.id } })) > 0) {
      console.log(`  = ${decade.name} (вече има песни; --rebuild за пресъздаване)`);
      continue;
    }
    playlist ??= await prisma.playlist.create({
      data: { name: decade.name, description: decade.description, source: "curated", category: "pop-folk", sortOrder: order },
    });

    const tracks = popFolkTracks.filter((t) => t.releaseYear! >= decade.from && t.releaseYear! <= decade.to);
    await prisma.playlistTrack.deleteMany({ where: { playlistId: playlist.id } });
    await prisma.playlistTrack.createMany({
      data: tracks.map((t, position) => ({ playlistId: playlist.id, trackId: t.id, position })),
    });
    console.log(`  + ${decade.name}: ${tracks.length} песни`);
  }
}

function printProblems(problems: Problem[]): void {
  if (problems.length === 0) return;
  console.log("\n⚠ Нужно е твое решение (задай deezerId в prisma/seed-data.ts и пусни пак):");
  for (const p of problems) {
    console.log(`\n${p.name} — ${p.reason}`);
    for (const c of p.candidates) {
      const bg = Math.round(c.bgScore * 100);
      console.log(
        `   deezerId: ${c.id}  „${c.name}“  фенове: ${c.fans}, албуми: ${c.albums}, бълг.: ${bg}%  напр.: ${c.sample.join(" / ")}`,
      );
      console.log(`   https://www.deezer.com/artist/${c.id}`);
    }
  }
}

async function main(): Promise<void> {
  await seedGenres();
  console.log("Артисти:");
  const problems = await seedArtists();
  console.log("Плейлисти по десетилетия:");
  await seedDecades();
  printProblems(problems);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
