"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ClipPlayer, type Clip, type Playback } from "@/lib/audio/clip-player";
import { LAST_STEP, POINTS, STEPS, type GameView, type RoundView } from "@/lib/game/rules";
import { SongCombobox, type SongOption } from "@/components/song-combobox";
import { VolumeControl } from "@/components/volume-control";
import { celebrate, wrongFeedback } from "@/lib/effects";
import type { GameSource } from "@/lib/game/source";
import Link from "next/link";
import { ClipProgress } from "./clip-progress";
import { Results } from "./results";

type Phase = "intro" | "loading" | "playing" | "results" | "error";

/** След рунда песента звучи от припева до края на откъса (плейърът сам скъсява до наличното). */
const REVEAL_S = 30;
/** Ако след припева остават под толкова секунди, песента в края тръгва от началото на откъса. */
const REVEAL_MIN_AFTER_HOOK_S = 15;

interface GameResponse {
  game: GameView;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "Нещо се обърка. Опитай пак.";
    throw new Error(message);
  }
  return body as T;
}

const dailyKey = (date: string) => `poznai:daily:${date}`;

function readDaily(date: string): string | null {
  try {
    return localStorage.getItem(dailyKey(date));
  } catch {
    return null;
  }
}

function writeDaily(date: string, sessionId: string): void {
  try {
    localStorage.setItem(dailyKey(date), sessionId);
  } catch {
    // Частен режим — просто няма да може да продължи след презареждане.
  }
}

/**
 * Игра от 10 рунда. С `daily` — дневното предизвикателство: песните са еднакви за всички,
 * играта се помни в браузъра (продължава след презареждане, един опит на ден).
 */
export interface ChallengeIntro {
  code: string;
  name: string;
  total: number;
}

