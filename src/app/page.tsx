import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { SourcePicker, type PickerData } from "./source-picker";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="animate-rise space-y-3 pt-2 text-center sm:pt-6">
        <p className="mx-auto w-fit rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          🎵 0.2 сек. · 1 · 2 · 5 · 10
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl">
          Познай <span className="text-gradient">песента</span>
        </h1>
        <p className="mx-auto max-w-md text-muted">
          Чуй частица от секундата. Не я знаеш? Пусни още малко. Колкото по-рано познаеш, толкова повече точки.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <ModeCard href="/dnevno" icon="📅" title="Дневно" text="10 песни, еднакви за всички днес" />
        <ModeCard href="/staya" icon="👥" title="С приятели" text="Стая с код и класация на живо" />
      </section>

      <Suspense fallback={<p className="text-center text-sm text-muted">Зареждане…</p>}>
        <Picker />
      </Suspense>
    </div>
  );
}

function ModeCard({ href, icon, title, text }: { href: string; icon: string; title: string; text: string }) {
  return (
    <Link href={href} className="card group p-4 transition hover:-translate-y-0.5 hover:bg-surface-strong">
      <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent/30 to-accent-2/30 text-xl" aria-hidden>
        {icon}
      </span>
      <span className="block font-semibold">{title}</span>
      <span className="block text-xs text-muted">{text}</span>
    </Link>
  );
}

async function loadPickerData(): Promise<PickerData> {
  const [popFolkCount, genres, artists, playlists] = await Promise.all([
    prisma.track.count({ where: { artist: { isPopFolk: true } } }),
    prisma.genre.findMany({
      where: { slug: { not: "pop-folk" } },
      orderBy: { name: "asc" },
      include: { artists: { select: { imageUrl: true, _count: { select: { tracks: true } } } } },
    }),
    prisma.artist.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, imageUrl: true, isPopFolk: true, _count: { select: { tracks: true } } },
    }),
    prisma.playlist.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, description: true, category: true, source: true, _count: { select: { tracks: true } } },
    }),
  ]);

  return {
    popFolkCount,
    genres: genres.map((g) => ({
      slug: g.slug,
      name: g.name,
      count: g.artists.reduce((sum, a) => sum + a._count.tracks, 0),
      images: g.artists.flatMap((a) => (a.imageUrl ? [a.imageUrl] : [])).slice(0, 4),
    })),
    artists: artists
      .filter((a) => a._count.tracks > 0)
      .map((a) => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, isPopFolk: a.isPopFolk, count: a._count.tracks })),
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      source: p.source,
      count: p._count.tracks,
    })),
  };
}

async function Picker() {
  await connection();
  return <SourcePicker data={await loadPickerData()} />;
}
