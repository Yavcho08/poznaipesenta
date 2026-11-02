"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SongCombobox, type SongOption } from "@/components/song-combobox";
import { VolumeControl } from "@/components/volume-control";
import { ClipPlayer, type Clip, type Playback } from "@/lib/audio/clip-player";
import { celebrate, finale, wrongFeedback } from "@/lib/effects";
import { LAST_STEP, POINTS, STEPS } from "@/lib/game/rules";
import { ROUND_TIME_S, roundPhase, type RoundPhase } from "@/lib/room/timeline";
import { REACTIONS, type RoomState } from "@/lib/room/types";
import { ClipProgress } from "../../igra/clip-progress";
import { loadName, loadToken, saveName, saveToken } from "../room-storage";

const POLL_MS = 1000;
const TICK_MS = 100;
// Колко рано (ms) да насрочим откъса в Web Audio — за точен старт без закъснение от таймера.
const SCHEDULE_AHEAD_MS = 600;
// Песента между рундовете: най-много до края на откъса, спира поне 0.3 сек. преди следващия,
// и не се пуска, ако остават под 1.5 сек.
const REVEAL_MAX_S = 30;
const REVEAL_GAP_MS = 300;
const REVEAL_MIN_S = 1.5;

const primary = "btn-primary";

function errorMessage(body: unknown, fallback: string): string {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

/** Отместване на часовника спрямо сървъра: най-краткият от няколко опита (по-малко шум от мрежата). */
async function measureClockOffset(): Promise<number> {
  let best = { rtt: Infinity, offset: 0 };
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" }).catch(() => null);
    const t1 = Date.now();
    if (!res?.ok) continue;
    const { now } = (await res.json()) as { now: number };
    const rtt = t1 - t0;
    if (rtt < best.rtt) best = { rtt, offset: now - (t0 + rtt / 2) };
  }
  return best.offset;
}

