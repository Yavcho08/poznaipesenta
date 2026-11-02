import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { formatDate, todayInSofia } from "@/lib/game/daily-shared";
import type { RankedEntry } from "@/lib/game/leaderboard";
import { getLeaderboard, weeklySources } from "@/lib/game/social";

export const metadata: Metadata = { title: "Класация · Познай песента" };

export default function LeaderboardPage({ searchParams }: PageProps<"/klasaciya">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">🏆 Класация</h1>
        <p className="text-sm text-muted">Всеки участва с най-добрия си резултат. Името се въвежда в края на играта.</p>
      </div>
      <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
        <Boards searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function Table({ entries, empty }: { entries: RankedEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="card p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="card divide-y divide-line">
      {entries.map((e) => (
        <li key={`${e.name}-${e.at}`} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-8 text-center text-lg">{MEDALS[e.rank - 1] ?? <span className="text-sm text-muted">{e.rank}</span>}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
          <span className="font-display text-lg font-bold">{e.total}</span>
        </li>
      ))}
    </ol>
  );
}

function tabClass(active: boolean): string {
  return `flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition ${
    active ? "bg-gradient-to-r from-accent to-accent-2 text-white" : "text-muted hover:text-foreground"
  }`;
}

async function Boards({ searchParams }: { searchParams: PageProps<"/klasaciya">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const tab = params.t === "dnevno" ? "dnevno" : "sedmica";
  const source = typeof params.s === "string" ? params.s : null;

  return (
    <div className="space-y-4">
      <nav className="card flex gap-1 p-1">
        <Link href="/klasaciya" className={tabClass(tab === "sedmica")}>
          Тази седмица
        </Link>
        <Link href="/klasaciya?t=dnevno" className={tabClass(tab === "dnevno")}>
          Днешно дневно
        </Link>
      </nav>

      {tab === "dnevno" ? (
        <>
          <p className="text-sm text-muted">Дневно предизвикателство · {formatDate(todayInSofia())}</p>
          <Table entries={await getLeaderboard({ kind: "daily", date: todayInSofia() }, 50)} empty="Още никой не е играл днешното. Бъди първи!" />
          <Link href="/dnevno" className="btn-primary w-full">
            Играй днешното
          </Link>
        </>
      ) : (
        <WeekBoard source={source} />
      )}
    </div>
  );
}

async function WeekBoard({ source }: { source: string | null }) {
  const [sources, entries] = await Promise.all([weeklySources(), getLeaderboard({ kind: "week", sourceRef: source }, 50)]);
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${active ? "border-accent bg-accent/20 text-foreground" : "border-line text-muted"}`;
  return (
    <>
      {sources.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href="/klasaciya" className={chip(!source)}>
            Всички
          </Link>
          {sources.map((s) => (
            <Link key={s.sourceRef} href={`/klasaciya?s=${encodeURIComponent(s.sourceRef)}`} className={chip(source === s.sourceRef)}>
              {s.label}
            </Link>
          ))}
        </div>
      )}
      <Table entries={entries} empty="Още няма резултати тази седмица. Изиграй игра и запиши името си!" />
    </>
  );
}
