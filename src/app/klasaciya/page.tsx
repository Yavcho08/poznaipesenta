import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { Suspense } from "react";
import { connection } from "next/server";
import { levelFromXp } from "@/lib/achievements/progress";
import { formatDate, todayInSofia } from "@/lib/game/daily-shared";
import type { RankedEntry } from "@/lib/game/leaderboard";
import { QUIZ_TYPES, QUIZZES, type QuizType } from "@/lib/engine/types";
import { getArtistBoard, getLeaderboard, getScoreBoard, getXpBoard, type ScorePeriod, type ScoreRow } from "@/lib/game/social";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Класация · Познай песента" };

const SHORT_TITLES: Record<QuizType, string> = {
  cover: "Корица",
  newer: "По-нова",
  higher: "По-популярна",
  year: "Година",
  order: "Хронология",
  album: "Албум",
  singer: "Кой пее",
  word: "Дума",
};

/** Табове по игри (нормализирани точки) — първият е по подразбиране. */
const GAME_TABS = [
  { key: "vsichki", label: "Всички игри", icon: "🎮", gameType: null },
  { key: "listen", label: "Класическа", icon: "🎧", gameType: "listen" },
  ...QUIZ_TYPES.map((t) => ({ key: t, label: SHORT_TITLES[t], icon: QUIZZES[t].icon, gameType: t })),
] as const satisfies readonly { key: string; label: string; icon: string; gameType: string | null }[];

const OTHER_TABS = [
  { key: "dnevno", label: "📅 Дневно" },
  { key: "obshto", label: "⭐ XP" },
  { key: "artist", label: "🎤 По артист" },
  { key: "arhiv", label: "🗄️ Архив" },
] as const;

const TABS = [...GAME_TABS, ...OTHER_TABS];
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

function ScoreTable({ rows, empty }: { rows: ScoreRow[]; empty: string }) {
  if (rows.length === 0) return <p className="card p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ol className="card divide-y divide-line">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
          <Rank rank={r.rank} />
          <PlayerName name={r.name} />
          <span className="text-xs text-muted">
            {r.games} {r.games === 1 ? "игра" : "игри"}
          </span>
          <span className="w-16 text-right font-display text-lg font-bold">{r.score.toLocaleString("bg-BG")}</span>
        </li>
      ))}
    </ol>
  );
}

// Стари адреси (?t=sedmica / ?t=mesec) → новите табове.
function resolveTab(raw: unknown): Tab {
  if (raw === "sedmica" || raw === "mesec") return "vsichki";
  return TABS.some((t) => t.key === raw) ? (raw as Tab) : "vsichki";
}

async function Boards({ searchParams }: { searchParams: PageProps<"/klasaciya">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const tab = resolveTab(params.t);
  const period: ScorePeriod = params.p === "mesec" || params.t === "mesec" ? "month" : "week";
  const artist = typeof params.a === "string" ? params.a : null;
  const gameTab = GAME_TABS.find((t) => t.key === tab);
  const href = (t: string, p: ScorePeriod = period) => {
    const q = new URLSearchParams();
    if (t !== "vsichki") q.set("t", t);
    if (p === "month" && GAME_TABS.some((g) => g.key === t)) q.set("p", "mesec");
    const qs = q.toString();
    return qs ? `/klasaciya?${qs}` : "/klasaciya";
  };

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="Игри">
        {GAME_TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "border-transparent bg-gradient-to-r from-accent to-accent-2 text-white" : "border-line text-muted hover:text-foreground"}`}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </nav>
      <nav className="card flex flex-wrap justify-center gap-1 p-1" aria-label="Други класации">
        {OTHER_TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} className={tabClass(tab === t.key)}>
            {t.label}
          </Link>
        ))}
      </nav>

      {gameTab && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {gameTab.gameType === null
                ? `Сбор от точките на всички игри за последните ${period === "month" ? "30" : "7"} дни.`
                : `Най-добрата игра на всеки играч за последните ${period === "month" ? "30" : "7"} дни.`}{" "}
              Всяка игра дава до 1000 точки.
            </p>
            <div className="flex gap-1 rounded-full border border-line p-0.5 text-xs">
              <Link href={href(tab, "week")} className={`rounded-full px-3 py-1 ${period === "week" ? "bg-accent/30" : "text-muted"}`}>
                Седмица
              </Link>
              <Link href={href(tab, "month")} className={`rounded-full px-3 py-1 ${period === "month" ? "bg-accent/30" : "text-muted"}`}>
                Месец
              </Link>
            </div>
          </div>
          <ScoreTable
            rows={await getScoreBoard({ period, gameType: gameTab.gameType }, 50)}
            empty="Още няма резултати. Изиграй игра с профил!"
          />
        </>
      )}

      {tab === "dnevno" && (
        <>
          <p className="text-sm text-muted">Дневно предизвикателство · {formatDate(todayInSofia())}</p>
          <Table entries={await getLeaderboard({ kind: "daily", date: todayInSofia() }, 50)} empty="Още никой с профил не е играл днешното. Бъди първи!" />
          <Link href="/dnevno" className="btn-primary w-full">
            Играй днешното
          </Link>
        </>
      )}
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