export function Room({ code }: { code: string }) {
  const router = useRouter();
  const playerRef = useRef<ClipPlayer | null>(null);
  const pendingBuffers = useRef(new Map<number, Promise<Clip>>());
  const buffers = useRef(new Map<number, Clip>());
  const scheduled = useRef(new Set<string>());
  const offsetRef = useRef(0);
  const stateRef = useRef<RoomState | null>(null);
  const audioOnRef = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);

  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [now, setNow] = useState(0);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [selected, setSelected] = useState<SongOption | null>(null);
  const [comboKey, setComboKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [joinName, setJoinName] = useState("");

  const player = useCallback((): ClipPlayer => (playerRef.current ??= new ClipPlayer()), []);
  const setVolume = useCallback((volume: number) => player().setVolume(volume), [player]);
  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // Тайната и името от localStorage (само в браузъра).
  useEffect(() => {
    const saved = loadToken(code);
    tokenRef.current = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- еднократно четене от localStorage
    setToken(saved);
    setJoinName(loadName());
  }, [code]);

  useEffect(() => {
    void measureClockOffset().then((offset) => (offsetRef.current = offset));
    return () => playerRef.current?.close();
  }, []);

  const loadRound = useCallback(
    (index: number) => {
      if (pendingBuffers.current.has(index)) return;
      const pending = player()
        .load(`/api/rooms/${code}/rounds/${index}/audio`)
        .then((buffer) => {
          buffers.current.set(index, buffer);
          return buffer;
        });
      pending.catch(() => pendingBuffers.current.delete(index));
      pendingBuffers.current.set(index, pending);
    },
    [code, player],
  );

  // Питане за състоянието всяка секунда.
  useEffect(() => {
    if (token === undefined) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      clearTimeout(timer);
      try {
        const res = await fetch(`/api/rooms/${code}`, {
          headers: tokenRef.current ? { "x-room-token": tokenRef.current } : {},
          cache: "no-store",
        });
        const body: unknown = await res.json();
        if (stopped) return;
        if (res.ok) {
          const next = body as RoomState;
          stateRef.current = next;
          setState(next);
          setError(null);
          if (audioOnRef.current && next.status !== "finished") {
            const r = Math.max(next.roundIndex, 0);
            loadRound(r);
            if (r + 1 < next.totalRounds) loadRound(r + 1);
          }
        } else {
          setError(errorMessage(body, "Грешка"));
        }
      } catch {
        // Мрежова грешка — пробваме пак след малко.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    refreshRef.current = () => void poll();
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, token, loadRound]);

  // Часовник + насрочване на откъсите. Всеки клиент изчислява сам кога започва всеки откъс
  // от roundStartAt на сървъра, затова всички чуват едновременно.
  useEffect(() => {
    const id = setInterval(() => {
      const t = serverNow();
      setNow(t);
      const s = stateRef.current;
      if (!audioOnRef.current || !s) return;

      // Песента на приключилия рунд звучи по време на паузата (и след последния рунд) —
      // от припева, и спира малко преди първия откъс на следващия рунд.
      const revealIndex =
        s.status === "finished"
          ? s.totalRounds - 1
          : s.status === "playing" && s.roundStartAt !== null && t < s.roundStartAt
            ? s.roundIndex - 1
            : -1;
      if (revealIndex >= 0) {
        const key = `reveal:${revealIndex}`;
        const clip = buffers.current.get(revealIndex);
        const available =
          s.status === "finished" || s.roundStartAt === null
            ? REVEAL_MAX_S
            : Math.min(REVEAL_MAX_S, (s.roundStartAt - t - SCHEDULE_AHEAD_MS - REVEAL_GAP_MS) / 1000);
        if (clip && !scheduled.current.has(key) && available > REVEAL_MIN_S) {
          scheduled.current.add(key);
          // Ако припевът е късно в откъса и времето стига — от началото, за да се чуе повече.
          const fromStart = available > clip.buffer.duration - clip.start + 1;
          const p = player().play(clip, available, {
            from: fromStart ? 0 : undefined,
            onEnded: () => setPlayback((cur) => (cur === p ? null : cur)),
          });
          setPlayback(p);
        }
      }

      // Първият откъс (0.2 сек.) на всяка песен звучи у всички в един и същ момент;
      // по-нататък всеки играе сам (по-дългите откъси се пускат при „Пропусни“/грешен отговор).
      if (s.status !== "playing" || s.roundStartAt === null) return;
      const buffer = buffers.current.get(s.roundIndex);
      const key = `${s.roundIndex}:start`;
      if (!buffer || scheduled.current.has(key)) return;
      const start = s.roundStartAt;
      if (t >= start - SCHEDULE_AHEAD_MS && t < start + STEPS[0] * 1000) {
        scheduled.current.add(key);
        const at = player().now + (start - t) / 1000;
        const p = player().play(buffer, STEPS[0], { at, onEnded: () => setPlayback((cur) => (cur === p ? null : cur)) });
        setPlayback(p);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [player, serverNow]);

  const enableAudio = () => {
    player().unlock();
    audioOnRef.current = true;
    setAudioOn(true);
    const s = stateRef.current;
    if (s && s.status !== "finished") {
      const r = Math.max(s.roundIndex, 0);
      loadRound(r);
      if (r + 1 < s.totalRounds) loadRound(r + 1);
    }
  };

  const join = async () => {
    enableAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: joinName }),
      });
      const body: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(body, "Не успях да вляза"));
      const { token: newToken } = body as { token: string };
      saveToken(code, newToken);
      saveName(joinName.trim());
      tokenRef.current = newToken;
      setToken(newToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    enableAudio();
    setBusy(true);
    const res = await fetch(`/api/rooms/${code}/start`, { method: "POST", headers: { "x-room-token": tokenRef.current ?? "" } });
    if (!res.ok) setError(errorMessage(await res.json().catch(() => null), "Не успях да започна"));
    setBusy(false);
    refreshRef.current();
  };

  /** Пуска откъса на текущата песен с дадената дължина (по-дълъг при всяка следваща стъпка). */
  const playStep = useCallback(
    (duration: number, from?: number) => {
      const s = stateRef.current;
      const clip = s ? buffers.current.get(s.roundIndex) : undefined;
      if (!clip) return;
      const p = player().play(clip, duration, { from, onEnded: () => setPlayback((cur) => (cur === p ? null : cur)) });
      setPlayback(p);
    },
    [player],
  );

  /** Ход като в нормалната игра: отговор или „Пропусни“ (на последната стъпка — „Предай се“). */
  const move = async (kind: "guess" | "skip") => {
    if (kind === "guess" && !selected) return;
    player().unlock();
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/rooms/${code}/guess`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-room-token": tokenRef.current ?? "" },
        body: JSON.stringify(kind === "skip" ? { kind: "skip" } : { deezerId: selected?.deezerId }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: errorMessage(body, "Грешка") });
        return;
      }
      const r = body as { correct: boolean; points: number; step: number; done: boolean };
      if (kind === "guess") {
        if (r.correct) {
          player().sfx("right");
          celebrate(r.step);
          setFeedback({ ok: true, text: `Позна! +${r.points} точки` });
        } else {
          player().sfx("wrong");
          wrongFeedback();
          setFeedback({ ok: false, text: r.done ? "Не позна — 0 точки за тази песен." : "Не е тази — пускам по-дълъг откъс." });
        }
      }
      setSelected(null);
      setComboKey((k) => k + 1);
      const s = stateRef.current;
      if (!r.done) {
        // Грешно/пропуснато → веднага по-дългият откъс (само при теб).
        playStep(STEPS[r.step]);
      } else if (s) {
        // Готов си → песента продължава от припева, докато чакаш другите.
        scheduled.current.add(`reveal:${s.roundIndex}`);
        playStep(REVEAL_MAX_S);
      }
    } finally {
      setBusy(false);
      refreshRef.current();
    }
  };

  const react = (emoji: string) => {
    void fetch(`/api/rooms/${code}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-room-token": tokenRef.current ?? "" },
      body: JSON.stringify({ emoji }),
    }).then(() => refreshRef.current());
  };

  const [rematchBusy, setRematchBusy] = useState(false);
  const goRematch = async () => {
    setRematchBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/rematch`, { method: "POST", headers: { "x-room-token": tokenRef.current ?? "" } });
      const body: unknown = await res.json();
      if (!res.ok) throw new Error(errorMessage(body, "Не успях да започна реванш"));
      const next = body as { code: string; token: string };
      saveToken(next.code, next.token);
      router.push(`/staya/${next.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
      setRematchBusy(false);
    }
  };

  /** „Пусни пак“: текущата стъпка; след като си готов — песента от припева. */
  const replay = (step: number | null) => {
    player().unlock();
    if (playback) {
      player().stop();
      setPlayback(null);
      return;
    }
    playStep(step === null ? REVEAL_MAX_S : STEPS[step]);
  };

  // --- Изгледи ---

  if (token === undefined || (!state && !error)) return <p className="text-center text-muted">Свързване…</p>;
  if (!state) return <p className="rounded-lg bg-red-500/15 p-4 text-red-200">{error}</p>;

  if (!state.me && state.status !== "finished") {
    return (
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <h1 className="font-display text-2xl font-bold">Стая {state.code}</h1>
        <p className="text-muted">{state.label}</p>
        <input
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
          maxLength={20}
          placeholder="Твоето име"
          className="w-full rounded-lg bg-surface px-3 py-3 outline-none ring-accent focus:ring-2"
        />
        <button type="button" onClick={join} disabled={busy || !joinName.trim()} className={`${primary} w-full`}>
          Влез в играта
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  if (state.status === "finished") {
    return (
      <>
        <FloatingReactions reactions={state.reactions} />
        <FinalResults
          state={state}
          volume={<VolumeControl onChange={setVolume} />}
          reactions={state.me ? <ReactionBar onReact={react} /> : null}
          onRematch={state.me ? goRematch : null}
          rematchBusy={rematchBusy}
          error={error}
        />
      </>
    );
  }

  const phase: RoundPhase | null =
    state.status === "playing" && state.roundStartAt !== null && state.roundEndAt !== null
      ? roundPhase(now, state.roundStartAt, state.roundEndAt)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-bold">
          Стая <span className="font-mono tracking-widest text-accent">{state.code}</span>
        </h1>
        <span className="text-sm text-muted">{state.label}</span>
      </div>

      <FloatingReactions reactions={state.reactions} />

      <div className="card px-3 py-1">
        <VolumeControl onChange={setVolume} />
      </div>

      {state.me && <ReactionBar onReact={react} />}

      {!audioOn && state.status === "playing" && (
        <button type="button" onClick={enableAudio} className={`${primary} w-full py-4 text-lg`}>
          🔊 Включи звука
        </button>
      )}

      {state.status === "lobby" ? (
        <Lobby state={state} busy={busy} onStart={start} audioOn={audioOn} onAudio={enableAudio} />
      ) : (
        phase && (
          <RoundView
            state={state}
            phase={phase}
            now={now}
            playback={playback}
            nowAudio={() => player().now}
            selected={selected}
            onSelect={setSelected}
            comboKey={comboKey}
            busy={busy}
            feedback={feedback}
            onMove={move}
            onReplay={replay}
          />
        )
      )}

      <Leaderboard state={state} />
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

function Lobby({
  state,
  busy,
  onStart,
  audioOn,
  onAudio,
}: {
  state: RoomState;
  busy: boolean;
  onStart: () => void;
  audioOn: boolean;
  onAudio: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => undefined);
    setCopied(true);
  };
  return (
    <div className="space-y-4 rounded-xl bg-surface p-6 text-center">
      <p className="text-sm text-muted">Кодът на стаята</p>
      <p className="font-mono text-5xl font-bold tracking-[0.3em] text-accent">{state.code}</p>
      <button type="button" onClick={copy} className="text-sm text-muted underline">
        {copied ? "Линкът е копиран" : "Копирай линка за покана"}
      </button>
      {state.me?.isHost ? (
        <button type="button" onClick={onStart} disabled={busy} className={`${primary} w-full`}>
          Започни играта ({state.players.length} {state.players.length === 1 ? "играч" : "играчи"})
        </button>
      ) : (
        <p className="text-muted">Чакаме домакина да започне…</p>
      )}
      {!audioOn && !state.me?.isHost && (
        <button type="button" onClick={onAudio} className="rounded-full bg-white/10 px-5 py-2 text-sm">
          🔊 Включи звука предварително
        </button>
      )}
    </div>
  );
}

function RoundView({
  state,
  phase,
  now,
  playback,
  nowAudio,
  selected,
  onSelect,
  comboKey,
  busy,
  feedback,
  onMove,
  onReplay,
}: {
  state: RoomState;
  phase: RoundPhase;
  now: number;
  playback: Playback | null;
  nowAudio: () => number;
  selected: SongOption | null;
  onSelect: (o: SongOption | null) => void;
  comboKey: number;
  busy: boolean;
  feedback: { ok: boolean; text: string } | null;
  onMove: (kind: "guess" | "skip") => void;
  onReplay: (step: number | null) => void;
}) {
  const seconds = (ms: number) => Math.max(0, Math.ceil((ms - now) / 1000));

  if (phase.kind === "countdown") {
    const previous = state.history[state.roundIndex - 1];
    return (
      <div className="space-y-4">
        {previous && <RevealCard entry={previous} state={state} />}
        <p className="text-center font-display text-lg">
          Песен {state.roundIndex + 1} / {state.totalRounds} започва след{" "}
          <span className="text-accent">{seconds(phase.untilMs)}</span>
        </p>
      </div>
    );
  }

  if (phase.kind === "reveal") {
    return <p className="text-center text-muted">Времето изтече — показвам отговора…</p>;
  }

  // Моят напредък в песента — като в нормалната игра.
  const solved = state.myGuesses.find((g) => g.correct);
  const done = Boolean(solved) || state.myGuesses.length > LAST_STEP;
  const myStep = Math.min(state.myGuesses.length, LAST_STEP);
  const clipLength = STEPS[myStep];
  const nextLength = myStep < LAST_STEP ? STEPS[myStep + 1] : null;
  const left = seconds(phase.endsMs);
  const stillPlaying = state.players.filter((p) => p.online && !p.done).length;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">
            Песен <strong className="text-foreground">{state.roundIndex + 1}</strong> / {state.totalRounds}
          </span>
          <span className={`font-display text-xl font-bold tabular-nums ${left <= 10 ? "text-red-300" : ""}`}>⏱ {left} сек.</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${left <= 10 ? "bg-red-400" : "bg-gradient-to-r from-accent to-accent-2"}`}
            style={{ width: `${Math.min(100, (left / ROUND_TIME_S) * 100)}%` }}
          />
        </div>
      </div>

      <ol className="space-y-1.5" aria-label="Опити">
        {STEPS.map((secs, step) => {
          const g = state.myGuesses.find((x) => x.step === step);
          const current = !done && step === myStep;
          let cls = "border-dashed border-line text-muted/50";
          let content: ReactNode = <span className="text-xs">{secs} сек.</span>;
          if (g?.kind === "skip") {
            cls = "border-line bg-surface text-muted";
            content = <span className="text-sm">⏭ Пропуснато</span>;
          } else if (g) {
            cls = g.correct ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100" : "border-red-400/30 bg-red-500/10 text-red-100";
            content = (
              <span className="truncate text-sm">
                {g.correct ? "✓" : "✗"} {g.title} <span className="opacity-60">– {g.artist}</span>
              </span>
            );
          } else if (current) {
            cls = "border-accent/60 bg-accent/10 text-foreground";
            content = <span className="text-sm">Опит {step + 1} · {secs} сек.</span>;
          }
          return (
            <li key={step} className={`flex h-10 items-center rounded-xl border px-3 ${cls}`}>
              {content}
            </li>
          );
        })}
      </ol>

      <div className="card space-y-4 p-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onReplay(done ? null : myStep)}
            aria-label={playback ? "Спри" : done ? "Чуй песента" : `Пусни ${clipLength} сек.`}
            className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-2xl text-white shadow-lg shadow-accent/30 transition active:scale-95 ${
              playback ? "animate-pulse-ring" : ""
            }`}
          >
            {playback ? "■" : "▶"}
          </button>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted">{done ? "Песента" : "Откъс"}</p>
            <p className="font-display text-3xl font-bold leading-none">{done ? "♪" : `${clipLength} сек.`}</p>
            <p className="mt-1 text-xs text-muted">{playback ? "Слушаш…" : "Натисни, за да чуеш пак"}</p>
          </div>
        </div>
        <ClipProgress playback={playback} now={nowAudio} step={done ? null : myStep} />
      </div>

      {done ? (
        <p className={`rounded-xl p-4 text-center ${solved ? "bg-emerald-400/15 text-emerald-200" : "bg-surface text-muted"}`}>
          {solved ? `Позна! +${POINTS[solved.step]} точки.` : "Без точки за тази песен."}{" "}
          {stillPlaying > 0 ? `Изчакай другите (${stillPlaying} още играят).` : "Всички са готови."}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onMove("guess");
          }}
        >
          <SongCombobox key={comboKey} selected={selected} onSelect={onSelect} disabled={busy} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => onMove("skip")} disabled={busy} className="btn-ghost flex-col gap-0 py-2.5 leading-tight">
              <span>{nextLength ? "Пропусни" : "Предай се"}</span>
              <span className="text-xs font-normal text-muted">
                {nextLength ? `+${+(nextLength - clipLength).toFixed(1)} сек.` : "0 точки за песента"}
              </span>
            </button>
            <button type="submit" disabled={!selected || busy} className={primary}>
              Познай
            </button>
          </div>
        </form>
      )}
      {feedback && <p className={`text-center text-sm ${feedback.ok ? "text-emerald-300" : "text-red-300"}`}>{feedback.text}</p>}
    </div>
  );
}
function RevealCard({ entry, state }: { entry: RoomState["history"][number]; state: RoomState }) {
  const winners = state.players.filter((p) => entry.points[p.id]).sort((a, b) => entry.points[b.id] - entry.points[a.id]);
  return (
    <div className="space-y-3 rounded-xl bg-surface p-4">
      <div className="flex items-center gap-4">
        {entry.answer.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
          <img src={entry.answer.cover} alt="" width={72} height={72} className="rounded-lg" />
        )}
        <div>
          <p className="text-xs text-muted">Беше:</p>
          <p className="text-lg font-semibold">{entry.answer.title}</p>
          <p className="text-muted">{entry.answer.artist}</p>
        </div>
      </div>
      <p className="text-sm text-muted">
        {winners.length === 0 ? "Никой не позна." : winners.map((p) => `${p.name} +${entry.points[p.id]}`).join(" · ")}
      </p>
    </div>
  );
}