export function Game({
  source,
  label,
  daily,
  challenge,
}: {
  source?: GameSource;
  label: string;
  daily?: { date: string };
  /** „Предизвикай приятел“ — същите песни като приятеля. */
  challenge?: ChallengeIntro;
}) {
  const playerRef = useRef<ClipPlayer | null>(null);
  const buffersRef = useRef(new Map<number, Promise<Clip>>());

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [selected, setSelected] = useState<SongOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const player = useCallback((): ClipPlayer => (playerRef.current ??= new ClipPlayer()), []);
  const setVolume = useCallback((volume: number) => player().setVolume(volume), [player]);

  useEffect(() => () => playerRef.current?.close(), []);

  const loadRound = useCallback(
    (sessionId: string, index: number): Promise<Clip> => {
      const cache = buffersRef.current;
      let pending = cache.get(index);
      if (!pending) {
        pending = player().load(`/api/game/${sessionId}/rounds/${index}/audio`);
        // При грешка махаме от кеша, за да може да се опита пак.
        pending.catch(() => cache.delete(index));
        cache.set(index, pending);
      }
      return pending;
    },
    [player],
  );

  const playClip = useCallback(
    /**
     * `from`: "hook" — от припева (стъпките); "whole" — целият откъс от 0 („Чуй целия откъс“);
     * "reveal" — песента в края на рунда: от припева, освен ако след него остава малко.
     */
    async (sessionId: string, index: number, duration: number, from: "hook" | "whole" | "reveal" = "hook") => {
      setAudioError(null);
      try {
        const clip = await loadRound(sessionId, index);
        const fromStart = from === "whole" || (from === "reveal" && clip.buffer.duration - clip.start < REVEAL_MIN_AFTER_HOOK_S);
        const p = player().play(clip, duration, {
          from: fromStart ? 0 : undefined,
          onEnded: () => setPlayback((cur) => (cur === p ? null : cur)),
        });
        setPlayback(p);
      } catch (e) {
        setAudioError(e instanceof Error ? e.message : "Звукът не можа да се зареди");
      }
    },
    [loadRound, player],
  );

  // Предварително зареждане на следващия рунд, докато се играе текущият.
  const prefetch = useCallback(
    (g: GameView, index: number) => {
      const next = index + 1;
      if (next < g.rounds.length) void loadRound(g.id, next).catch(() => undefined);
    },
    [loadRound],
  );

  // Дневно: ако днес вече е играно в този браузър — продължи или покажи резултата.
  const [savedDaily, setSavedDaily] = useState<GameView | null>(null);
  const dailyDate = daily?.date;
  useEffect(() => {
    if (!dailyDate) return;
    const id = readDaily(dailyDate);
    if (!id) return;
    let cancelled = false;
    api<GameResponse>(`/api/game/${id}`)
      .then(({ game: g }) => {
        if (cancelled) return;
        if (g.finished) {
          setGame(g);
          setPhase("results");
        } else {
          setSavedDaily(g);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dailyDate]);

  /** Показва играта от първия неприключил рунд и пуска текущия му откъс. */
  const resume = async (g: GameView) => {
    setGame(g);
    setSelected(null);
    if (g.currentRound === null) {
      setPhase("results");
      return;
    }
    const index = g.currentRound;
    setViewIndex(index);
    setPhase("playing");
    await playClip(g.id, index, STEPS[g.rounds[index].step]);
    prefetch(g, index);
  };

  const start = async () => {
    player().unlock(); // в обработчика на клика — иначе браузърът блокира звука
    buffersRef.current.clear();
    setPhase("loading");
    setError(null);
    try {
      if (daily && savedDaily) {
        await resume((await api<GameResponse>(`/api/game/${savedDaily.id}`)).game);
        return;
      }
      const data = daily
        ? await api<GameResponse>("/api/daily", { method: "POST" })
        : await api<GameResponse>("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(challenge ? { challenge: challenge.code } : { source }),
          });
      if (daily) writeDaily(daily.date, data.game.id);
      await resume(data.game);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Играта не можа да започне");
      setPhase("error");
    }
  };

  const round: RoundView | undefined = game?.rounds[viewIndex];

  const move = async (body: { kind: "skip" } | { kind: "guess"; deezerId: string }) => {
    if (!game || !round || round.done || busy) return;
    player().unlock();
    setBusy(true);
    try {
      const data = await api<GameResponse>(`/api/game/${game.id}/rounds/${viewIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setGame(data.game);
      setSelected(null);
      const updated = data.game.rounds[viewIndex];
      if (body.kind === "guess") {
        if (updated.solvedAtStep !== null) {
          player().sfx("right");
          celebrate(updated.solvedAtStep);
        } else {
          player().sfx("wrong");
          wrongFeedback();
        }
      }
      if (!updated.done) {
        // Грешно/пропуснато → веднага пускаме по-дългия клип.
        await playClip(data.game.id, viewIndex, STEPS[updated.step]);
      } else {
        // Край на рунда (познато или не) → песента продължава от припева до края на откъса.
        await playClip(data.game.id, viewIndex, REVEAL_S, "reveal");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ходът не беше записан");
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (!game) return;
    player().stop();
    setPlayback(null);
    if (game.currentRound === null) {
      setPhase("results");
      return;
    }
    const index = game.currentRound;
    setViewIndex(index);
    setSelected(null);
    setError(null);
    await playClip(game.id, index, STEPS[0]);
    prefetch(game, index);
  };

  const replay = () => {
    if (!game || !round) return;
    player().unlock();
    void playClip(game.id, viewIndex, round.done ? 30 : STEPS[round.step], round.done ? "whole" : "hook");
  };

  const stopAudio = () => {
    player().stop();
    setPlayback(null);
  };


  const nextLength = round && round.step < LAST_STEP ? STEPS[round.step + 1] : null;

  if (phase === "intro" || phase === "loading" || phase === "error") {
    return (
      <div className="card animate-rise mx-auto max-w-md space-y-6 p-6 text-center sm:p-8">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-3xl shadow-xl shadow-accent/30" aria-hidden>
          {daily ? "📅" : "🎧"}
        </span>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold">
            {daily ? "Дневно предизвикателство" : challenge ? `${challenge.name} те предизвиква!` : "Познай песента"}
          </h1>
          {challenge && (
            <p className="text-sm text-muted">
              Същите 10 песни. Резултатът за биене: <strong className="text-foreground">{challenge.total} точки</strong>
            </p>
          )}
          <p className="mx-auto w-fit rounded-full border border-line bg-surface px-3 py-1 text-sm">
            {label}
            {!daily && !challenge && (
              <Link href="/" className="ml-2 text-muted underline">
                смени
              </Link>
            )}
          </p>
          {daily && <p className="text-sm text-muted">Едни и същи 10 поп-фолк песни за всички днес. Имаш един опит.</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-muted">
          <Rule icon="👂" title="Слушай" text={`от ${STEPS[0]} сек.`} />
          <Rule icon="🔎" title="Търси" text="и избери песен" />
          <Rule icon="⭐" title="Точки" text={`${POINTS[0]} → ${POINTS[LAST_STEP]}`} />
        </div>
        <p className="text-xs text-muted">Не я знаеш? „Пропусни“ отключва по-дълъг откъс: {STEPS.join(" → ")} сек.</p>
        {error && <p className="rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
        <button type="button" onClick={start} disabled={phase === "loading"} className="btn-primary w-full py-4 text-lg">
          {phase === "loading"
            ? "Подготвям песните…"
            : phase === "error"
              ? "Опитай пак"
              : savedDaily
                ? `Продължи (песен ${(savedDaily.currentRound ?? 0) + 1}/${savedDaily.rounds.length})`
                : "▶ Старт"}
        </button>
      </div>
    );
  }

  if (phase === "results" && game) {
    return (
      <Results
        game={game}
        // Дневното и предизвикателството са с едни и същи песни — „Нова игра“ би ги повторила.
        onRestart={daily || challenge ? undefined : start}
        shareDate={daily?.date}
        challengeCode={challenge?.code}
      />
    );
  }

  if (!game || !round) return null;

  const clipLength = STEPS[round.step];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">{game.label}</span>
        <span className="shrink-0 rounded-full bg-gradient-to-r from-accent/25 to-accent-2/25 px-3 py-1 text-sm">
          ⭐ <strong>{game.total}</strong>
        </span>
      </div>

      <RoundDots game={game} current={viewIndex} />

      <AttemptSlots round={round} />

      <div className="card space-y-4 p-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={playback ? stopAudio : replay}
            aria-label={playback ? "Спри" : round.done ? "Чуй целия откъс" : `Пусни ${clipLength} сек.`}
            className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-2xl text-white shadow-lg shadow-accent/30 transition active:scale-95 ${
              playback ? "animate-pulse-ring" : ""
            }`}
          >
            {playback ? "■" : "▶"}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted">{round.done ? "Песента" : "Откъс"}</p>
            <p className="font-display text-3xl font-bold leading-none">{round.done ? "30" : clipLength} сек.</p>
            <p className="mt-1 text-xs text-muted">
              {playback ? "Слушаш…" : round.done ? "Натисни, за да чуеш целия откъс" : "Натисни, за да чуеш пак"}
            </p>
          </div>
          <div className="hidden w-36 sm:block">
            <VolumeControl onChange={setVolume} />
          </div>
        </div>
        <div className="sm:hidden">
          <VolumeControl onChange={setVolume} />
        </div>
        <ClipProgress playback={playback} now={() => player().now} step={round.done ? null : round.step} />
        {audioError && <p className="text-center text-sm text-red-300">{audioError}</p>}
      </div>

      {round.done ? (
        <Reveal round={round} onNext={next} isLast={game.currentRound === null} />
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected) void move({ kind: "guess", deezerId: selected.deezerId });
          }}
        >
          <SongCombobox key={`${viewIndex}-${round.step}`} selected={selected} onSelect={setSelected} disabled={busy} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void move({ kind: "skip" })} disabled={busy} className="btn-ghost flex-col gap-0 py-2.5 leading-tight">
              <span>{nextLength ? "Пропусни" : "Предай се"}</span>
              <span className="text-xs font-normal text-muted">
                {nextLength ? `+${+(nextLength - clipLength).toFixed(1)} сек.` : "покажи отговора"}
              </span>
            </button>
            <button type="submit" disabled={!selected || busy} className="btn-primary">
              Познай
            </button>
          </div>
          {error && <p className="text-center text-sm text-red-300">{error}</p>}
        </form>
      )}
    </div>
  );
}

