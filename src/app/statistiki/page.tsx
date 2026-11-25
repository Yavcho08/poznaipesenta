import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { BarChart, PercentBar } from "@/components/charts";
import { peekOwner } from "@/lib/auth/viewer";
import { isQuizType, QUIZZES } from "@/lib/engine/types";
import { albumStats, decadeStats, fastestSongs, modeStats, strongWeak, trainSongs, weeklyStats } from "@/lib/stats/compute";
import { artistStatsFull, loadRounds } from "@/lib/stats/server";
import { STEPS } from "@/lib/game/rules";

export const metadata: Metadata = { title: "Моите статистики · Познай песента" };

export default function StatsPage({ searchParams }: PageProps<"/statistiki">) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">📊 Моите статистики</h1>
        <p className="text-sm text-muted">Кои артисти познаваш най-добре, кои песни ти убягват и как напредваш.</p>
      </header>
      <Suspense fallback={<div className="card h-72 animate-pulse" />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function modeName(type: string): string {
  if (type === "listen") return "🎧 Познай песента";
  return isQuizType(type) ? `${QUIZZES[type].icon} ${QUIZZES[type].title}` : type;
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card min-w-0 space-y-3 p-4">
      <div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

async function Stats({ searchParams }: { searchParams: PageProps<"/statistiki">["searchParams"] }) {
  await connection();
  const owner = await peekOwner();
  const rows = owner ? await loadRounds(owner) : [];
  if (!owner || rows.length === 0) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p>Още няма изиграни игри.</p>
        <Link href="/igra?type=popfolk" className="btn-primary">
          Играй сега
        </Link>
      </div>
    );
  }
  const params = await searchParams;
  const selected = typeof params.a === "string" ? params.a : null;

  const artists = await artistStatsFull(owner, rows);
  const { strong, weak } = strongWeak(artists);
  const weeks = weeklyStats(rows, new Date());
  const modes = modeStats(rows);
  const decades = decadeStats(rows);
  const fastest = fastestSongs(rows);
  const train = trainSongs(rows);
  const albumArtist = artists.find((a) => a.artistId === selected) ?? null;
  const albums = albumArtist ? albumStats(rows, albumArtist.artistId) : [];
  const listenRounds = rows.filter((r) => r.gameType === "listen");
  const solved = listenRounds.filter((r) => r.solvedStep !== null).length;
  const gameCount = new Set(rows.filter((r) => r.finishedAt).map((r) => r.gameId)).size;

  return (
    <div className="space-y-5">
      {!owner.userId && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          Това са игрите ти на това устройство.{" "}
          <Link href="/vhod?next=/statistiki" className="underline">
            Влез
          </Link>
          , за да ги пазиш навсякъде.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card p-3">
          <p className="font-display text-xl font-bold">{gameCount}</p>
          <p className="text-xs text-muted">игри</p>
        </div>
        <div className="card p-3">
          <p className="font-display text-xl font-bold">{solved}</p>
          <p className="text-xs text-muted">познати песни</p>
        </div>
        <div className="card p-3">
          <p className="font-display text-xl font-bold">{listenRounds.length ? Math.round((solved / listenRounds.length) * 100) : 0}%</p>
          <p className="text-xs text-muted">точност</p>
        </div>
      </div>

      <Section title="Прогрес по седмици" note="Точки от всички игри за последните 12 седмици">
        <BarChart
          data={weeks.map((w) => ({
            label: new Date(`${w.week}T12:00:00Z`).toLocaleDateString("bg-BG", { day: "numeric", month: "short" }),
            value: w.points,
            hint: `Седмица от ${w.week}: ${w.points} т., ${w.games} игри${w.accuracy !== null ? `, точност ${w.accuracy}%` : ""}`,
          }))}
        />
      </Section>

      {(strong.length > 0 || weak.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="💪 Най-силни">
            {strong.map((a) => (
              <PercentBar key={a.artistId} label={a.name} value={a.accuracy} sub={`${a.solved}/${a.played} песни`} />
            ))}
          </Section>
          <Section title="🎯 За тренировка">
            {weak.length ? (
              weak.map((a) => <PercentBar key={a.artistId} label={a.name} value={a.accuracy} sub={`${a.solved}/${a.played} песни`} />)
            ) : (
              <p className="text-sm text-muted">Изиграй още песни от повече артисти.</p>
            )}
          </Section>
        </div>
      )}

      <Section title="Колко познаваш всеки артист" note="Точност в „Познай песента“; покритие = колко от песните му в играта си познал поне веднъж">
        <ul className="space-y-4">
          {artists.slice(0, 30).map((a) => (
            <li key={a.artistId} className="space-y-1">
              <PercentBar
                label={a.name}
                value={a.accuracy}
                sub={[
                  `${a.solved}/${a.played} познати`,
                  a.avgSeconds !== null ? `средно от ${a.avgSeconds} сек.` : null,
                  a.catalog ? `покритие ${a.coverage}% (${a.distinctSolved}/${a.catalog})` : null,
                  a.betterThan !== null ? `по-добър от ${a.betterThan}% от играчите` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Link href={`/statistiki?a=${a.artistId}#albumi`} className="text-xs text-accent underline">
                по албуми
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {albumArtist && (
        <section id="albumi">
          <Section title={`Албуми на ${albumArtist.name}`} note="% познати песни от всеки албум">
            {albums.length ? (
              albums.map((g) => <PercentBar key={g.key} label={g.label} value={g.accuracy} sub={`${g.solved}/${g.played}`} />)
            ) : (
              <p className="text-sm text-muted">Няма данни по албуми за този артист.</p>
            )}
          </Section>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="По десетилетие">
          {decades.length ? decades.map((d) => <PercentBar key={d.key} label={d.label} value={d.accuracy} sub={`${d.solved}/${d.played}`} />) : <p className="text-sm text-muted">Няма данни.</p>}
        </Section>
        <Section title="По игра">
          <ul className="divide-y divide-line text-sm">
            {modes.map((m) => (
              <li key={m.gameType} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{modeName(m.gameType)}</span>
                <span className="text-xs text-muted">{m.games} игри</span>
                <span className="w-24 text-right">
                  ср. <strong>{m.avgTotal}</strong> · макс {m.best}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="⚡ Най-бързо познати">
          {fastest.length ? (
            <ol className="space-y-1.5 text-sm">
              {fastest.map((s) => (
                <li key={s.trackId} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {s.title} <span className="text-muted">– {s.artist}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{s.bestStep !== null ? `${STEPS[s.bestStep]} сек.` : ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Още няма познати песни.</p>
          )}
        </Section>
        <Section title="🔁 Тренирай тези" note="Песни, които често не познаваш">
          {train.length ? (
            <ol className="space-y-1.5 text-sm">
              {train.map((s) => (
                <li key={s.trackId} className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {s.title} <span className="text-muted">– {s.artist}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {s.plays - s.solves}× пропусната
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Няма такива — браво!</p>
          )}
        </Section>
      </div>
    </div>
  );
}