function Leaderboard({ state }: { state: RoomState }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted">Класация</h2>
      <ol className="space-y-1">
        {state.players.map((p, i) => (
          <li key={p.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${p.id === state.me?.id ? "bg-accent/15" : "bg-surface"}`}>
            <span className="w-5 text-right text-sm text-muted">{i + 1}</span>
            <span className={`h-2 w-2 rounded-full ${p.online ? "bg-green-400" : "bg-white/20"}`} title={p.online ? "на линия" : "не е на линия"} />
            <span className="min-w-0 flex-1 truncate">
              {p.name}
              {p.isHost && <span className="text-xs text-muted"> · домакин</span>}
            </span>
            {state.status === "playing" &&
              (p.solvedStep !== null ? (
                <span className="text-xs text-green-300">✓ на {STEPS[p.solvedStep]} сек.</span>
              ) : p.done ? (
                <span className="text-xs text-red-300">✗ 0 т.</span>
              ) : (
                // Още играе — на кой откъс е стигнал.
                <span className="text-xs text-muted">⏳ {STEPS[Math.min(p.triedSteps.length, LAST_STEP)]} сек.</span>
              ))}
            <span className="w-12 text-right font-semibold">{p.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FinalResults({
  state,
  volume,
  reactions,
  onRematch,
  rematchBusy,
  error,
}: {
  state: RoomState;
  volume: ReactNode;
  reactions: ReactNode;
  onRematch: (() => void) | null;
  rematchBusy: boolean;
  error: string | null;
}) {
  const [winner] = state.players;
  useEffect(() => {
    finale();
  }, []);
  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-muted">Стая {state.code} · {state.label}</p>
        {winner && (
          <p className="font-display text-3xl font-bold">
            🏆 {winner.name} <span className="text-accent">{winner.score}</span>
          </p>
        )}
      </div>

      {onRematch && (
        <div className="space-y-2 text-center">
          <button type="button" onClick={onRematch} disabled={rematchBusy} className={`${primary} w-full py-4 text-lg`}>
            {rematchBusy ? "Подготвям…" : state.nextCode ? "🔁 Влез в реванша" : "🔁 Реванш"}
          </button>
          <p className="text-xs text-muted">
            {state.nextCode ? "Някой вече започна реванш — влез с едно докосване." : "Нова стая със същите песни като избор и брой рундове."}
          </p>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      )}

      {reactions}
      <div className="card px-3 py-1">{volume}</div>
      <Leaderboard state={state} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted">Песните</h2>
        <ol className="space-y-1">
          {state.history.map((h) => (
            <li key={h.index} className="flex items-center gap-3 rounded-lg bg-surface p-2">
              <span className="w-5 text-right text-xs text-muted">{h.index + 1}</span>
              {h.answer.cover && (
                // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
                <img src={h.answer.cover} alt="" width={36} height={36} className="rounded" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{h.answer.title}</span>
                <span className="block truncate text-xs text-muted">{h.answer.artist}</span>
              </span>
              <span className="text-right text-xs text-muted">
                {state.players
                  .filter((p) => h.points[p.id])
                  .map((p) => `${p.name} ${h.points[p.id]}`)
                  .join(", ") || "—"}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="text-center">
        <Link href="/staya" className="btn-ghost inline-flex">
          Нова стая с друг избор
        </Link>
      </div>
    </div>
  );
}

/** Бутони за емоджи реакции — виждат ги всички в стаята. */
function ReactionBar({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex justify-center gap-1.5" aria-label="Реакции">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          aria-label={`Реакция ${emoji}`}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-xl transition hover:bg-surface-strong active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Реакциите „изплуват“ над екрана — всяка се показва веднъж (по id). */
function FloatingReactions({ reactions }: { reactions: RoomState["reactions"] }) {
  const seen = useRef(new Set<string>());
  const [flying, setFlying] = useState<{ id: string; emoji: string; name: string; left: number }[]>([]);

  useEffect(() => {
    const fresh = reactions.filter((r) => !seen.current.has(r.id));
    if (fresh.length === 0) return;
    for (const r of fresh) seen.current.add(r.id);
    setFlying((cur) => [...cur, ...fresh.map((r) => ({ ...r, left: 10 + Math.random() * 80 }))]);
    const ids = new Set(fresh.map((r) => r.id));
    const t = setTimeout(() => setFlying((cur) => cur.filter((f) => !ids.has(f.id))), 2600);
    return () => clearTimeout(t);
  }, [reactions]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {flying.map((f) => (
        <span key={f.id} className="animate-float-up absolute bottom-24 flex flex-col items-center" style={{ left: `${f.left}%` }}>
          <span className="text-4xl">{f.emoji}</span>
          <span className="rounded-full bg-background/70 px-2 text-[10px] text-muted">{f.name}</span>
        </span>
      ))}
    </div>
  );
}