function Rule({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <span className="block text-xl" aria-hidden>
        {icon}
      </span>
      <span className="block font-semibold text-foreground">{title}</span>
      {text}
    </div>
  );
}

/** 10 черти за рундовете: зелено = познато, червено = не, ярко = текущ. */
function RoundDots({ game, current }: { game: GameView; current: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted">
        <span>
          Песен <strong className="text-foreground">{current + 1}</strong> / {game.rounds.length}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {game.rounds.map((r) => (
          <span
            key={r.index}
            className={`h-1.5 flex-1 rounded-full ${
              r.index === current && !r.done
                ? "bg-foreground"
                : r.done
                  ? r.solvedAtStep !== null
                    ? "bg-emerald-400"
                    : "bg-red-400/80"
                  : "bg-white/10"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Пет реда за опитите (като в Heardle): грешни, пропуснати, текущ и празни. */
function AttemptSlots({ round }: { round: RoundView }) {
  return (
    <ol className="space-y-1.5" aria-label="Опити">
      {STEPS.map((seconds, step) => {
        const g = round.guesses.find((x) => x.step === step);
        const current = !round.done && step === round.step;
        let cls = "border-dashed border-line text-muted/50";
        let content: ReactNode =<span className="text-xs">{seconds} сек.</span>;
        if (g?.kind === "skip") {
          cls = "border-line bg-surface text-muted";
          content = <span className="text-sm">⏭ Пропуснато</span>;
        } else if (g?.kind === "guess") {
          cls = g.correct ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : "border-red-400/30 bg-red-500/10 text-red-100";
          content = (
            <span className="truncate text-sm">
              {g.correct ? "✓" : "✗"} {g.title} <span className="opacity-60">– {g.artist}</span>
            </span>
          );
        } else if (current) {
          cls = "border-accent/60 bg-accent/10 text-foreground";
          content = <span className="text-sm">Опит {step + 1} · {seconds} сек.</span>;
        }
        return (
          <li key={step} className={`flex h-10 items-center rounded-xl border px-3 ${cls}`}>
            {content}
          </li>
        );
      })}
    </ol>
  );
}

function Reveal({ round, onNext, isLast }: { round: RoundView; onNext: () => void; isLast: boolean }) {
  const answer = round.answer;
  const solved = round.solvedAtStep !== null;
  return (
    <div className="animate-rise relative overflow-hidden rounded-3xl border border-line p-5 text-center">
      {answer?.cover && (
        // eslint-disable-next-line @next/next/no-img-element -- размазана обложка за фон
        <img src={answer.cover} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />
      )}
      <div className="absolute inset-0 -z-10 bg-background/50" />
      <p className={`font-display text-xl font-bold ${solved ? "text-emerald-300" : "text-red-300"}`}>
        {solved ? `Позна! +${round.points} точки` : "Не позна — 0 точки"}
      </p>
      {answer && (
        <div className="mt-4 flex flex-col items-center gap-3">
          {answer.cover && (
            // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
            <img src={answer.cover} alt="" width={140} height={140} className="rounded-2xl shadow-2xl" />
          )}
          <div>
            <p className="text-xl font-semibold">{answer.title}</p>
            <p className="text-muted">{answer.artist}</p>
          </div>
        </div>
      )}
      <button type="button" onClick={onNext} className="btn-primary mt-5 w-full">
        {isLast ? "Виж резултата" : "Следваща песен →"}
      </button>
    </div>
  );
}