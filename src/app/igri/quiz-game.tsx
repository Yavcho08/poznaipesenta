"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipPlayer, type Clip } from "@/lib/audio/clip-player";
import { celebrate, finale, wrongFeedback } from "@/lib/effects";
import { COVER_POINTS, orderPlacement, STREAK_POINTS } from "@/lib/engine/scoring";
import { QUIZ_POINTS } from "@/lib/engine/types";
import type { Answer, Option, QuizInput, QuizMeta, QuizRoundView, QuizType, QuizView, SongCard } from "@/lib/engine/types";
import type { GameSource } from "@/lib/game/source";
import { VolumeControl } from "@/components/volume-control";
import { UnlockToasts, type Unlock } from "@/components/unlock-toasts";

type Phase = "intro" | "loading" | "playing" | "results" | "error";

interface MoveResponse {
  quiz: QuizView;
  correct: boolean;
  points: number;
  unlocked?: Unlock[];
}

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Нещо се обърка. Опитай пак.";
    throw new Error(message);
  }
  return data as T;
}

const CLIP_S = 10;

export function QuizGame({ meta, source, daily, sourceLabel }: { meta: QuizMeta; source: GameSource | null; daily: boolean; sourceLabel: string }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [quiz, setQuiz] = useState<QuizView | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Unlock[]>([]);
  const playerRef = useRef<ClipPlayer | null>(null);
  const clips = useRef(new Map<number, Promise<Clip>>());
  const roundStart = useRef<{ index: number; at: number } | null>(null);

  const player = useCallback(() => (playerRef.current ??= new ClipPlayer()), []);
  useEffect(() => () => playerRef.current?.close(), []);

  const loadClip = useCallback(
    (id: string, index: number) => {
      let pending = clips.current.get(index);
      if (!pending) {
        pending = player().load(`/api/quiz/${id}/rounds/${index}/audio`);
        pending.catch(() => clips.current.delete(index));
        clips.current.set(index, pending);
      }
      return pending;
    },
    [player],
  );

  const playRound = useCallback(
    async (id: string, index: number, seconds = CLIP_S) => {
      if (!meta.audio) return;
      try {
        player().play(await loadClip(id, index), seconds);
      } catch {
        // Без звук рундът пак може да се играе (виждат се заглавието/вариантите).
      }
    },
    [loadClip, meta.audio, player],
  );

  const openRound = useCallback(
    (q: QuizView, index: number) => {
      setViewIndex(index);
      roundStart.current = { index, at: performance.now() };
      const round = q.rounds[index];
      // „Кой пее?“ и „От кой албум“ започват със звук; „Годината“ — по желание (бутон).
      if (meta.audio && round && (round.question.kind === "choice")) void playRound(q.id, index);
      const next = index + 1;
      if (meta.audio && next < q.rounds.length) void loadClip(q.id, next).catch(() => undefined);
    },
    [loadClip, meta.audio, playRound],
  );

  const start = async () => {
    player().unlock();
    clips.current.clear();
    setPhase("loading");
    setError(null);
    try {
      const { quiz: q } = await api<{ quiz: QuizView }>("/api/quiz", { type: meta.type, source: source ?? undefined, daily });
      setQuiz(q);
      if (q.finished || q.currentRound === null) {
        setPhase("results");
        return;
      }
      setPhase("playing");
      openRound(q, q.currentRound);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Играта не можа да започне");
      setPhase("error");
    }
  };

  const answer = async (input: QuizInput) => {
    if (!quiz || busy) return;
    setBusy(true);
    setError(null);
    const t = roundStart.current;
    const elapsedMs = t && t.index === viewIndex ? Math.round(performance.now() - t.at) : undefined;
    try {
      const r = await api<MoveResponse>(`/api/quiz/${quiz.id}/rounds/${viewIndex}`, { ...input, elapsedMs });
      setQuiz(r.quiz);
      if (r.unlocked?.length) setUnlocked((u) => [...u, ...(r.unlocked ?? [])]);
      const round = r.quiz.rounds[viewIndex];
      if (r.correct || (round?.done && r.points > 0)) {
        player().sfx("right");
        celebrate(round?.attempts.length ? round.attempts.length - 1 : 0);
      } else {
        player().sfx("wrong");
        wrongFeedback();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Отговорът не беше записан");
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (!quiz) return;
    player().stop();
    if (quiz.finished || quiz.currentRound === null) {
      if (quiz.total > 0) finale();
      setPhase("results");
      return;
    }
    openRound(quiz, quiz.currentRound);
  };

  if (phase === "intro" || phase === "loading" || phase === "error") {
    return (
      <div className="card space-y-5 p-6 text-center">
        <div className="text-5xl" aria-hidden>
          {meta.icon}
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">{meta.title}</h1>
          <p className="text-sm text-muted">{daily ? "Дневно предизвикателство — еднакво за всички днес" : sourceLabel}</p>
        </div>
        <p className="mx-auto max-w-md text-sm">{meta.howTo}</p>
        <p className="mx-auto w-fit rounded-full bg-surface-strong px-4 py-1.5 text-xs text-muted">🏆 {QUIZ_POINTS[meta.type]}</p>
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        <button type="button" onClick={start} disabled={phase === "loading"} className="btn-primary w-full sm:w-auto sm:px-12">
          {phase === "loading" ? "Подготвям въпросите…" : "Започни"}
        </button>
      </div>
    );
  }

  if (!quiz) return null;
  if (phase === "results") return <QuizResults quiz={quiz} meta={meta} onRestart={start} unlocked={unlocked} />;

  const round = quiz.rounds[viewIndex];
  if (!round) return null;
  const streak = meta.length === "streak";
  const correctSoFar = quiz.rounds.filter((r) => r.correct).length;
  const doneSoFar = quiz.rounds.filter((r) => r.done).length;
  const progress = streak ? `Серия: ${correctSoFar}` : `Въпрос ${viewIndex + 1} от ${quiz.rounds.length}`;

  return (
    <div className="space-y-4">
      <UnlockToasts items={unlocked} />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">
          {meta.icon} {progress}
        </span>
        <span className="text-muted">{quiz.total} т.</span>
        {meta.audio && <VolumeControl onChange={(v) => player().setVolume(v)} />}
      </div>
      {!streak && (
        <div className="space-y-1">
          <div className="flex gap-1" aria-hidden>
            {quiz.rounds.map((r) => (
              <span
                key={r.index}
                className={`h-1.5 flex-1 rounded-full ${
                  !r.done ? (r.index === viewIndex ? "bg-accent/60" : "bg-surface-strong") : r.correct ? "bg-emerald-400" : r.points > 0 ? "bg-amber-400" : "bg-red-400"
                }`}
              />
            ))}
          </div>
          <p className="text-right text-xs text-muted">
            {doneSoFar ? `${correctSoFar} от ${doneSoFar} верни · средно ${Math.round(quiz.total / doneSoFar)} т. на въпрос` : " "}
          </p>
        </div>
      )}

      <RoundBody
        key={`${quiz.id}-${viewIndex}`}
        quizId={quiz.id}
        type={meta.type}
        round={round}
        busy={busy}
        onAnswer={answer}
        onPlay={meta.audio ? (s?: number) => void playRound(quiz.id, viewIndex, s) : undefined}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {round.done && (
        <div className="animate-rise space-y-3">
          <Feedback round={round} type={meta.type} />
          <button type="button" onClick={next} className="btn-primary w-full" autoFocus>
            {quiz.finished || quiz.currentRound === null ? "Резултат" : "Напред →"}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Рундът ---

function RoundBody({
  quizId,
  type,
  round,
  busy,
  onAnswer,
  onPlay,
}: {
  quizId: string;
  type: QuizType;
  round: QuizRoundView;
  busy: boolean;
  onAnswer: (input: QuizInput) => void;
  onPlay?: (seconds?: number) => void;
}) {
  const q = round.question;
  switch (q.kind) {
    case "cover":
      return <CoverRound quizId={quizId} round={round} options={q.options} busy={busy} onAnswer={onAnswer} />;
    case "pair":
      return <PairRound prompt={q.prompt} left={q.left} right={q.right} round={round} busy={busy} onAnswer={onAnswer} />;
    case "year":
      return <YearRound song={q.song} min={q.min} max={q.max} round={round} busy={busy} onAnswer={onAnswer} onPlay={onPlay} />;
    case "order":
      return <OrderRound items={q.items} artist={q.artist} round={round} busy={busy} onAnswer={onAnswer} />;
    case "choice":
      return (
        <div className="space-y-4">
          <p className="text-center font-display text-lg font-bold">{q.prompt}</p>
          {q.song && <SongLine song={q.song} />}
          {onPlay && <PlayButton onPlay={() => onPlay()} label={type === "singer" ? "Пусни пак" : "Чуй песента"} />}
          <Options options={q.options} round={round} busy={busy} onPick={(id) => onAnswer({ kind: "option", id })} />
        </div>
      );
    case "word":
      return (
        <div className="space-y-4">
          <div className="card space-y-1 p-5 text-center">
            <p className="font-display text-2xl font-bold tracking-wide">{q.masked}</p>
            <p className="text-sm text-muted">{q.artist}</p>
          </div>
          <Options options={q.options} round={round} busy={busy} onPick={(id) => onAnswer({ kind: "option", id })} />
        </div>
      );
  }
}

function PlayButton({ onPlay, label }: { onPlay: () => void; label: string }) {
  return (
    <button type="button" onClick={onPlay} className="btn-ghost mx-auto flex">
      ▶ {label}
    </button>
  );
}

function SongLine({ song }: { song: SongCard }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      {song.cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- корица от Deezer CDN
        <img src={song.cover} alt="" width={56} height={56} className="rounded-lg" />
      ) : (
        <span className="grid h-14 w-14 place-items-center rounded-lg bg-surface-strong text-2xl" aria-hidden>
          ♪
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{song.title}</p>
        <p className="truncate text-sm text-muted">{song.artist}</p>
        <Notes notes={song.notes} />
      </div>
    </div>
  );
}

function Notes({ notes, center }: { notes?: string[]; center?: boolean }) {
  if (!notes?.length) return null;
  return (
    <p className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted ${center ? "justify-center" : ""}`}>
      {notes.map((n) => (
        <span key={n}>{n}</span>
      ))}
    </p>
  );
}

function tried(round: QuizRoundView, id: string): boolean {
  return round.attempts.some((a) => a.input.kind === "option" && a.input.id === id);
}

function Options({ options, round, busy, onPick }: { options: Option[]; round: QuizRoundView; busy: boolean; onPick: (id: string) => void }) {
  const correctId = round.answer?.kind === "option" ? round.answer.id : null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const wasTried = tried(round, o.id);
        const isCorrect = round.done && o.id === correctId;
        return (
          <button
            key={o.id}
            type="button"
            disabled={busy || round.done || wasTried}
            onClick={() => onPick(o.id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              isCorrect
                ? "border-emerald-400 bg-emerald-400/20"
                : wasTried
                  ? "border-red-400/50 bg-red-500/10 text-muted line-through"
                  : "border-line bg-surface hover:bg-surface-strong disabled:opacity-60"
            }`}
          >
            <span className="block font-semibold">{o.label}</span>
            {o.sub && <span className="block text-xs text-muted">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

function CoverRound({
  quizId,
  round,
  options,
  busy,
  onAnswer,
}: {
  quizId: string;
  round: QuizRoundView;
  options: Option[];
  busy: boolean;
  onAnswer: (input: QuizInput) => void;
}) {
  const src = `/api/quiz/${quizId}/rounds/${round.index}/cover?s=${round.done ? "full" : round.step}`;
  return (
    <div className="space-y-4">
      <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- мъничко изображение, уголемено пикселизирано */}
        <img src={src} alt="Корица на албума" className="h-full w-full object-cover" style={{ imageRendering: round.done ? "auto" : "pixelated" }} />
      </div>
      <div className="flex items-center justify-center gap-1.5" aria-label={`Стъпка ${round.step + 1} от 5`}>
        {COVER_POINTS.map((p, i) => (
          <span key={p} className={`h-1.5 w-8 rounded-full ${i <= round.step ? "bg-accent" : "bg-surface-strong"}`} />
        ))}
      </div>
      <p className="text-center text-sm text-muted">
        {round.done ? " " : `Сега: ${COVER_POINTS[round.step]} точки`}
      </p>
      <Options options={options} round={round} busy={busy} onPick={(id) => onAnswer({ kind: "option", id })} />
      {!round.done && (
        <button type="button" disabled={busy} onClick={() => onAnswer({ kind: "skip" })} className="btn-ghost w-full">
          Покажи повече
        </button>
      )}
    </div>
  );
}

function PairRound({
  prompt,
  left,
  right,
  round,
  busy,
  onAnswer,
}: {
  prompt: string;
  left: SongCard;
  right: SongCard;
  round: QuizRoundView;
  busy: boolean;
  onAnswer: (input: QuizInput) => void;
}) {
  const answer = round.answer?.kind === "pair" ? round.answer : null;
  const side = (song: SongCard, key: "left" | "right") => {
    const isCorrect = answer?.correct === key;
    return (
      <button
        type="button"
        disabled={busy || round.done}
        onClick={() => onAnswer({ kind: "pair", pick: key })}
        className={`card flex flex-col items-center gap-2 p-3 text-center transition hover:bg-surface-strong ${
          answer ? (isCorrect ? "border-emerald-400 bg-emerald-400/15" : "opacity-70") : ""
        }`}
      >
        {song.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- корица от Deezer CDN
          <img src={song.cover} alt="" width={160} height={160} className="aspect-square w-full max-w-40 rounded-xl object-cover" />
        )}
        <span className="line-clamp-2 font-semibold">{song.title}</span>
        <span className="text-xs text-muted">{song.artist}</span>
        {answer && <span className="font-display text-lg font-bold">{key === "left" ? answer.left : answer.right}</span>}
        {answer && <Notes notes={key === "left" ? answer.leftNotes : answer.rightNotes} center />}
      </button>
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-center font-display text-lg font-bold">{prompt}</p>
      <div className="grid grid-cols-2 gap-3">
        {side(left, "left")}
        {side(right, "right")}
      </div>
    </div>
  );
}

function YearRound({
  song,
  min,
  max,
  round,
  busy,
  onAnswer,
  onPlay,
}: {
  song: SongCard;
  min: number;
  max: number;
  round: QuizRoundView;
  busy: boolean;
  onAnswer: (input: QuizInput) => void;
  onPlay?: (seconds?: number) => void;
}) {
  const [year, setYear] = useState(Math.round((min + max) / 2) + 5);
  const actual = round.answer?.kind === "year" ? round.answer.year : null;
  const guessed = round.attempts[0]?.input.kind === "year" ? round.attempts[0].input.year : null;
  return (
    <div className="space-y-4">
      <p className="text-center font-display text-lg font-bold">Коя година е излязла?</p>
      <SongLine song={song} />
      {onPlay && <PlayButton onPlay={() => onPlay()} label="Чуй откъс" />}
      <div className="card space-y-3 p-4">
        <p className="text-center font-display text-4xl font-bold tabular-nums">{round.done && guessed !== null ? guessed : year}</p>
        <input
          type="range"
          min={min}
          max={max}
          value={year}
          disabled={round.done}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Година"
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-xs text-muted">
          <span>{min}</span>
          <span>{max}</span>
        </div>
        {!round.done && (
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => setYear((y) => Math.max(min, y - 1))} className="btn-ghost px-4 py-2" aria-label="Година назад">
              −1
            </button>
            <button type="button" onClick={() => setYear((y) => Math.min(max, y + 1))} className="btn-ghost px-4 py-2" aria-label="Година напред">
              +1
            </button>
          </div>
        )}
        {actual !== null && <p className="text-center text-sm">Излязла е през <strong>{actual}</strong></p>}
      </div>
      {!round.done && (
        <button type="button" disabled={busy} onClick={() => onAnswer({ kind: "year", year })} className="btn-primary w-full">
          Това е годината
        </button>
      )}
    </div>
  );
}

function OrderRound({
  items,
  artist,
  round,
  busy,
  onAnswer,
}: {
  items: SongCard[];
  artist?: string;
  round: QuizRoundView;
  busy: boolean;
  onAnswer: (input: QuizInput) => void;
}) {
  const submitted = round.attempts[0]?.input.kind === "order" ? round.attempts[0].input.ids : null;
  const [order, setOrder] = useState<string[]>(submitted ?? items.map((i) => i.id));
  const answer = round.answer?.kind === "order" ? round.answer : null;
  const years = answer?.years ?? null;
  const placed = years ? orderPlacement(order, years) : null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    setOrder(next);
  };
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="font-display text-lg font-bold">От най-старата до най-новата</p>
        {artist && <p className="text-sm text-muted">Песни на {artist}</p>}
      </div>
      {placed && (
        <p className="text-center text-sm">
          На точното си място: <strong>{placed.filter(Boolean).length} от {placed.length}</strong> (по 20 т.)
        </p>
      )}
      <ol className="space-y-2">
        {order.map((id, i) => {
          const song = byId.get(id) as SongCard;
          const ok = placed?.[i];
          const rightPlace = answer ? answer.ids.indexOf(id) + 1 : 0;
          return (
            <li key={id} className={`card flex items-center gap-2 p-2 ${placed ? (ok ? "border-emerald-400/60" : "border-red-400/60") : ""}`}>
              <span className="w-5 text-center text-sm text-muted">{placed ? (ok ? "✅" : "❌") : i + 1}</span>
              {song.cover && (
                // eslint-disable-next-line @next/next/no-img-element -- корица от Deezer CDN
                <img src={song.cover} alt="" width={40} height={40} className="rounded-md" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{song.title}</span>
                {placed && !ok && <span className="block text-xs text-red-200">Мястото ѝ е № {rightPlace}</span>}
                {answer?.notes?.[id] && <Notes notes={answer.notes[id]} />}
              </span>
              {years ? (
                <span className="font-display font-bold">{years[id]}</span>
              ) : (
                <span className="flex gap-1">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="btn-ghost px-3 py-1.5 text-sm" aria-label="Нагоре">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="btn-ghost px-3 py-1.5 text-sm" aria-label="Надолу">
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!round.done && (
        <button type="button" disabled={busy} onClick={() => onAnswer({ kind: "order", ids: order })} className="btn-primary w-full">
          Провери
        </button>
      )}
    </div>
  );
}

function answerText(answer: Answer | null): string | null {
  if (!answer) return null;
  if (answer.kind === "option") return answer.label;
  if (answer.kind === "year") return String(answer.year);
  return null;
}

function feedbackDetail(round: QuizRoundView): string | null {
  const a = round.answer;
  if (!a) return null;
  if (a.kind === "pair") return a.diff ?? null;
  if (a.kind === "year") {
    const guess = round.attempts[0]?.input;
    if (guess?.kind !== "year") return null;
    const off = Math.abs(guess.year - a.year);
    if (off === 0) return "Позна точната година!";
    return `Твоят отговор: ${guess.year} — ${off} ${off === 1 ? "година" : "години"} ${guess.year < a.year ? "по-рано" : "по-късно"}`;
  }
  if (a.kind === "option" && round.question.kind === "cover") {
    const tries = round.attempts.length;
    const nth = ["първата", "втората", "третата", "четвъртата", "петата"][tries - 1] ?? `${tries}-ата`;
    return round.correct ? `Позна на ${nth} стъпка` : null;
  }
  return null;
}

function Feedback({ round, type }: { round: QuizRoundView; type: QuizType }) {
  const good = round.points > 0;
  const text = answerText(round.answer);
  const detail = feedbackDetail(round);
  return (
    <div className={`card space-y-2 p-4 text-center ${good ? "border-emerald-400/50" : "border-red-400/40"}`}>
      <p className="font-display text-lg font-bold">
        {round.correct ? `Точно! +${round.points}` : good ? `Близо! +${round.points}` : type === "newer" || type === "higher" ? "Край на серията" : "Не позна"}
      </p>
      {text && !round.correct && (
        <p className="text-sm">
          Верният отговор: <strong>{text}</strong>
        </p>
      )}
      {detail && <p className="text-sm text-muted">{detail}</p>}
      {round.reveal && <SongLine song={round.reveal} />}
    </div>
  );
}

// --- Резултат ---

function resultLabel(r: QuizRoundView): string {
  const q = r.question;
  if (q.kind === "pair") return `${q.left.title} или ${q.right.title}`;
  if (q.kind === "order") return q.artist ? `Хронология · ${q.artist}` : "Хронология";
  return "";
}

function shareLine(quiz: QuizView, meta: QuizMeta): string {
  const marks = quiz.rounds.map((r) => (r.correct ? "🟩" : r.points > 0 ? "🟨" : "🟥")).join("");
  return `${meta.icon} ${meta.title}${quiz.daily ? ` · ${quiz.daily}` : ""}\n${marks} ${quiz.total} т.\nhttps://poznai-pesenta.vercel.app/igri/${meta.type}${quiz.daily ? "?daily=1" : ""}`;
}

function QuizResults({ quiz, meta, onRestart, unlocked }: { quiz: QuizView; meta: QuizMeta; onRestart: () => void; unlocked: Unlock[] }) {
  const [copied, setCopied] = useState(false);
  const streak = meta.length === "streak";
  const correct = quiz.rounds.filter((r) => r.correct).length;
  const share = async () => {
    const text = shareLine(quiz, meta);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // отказано споделяне — нищо
    }
  };
  return (
    <div className="animate-rise space-y-5">
      <UnlockToasts items={unlocked} />
      <div className="rounded-3xl bg-gradient-to-br from-accent via-[#d63a9a] to-accent-2 p-6 text-center shadow-xl shadow-accent/20">
        <p className="text-sm text-white/80">{quiz.label}</p>
        <p className="mt-1 font-display text-6xl font-bold">{quiz.total}</p>
        <p className="text-white/85">
          {streak ? `серия от ${correct} (по ${STREAK_POINTS} т.)` : `точки · ${correct} от ${quiz.rounds.length} верни`}
        </p>
      </div>
      {!streak && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card p-3">
            <p className="font-display text-2xl font-bold text-emerald-300">{correct}</p>
            <p className="text-xs text-muted">точни</p>
          </div>
          <div className="card p-3">
            <p className="font-display text-2xl font-bold text-amber-300">{quiz.rounds.filter((r) => !r.correct && r.points > 0).length}</p>
            <p className="text-xs text-muted">частично</p>
          </div>
          <div className="card p-3">
            <p className="font-display text-2xl font-bold">{quiz.rounds.length ? Math.round(quiz.total / quiz.rounds.length) : 0}</p>
            <p className="text-xs text-muted">средно т.</p>
          </div>
        </div>
      )}
      <ol className="space-y-2">
        {quiz.rounds.map((r) => (
          <li key={r.index} className="card flex items-center gap-3 p-2">
            <span className="w-5 text-right text-sm text-muted">{r.index + 1}</span>
            <span aria-hidden>{r.correct ? "✅" : r.points > 0 ? "🟨" : "❌"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{r.reveal ? `${r.reveal.title} – ${r.reveal.artist}` : (answerText(r.answer) ?? resultLabel(r))}</span>
              {r.reveal?.notes && <Notes notes={r.reveal.notes} />}
            </span>
            <span className="w-10 text-right font-semibold">{r.points}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        {quiz.daily ? (
          <button type="button" onClick={share} className="btn-primary">
            {copied ? "Копирано ✓" : "Сподели резултата"}
          </button>
        ) : (
          <button type="button" onClick={onRestart} className="btn-primary">
            Пусни пак
          </button>
        )}
        <Link href="/igri" className="btn-ghost">
          Всички игри
        </Link>
      </div>
    </div>
  );
}
