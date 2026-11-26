import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isQuizType, QUIZZES } from "@/lib/engine/types";
import { describeSource } from "@/lib/game/server";
import { sourceFromQuery, type GameSource } from "@/lib/game/source";
import { prisma } from "@/lib/prisma";
import { QuizGame } from "../quiz-game";
import { ArtistPicker } from "./artist-picker";

export async function generateMetadata({ params }: PageProps<"/igri/[type]">): Promise<Metadata> {
  const { type } = await params;
  return { title: isQuizType(type) ? `${QUIZZES[type].title} · Познай песента` : "Игра" };
}

async function Game({ params, searchParams }: PageProps<"/igri/[type]">) {
  const { type } = await params;
  if (!isQuizType(type)) notFound();
  const meta = QUIZZES[type];
  const query = await searchParams;
  const daily = query.daily === "1";
  const source: GameSource | null = query.type ? sourceFromQuery(query) : null;
  const label = source ? await describeSource(source) : "Целият поп-фолк";
  const selectedArtists = source?.type === "artists" ? source.ids : [];

  const artists = meta.byArtist
    ? await prisma.artist.findMany({
        where: { isActive: true, tracks: { some: { isActive: true } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { tracks: { where: { isActive: true } } } } },
      })
    : [];

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/igri" className="text-muted hover:text-foreground">
          ← Игри
        </Link>
        <span className="flex-1" />
        <Link href={`/igri/${type}`} className={`rounded-full border px-3 py-1.5 ${!daily && !source ? "border-accent bg-accent/20" : "border-line text-muted"}`}>
          Свободна
        </Link>
        <Link href={`/igri/${type}?daily=1`} className={`rounded-full border px-3 py-1.5 ${daily ? "border-accent bg-accent/20" : "border-line text-muted"}`}>
          📅 Дневно
        </Link>
      </nav>

      {meta.byArtist && !daily && (
        <ArtistPicker
          key={selectedArtists.join(",")}
          type={type}
          artists={artists.map((a) => ({ id: a.id, name: a.name, count: a._count.tracks }))}
          selected={selectedArtists}
        />
      )}

      <QuizGame key={`${type}-${daily}-${selectedArtists.join(",")}`} meta={meta} source={daily ? null : source} daily={daily} sourceLabel={label} />
    </div>
  );
}

export default function QuizPage(props: PageProps<"/igri/[type]">) {
  return (
    <Suspense fallback={<div className="card h-80 animate-pulse" />}>
      <Game {...props} />
    </Suspense>
  );
}
