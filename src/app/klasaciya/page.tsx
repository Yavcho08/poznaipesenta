import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { Suspense } from "react";
import { connection } from "next/server";
import { levelFromXp } from "@/lib/achievements/progress";
import { formatDate, todayInSofia } from "@/lib/game/daily-shared";
import type { RankedEntry } from "@/lib/game/leaderboard";
import { getArtistBoard, getLeaderboard, getXpBoard, weeklySources, type Board } from "@/lib/game/social";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Класация · Познай песента" };

const TABS = [
  { key: "sedmica", label: "Седмица" },
  { key: "mesec", label: "Месец" },
  { key: "obshto", label: "Общо" },
  { key: "dnevno", label: "Дневно" },
  { key: "artist", label: "По артист" },
  { key: "arhiv", label: "Архив" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function LeaderboardPage({ searchParams }: PageProps<"/klasaciya">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">🏆 Класация</h1>
        <Suspense fallback={<p className="text-sm text-muted">Участват играчите с профил и име.</p>}>
          <JoinHint />
        </Suspense>
      </div>
      <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
        <Boards searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Подсказка според това кой гледа: гост → вход; без име → избери име; иначе — нищо за вход. */
async function JoinHint() {
  const viewer = await getViewer();
  if (viewer?.profile.username) {
    return <p className="text-sm text-muted">Участват играчите с профил и име. Ти играеш като <strong>{viewer.profile.username}</strong>.</p>;
  }
  return (
    <p className="text-sm text-muted">
      Участват играчите с профил и име.{" "}
      {viewer ? (
        <>
          <Link href="/profil" className="underline">
            Избери си име
          </Link>
          , за да се класираш.
        </>
      ) : (
        <>
          <Link href="/vhod?next=/klasaciya" className="underline">
            Влез
          </Link>
          , за да се класираш.
        </>
      )}
    </p>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

function Rank({ rank }: { rank: number }) {
  return <span className="w-8 text-center text-lg">{MEDALS[rank - 1] ?? <span className="text-sm text-muted">{rank}</span>}</span>;
}

function PlayerName({ name, link = true }: { name: string; link?: boolean }) {
  if (!link) return <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>;
  return (
    <Link href={`/igrach/${encodeURIComponent(name)}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
      {name}
    </Link>
  );
}

function Table({ entries, empty, link = true }: { entries: RankedEntry[]; empty: string; link?: boolean }) {
  if (entries.length === 0) return <p className="card p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="card divide-y divide-line">
      {entries.map((e) => (
        <li key={`${e.name}-${e.at}`} className="flex items-center gap-3 px-4 py-2.5">
          <Rank rank={e.rank} />
          <PlayerName name={e.name} link={link} />
          <span className="font-display text-lg font-bold">{e.total}</span>
        </li>
      ))}
    </ol>
  );
}

function tabClass(active: boolean): string {
  return `whitespace-nowrap rounded-xl px-3 py-2 text-center text-sm font-semibold transition ${
    active ? "bg-gradient-to-r from-accent to-accent-2 text-white" : "text-muted hover:text-foreground"
  }`;
}

async function Boards({ searchParams }: { searchParams: PageProps<"/klasaciya">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.t) ? (params.t as Tab) : "sedmica";
  const source = typeof params.s === "string" ? params.s : null;
  const artist = typeof params.a === "string" ? params.a : null;

  return (
    <div className="space-y-4">
      <nav className="card -mx-1 flex gap-1 overflow-x-auto p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "sedmica" ? "/klasaciya" : `/klasaciya?t=${t.key}`} className={tabClass(tab === t.key)}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "dnevno" && (
        <>
          <p className="text-sm text-muted">Дневно предизвикателство · {formatDate(todayInSofia())}</p>
          <Table entries={await getLeaderboard({ kind: "daily", date: todayInSofia() }, 50)} empty="Още никой с профил не е играл днешното. Бъди първи!" />
          <Link href="/dnevno" className="btn-primary w-full">
            Играй днешното
          </Link>
        </>
      )}
      {(tab === "sedmica" || tab === "mesec") && <PeriodBoard kind={tab === "mesec" ? "month" : "week"} source={source} tab={tab} />}
      {tab === "obshto" && <XpBoard />}
      {tab === "artist" && <ArtistBoard artistId={artist} />}
      {tab === "arhiv" && (
        <>
          <p className="text-sm text-muted">Резултатите по име отпреди профилите (най-добрият на име).</p>
          <Table entries={await getLeaderboard({ kind: "archive" }, 50)} empty="Няма стари резултати." link={false} />
        </>
      )}
    </div>
  );
}

async function PeriodBoard({ kind, source, tab }: { kind: "week" | "month"; source: string | null; tab: string }) {
  const board: Board = { kind, sourceRef: source };
  const [sources, entries] = await Promise.all([weeklySources(), getLeaderboard(board, 50)]);
  const base = tab === "sedmica" ? "/klasaciya?" : `/klasaciya?t=${tab}&`;
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${active ? "border-accent bg-accent/20 text-foreground" : "border-line text-muted"}`;
  return (
    <>
      <p className="text-sm text-muted">Най-добрата игра „Познай песента“ на всеки играч за последните {kind === "month" ? "30" : "7"} дни.</p>
      {sources.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href={base.slice(0, -1)} className={chip(!source)}>
            Всички
          </Link>
          {sources.map((s) => (
            <Link key={s.sourceRef} href={`${base}s=${encodeURIComponent(s.sourceRef)}`} className={chip(source === s.sourceRef)}>
              {s.label}
            </Link>
          ))}
        </div>
      )}
      <Table entries={entries} empty="Още няма резултати. Изиграй игра с профил!" />
    </>
  );
}

async function XpBoard() {
  const entries = await getXpBoard(50);
  if (entries.length === 0) return <p className="card p-6 text-center text-sm text-muted">Още няма играчи с точки.</p>;
  return (
    <>
      <p className="text-sm text-muted">Общо XP от всички игри и постижения.</p>
      <ol className="card divide-y divide-line">
        {entries.map((e) => (
          <li key={e.name} className="flex items-center gap-3 px-4 py-2.5">
            <Rank rank={e.rank} />
            <PlayerName name={e.name} />
            <span className="rounded-full bg-surface-strong px-2 py-0.5 text-xs">ниво {levelFromXp(e.xp)}</span>
            <span className="w-20 text-right font-display font-bold">{e.xp.toLocaleString("bg-BG")}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

async function ArtistBoard({ artistId }: { artistId: string | null }) {
  const artists = await prisma.artist.findMany({
    where: { isActive: true, isPopFolk: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const selected = artistId ?? artists[0]?.id ?? null;
  const entries = selected ? await getArtistBoard(selected, 50) : [];
  const name = artists.find((a) => a.id === selected)?.name ?? "";
  return (
    <>
      <form method="get" className="flex gap-2">
        <input type="hidden" name="t" value="artist" />
        <select name="a" defaultValue={selected ?? ""} aria-label="Артист" className="field py-2">
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost shrink-0 px-4 py-2 text-sm">
          Покажи
        </button>
      </form>
      {entries.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">Още никой не е изиграл поне 5 песни на {name}.</p>
      ) : (
        <ol className="card divide-y divide-line">
          {entries.map((e) => (
            <li key={e.name} className="flex items-center gap-3 px-4 py-2.5">
              <Rank rank={e.rank} />
              <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
              <span className="text-xs text-muted">{e.accuracy}%</span>
              <span className="w-20 text-right font-display font-bold">
                {e.solved}
                <span className="text-xs font-normal text-muted">/{e.played}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
