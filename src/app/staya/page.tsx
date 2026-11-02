import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ROUNDS_PER_GAME } from "@/lib/game/rules";
import { prisma } from "@/lib/prisma";
import { RoomEntry, type SourceOption } from "./room-entry";

export const metadata: Metadata = { title: "Мултиплейър · Познай песента" };

export default function RoomsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Игра с приятели</h1>
        <p className="text-muted">Всички чуват едни и същи откъси едновременно. Който познае по-рано, взима повече точки.</p>
      </div>
      <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
        <Entry />
      </Suspense>
    </div>
  );
}

async function Entry() {
  await connection();
  const [popFolk, genres, playlists] = await Promise.all([
    prisma.track.count({ where: { artist: { isPopFolk: true } } }),
    prisma.genre.findMany({
      where: { slug: { not: "pop-folk" } },
      orderBy: { name: "asc" },
      include: { artists: { select: { _count: { select: { tracks: true } } } } },
    }),
    prisma.playlist.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, _count: { select: { tracks: true } } },
    }),
  ]);

  const options: SourceOption[] = [
    { label: "Поп-фолк (всички)", source: { type: "popfolk" as const }, count: popFolk },
    ...playlists.map((p) => ({ label: p.name, source: { type: "playlist" as const, id: p.id }, count: p._count.tracks })),
    ...genres.map((g) => ({
      label: `Жанр: ${g.name}`,
      source: { type: "genre" as const, slug: g.slug },
      count: g.artists.reduce((s, a) => s + a._count.tracks, 0),
    })),
  ].filter((o) => o.count >= ROUNDS_PER_GAME);

  return <RoomEntry options={options} />;
}
