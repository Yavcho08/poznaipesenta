import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { Suspense } from "react";
import { connection } from "next/server";
import { QUIZZES, QUIZ_TYPES } from "@/lib/engine/types";
import { todayInSofia } from "@/lib/game/daily-shared";
import { getScoreBoard } from "@/lib/game/social";
import { prisma } from "@/lib/prisma";
import { Countdown } from "./countdown";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-10">
      <Suspense fallback={null}>
        <DeletedNotice searchParams={searchParams} />
      </Suspense>

      <section className="animate-rise space-y-5 pt-2 text-center sm:pt-8">
        <p className="mx-auto w-fit rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          🎵 0.2 сек. · 1 · 2 · 5 · 10 · без регистрация
        </p>
        <h1 className="font-display text-4xl font-bold leading-[1.1] sm:text-6xl">
          Колко добре познаваш <span className="text-gradient">поп-фолка</span>?
        </h1>
        <p className="mx-auto max-w-lg text-muted">
          Чуй частица от секундата и познай песента. Колкото по-рано, толкова повече точки. Плюс 8 музикални игри, дневно
          предизвикателство и стаи с приятели.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/igra?type=popfolk" className="btn-primary animate-pulse-ring w-full px-10 py-4 text-lg sm:w-auto">
            ▶ Играй веднага
          </Link>
          <Link href="/igrai" className="btn-ghost w-full sm:w-auto">
            Избери артист или плейлист
          </Link>
        </div>
      </section>

      <Suspense fallback={<div className="card h-28 animate-pulse" />}>
        <DailyCard />
      </Suspense>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-bold">Игри</h2>
          <Link href="/igri" className="text-sm text-muted hover:text-foreground">
            Всички →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ModeCard href="/igrai" icon="🎧" title="Познай песента" text="Класиката с клиповете" accent />
          <ModeCard href="/staya" icon="👥" title="С приятели" text="Стая с код, класация на живо" accent />
          {QUIZ_TYPES.map((t) => (
            <ModeCard key={t} href={`/igri/${t}`} icon={QUIZZES[t].icon} title={QUIZZES[t].title} text={QUIZZES[t].short} />
          ))}
          <ModeCard href="/vnos" icon="➕" title="Твой плейлист" text="От Deezer или Spotify" />
          <ModeCard href="/statistiki" icon="📊" title="Моите статистики" text="Колко % познаваш всеки артист" />
        </ul>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <TopWeek />
        </Suspense>
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <NewSongs />
        </Suspense>
      </div>
    </div>
  );
}

async function DeletedNotice({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  if (params.iztrit !== "1") return null;
  return <p className="card p-3 text-center text-sm">Акаунтът и данните ти са изтрити. Можеш да продължиш да играеш като гост.</p>;
}

function ModeCard({ href, icon, title, text, accent }: { href: string; icon: string; title: string; text: string; accent?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        className={`card group flex h-full flex-col gap-1 p-4 transition hover:-translate-y-0.5 hover:bg-surface-strong ${accent ? "border-accent/40" : ""}`}
      >
        <span className="text-2xl transition group-hover:scale-110" aria-hidden>
          {icon}
        </span>
        <span className="font-semibold leading-tight">{title}</span>
        <span className="text-xs text-muted">{text}</span>
      </Link>
    </li>
  );
}

async function DailyCard() {
  await connection();
  const players = await prisma.game.count({ where: { mode: "daily", sourceRef: todayInSofia() } });
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent/90 via-[#c23a9f] to-accent-2/90 p-5 shadow-xl shadow-accent/20 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Дневно предизвикателство</p>
          <p className="font-display text-xl font-bold">10 песни, еднакви за всички днес</p>
          <p className="text-sm text-white/85">
            Ново след <Countdown /> {players > 0 && <>· {players.toLocaleString("bg-BG")} игри днес</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dnevno" className="btn flex-1 bg-white text-[#2a0f2f] hover:brightness-95 sm:flex-none">
            Играй днешното
          </Link>
          <Link href="/igri" className="btn border border-white/40 text-white hover:bg-white/10">
            Още дневни
          </Link>
        </div>
      </div>
    </section>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

async function TopWeek() {
  await connection();
  const [top, viewer] = await Promise.all([getScoreBoard({ period: "week", gameType: null }, 5), getViewer()]);
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-lg font-bold">🏆 Топ 5 тази седмица</h2>
        <Link href="/klasaciya" className="text-sm text-muted hover:text-foreground">
          Класация →
        </Link>
      </div>
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Още няма резултати тази седмица.{" "}
          {viewer ? (
            <>
              <Link href="/igrai" className="underline">
                Играй
              </Link>{" "}
              и бъди първи!
            </>
          ) : (
            <>
              <Link href="/vhod" className="underline">
                Влез
              </Link>{" "}
              и бъди първи!
            </>
          )}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {top.map((e) => (
            <li key={e.name} className="flex items-center gap-3 py-2">
              <span className="w-7 text-center">{MEDALS[e.rank - 1] ?? <span className="text-sm text-muted">{e.rank}</span>}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
              <span className="font-display font-bold">{e.score.toLocaleString("bg-BG")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function NewSongs() {
  await connection();
  const tracks = await prisma.track.findMany({
    where: { isActive: true, releaseYear: { gte: new Date().getUTCFullYear() - 1 } },
    orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
    take: 6,
    select: { id: true, title: true, artistName: true, albumCover: true, releaseDate: true },
  });
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">🆕 Нови песни в играта</h2>
      {tracks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Скоро.</p>
      ) : (
        <ul className="space-y-2">
          {tracks.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              {t.albumCover ? (
                // eslint-disable-next-line @next/next/no-img-element -- корица от Deezer CDN
                <img src={t.albumCover} alt="" width={40} height={40} className="rounded-md" loading="lazy" />
              ) : (
                <span className="h-10 w-10 rounded-md bg-surface-strong" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-muted">{t.artistName}</span>
              </span>
              {t.releaseDate && (
                <span className="text-xs text-muted">{t.releaseDate.toLocaleDateString("bg-BG", { day: "numeric", month: "short" })}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
