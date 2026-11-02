"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { roundSquares, shareText } from "@/lib/game/daily-shared";
import { computeStats, toRecord, type DailyHistory, type DailyStats } from "@/lib/game/daily-stats";
import type { RankedEntry } from "@/lib/game/leaderboard";
import { LAST_STEP, ROUNDS_PER_GAME, POINTS, STEPS, type GameView } from "@/lib/game/rules";
import { finale } from "@/lib/effects";
import { loadName, saveName } from "@/lib/player-name";
import { StepSquares } from "./step-squares";

function verdict(ratio: number): string {
  if (ratio >= 0.8) return "Легенда! 🔥";
  if (ratio >= 0.6) return "Много добре! 🎉";
  if (ratio >= 0.4) return "Добре се справи 👏";
  if (ratio >= 0.2) return "Има какво да се желае 🙂";
  return "Следващия път 💪";
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Грешка";
    throw new Error(message);
  }
  return data as T;
}

/** Споделяне на текст: системното меню на телефон, иначе копиране. */
async function shareOrCopy(text: string, url?: string): Promise<"shared" | "copied" | "failed"> {
  if (navigator.share) {
    try {
      await navigator.share(url ? { text, url } : { text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function Results({
  game,
  onRestart,
  shareDate,
  challengeCode,
}: {
  game: GameView;
  onRestart?: () => void;
  /** Дата на дневното предизвикателство — показва статистика, класация за деня и „Сподели“. */
  shareDate?: string;
  /** Код, ако това е игра по предизвикателство — показва сравнение с приятеля. */
  challengeCode?: string;
}) {
  const max = ROUNDS_PER_GAME * POINTS[0];
  const solved = game.rounds.filter((r) => r.solvedAtStep !== null).length;

  // Голямо конфети за добър резултат — веднъж при показване.
  useEffect(() => {
    if (game.total >= max * 0.6) finale();
  }, [game.total, max]);

  return (
    <div className="animate-rise space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-[#d63a9a] to-accent-2 p-6 text-center shadow-xl shadow-accent/20">
        <p className="text-sm text-white/80">{game.label || "Резултат"}</p>
        <p className="mt-1 font-display text-6xl font-bold">{game.total}</p>
        <p className="text-white/80">от {max} точки</p>
        <p className="mt-3 text-lg font-semibold">{verdict(game.total / max)}</p>
        <p className="text-sm text-white/80">
          Позна {solved} от {game.rounds.length} песни
        </p>
      </div>

      {challengeCode && <ChallengeComparison code={challengeCode} game={game} />}

      <NameForm gameId={game.id} daily={Boolean(shareDate)} />

      {shareDate ? <DailyPanel game={game} date={shareDate} /> : <ChallengeButton game={game} />}

      <ol className="space-y-2">
        {game.rounds.map((r) => (
          <li key={r.index} className="card flex items-center gap-3 p-2">
            <span className="w-5 text-right text-sm text-muted">{r.index + 1}</span>
            {r.answer?.cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- външна обложка от Deezer CDN
              <img src={r.answer.cover} alt="" width={44} height={44} className="rounded-lg" />
            ) : (
              <span className="h-11 w-11 rounded-lg bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{r.answer?.title}</p>
              <p className="truncate text-xs text-muted">{r.answer?.artist}</p>
            </div>
            <StepSquares round={r} size="sm" />
            <span className={`w-10 text-right font-semibold ${r.points ? "" : "text-muted"}`}>{r.points}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        {onRestart ? (
          <button type="button" onClick={onRestart} className="btn-primary">
            ↻ Нова игра
          </button>
        ) : (
          shareDate && <p className="self-center text-center text-sm text-muted">Ново предизвикателство утре в 00:00.</p>
        )}
        <Link href="/" className="btn-ghost">
          Начало
        </Link>
        <Link href="/klasaciya" className="btn-ghost sm:col-span-2">
          🏆 Класация
        </Link>
      </div>
    </div>
  );
}

// --- Име и място в класацията ---

function NameForm({ gameId, daily }: { gameId: string; daily: boolean }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSent = useRef(false);

  const submit = async (value: string) => {
    setBusy(true);
    try {
      const r = await post<{ name: string; rank: number | null }>(`/api/game/${gameId}/name`, { name: value });
      saveName(r.name);
      setName(r.name);
      const where = daily ? "в днешното дневно" : "тази седмица";
      setStatus({ ok: true, text: r.rank ? `Ти си №${r.rank} ${where}!` : "Записано в класацията." });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Грешка" });
    } finally {
      setBusy(false);
    }
  };

  // Запомнено име → записваме автоматично (без да питаме всеки път).
  useEffect(() => {
    const saved = loadName();
    if (!saved || autoSent.current) return;
    autoSent.current = true;
    setName(saved);
    void submit(saved);
    // submit е стабилна по смисъл; пускаме само веднъж при показване.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className="card space-y-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void submit(name);
      }}
    >
      <p className="text-sm font-semibold">🏆 Класация</p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="Твоето име"
          aria-label="Име за класацията"
          className="field py-2"
        />
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary shrink-0 px-5 py-2">
          Запази
        </button>
      </div>
      {status && <p className={`text-sm ${status.ok ? "text-emerald-300" : "text-red-300"}`}>{status.text}</p>}
    </form>
  );
}

// --- Предизвикай приятел ---

function ChallengeButton({ game }: { game: GameView }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const { code } = await post<{ code: string }>(`/api/game/${game.id}/challenge`);
      const url = `${window.location.origin}/igra?vs=${code}`;
      const result = await shareOrCopy(`Направих ${game.total} точки в „Познай песента“ 🎵 Ще ме биеш ли? Същите 10 песни:`, url);
      setStatus(result === "copied" ? "Линкът е копиран — прати го на приятел." : result === "failed" ? url : null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Грешка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-2 p-4 text-center">
      <button type="button" onClick={share} disabled={busy} className="btn-primary w-full">
        ⚔️ Предизвикай приятел
      </button>
      <p className="text-xs text-muted">Приятелят ти ще чуе същите 10 песни и ще види твоя резултат.</p>
      {status && <p className="break-all text-sm text-muted">{status}</p>}
    </div>
  );
}

interface ChallengeInfo {
  name: string;
  total: number;
  rounds: { points: number; solvedAtStep: number | null }[];
}

function ChallengeComparison({ code, game }: { code: string; game: GameView }) {
  const [info, setInfo] = useState<ChallengeInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/challenge/${code}`)
      .then((r) => (r.ok ? (r.json() as Promise<ChallengeInfo>) : null))
      .then((data) => !cancelled && setInfo(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!info) return null;
  const diff = game.total - info.total;
  return (
    <div className="card space-y-3 p-4">
      <p className="text-center font-display text-xl font-bold">
        {diff > 0 ? "Победа! 🏆" : diff < 0 ? `${info.name} печели 😅` : "Равенство 🤝"}
      </p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className={`rounded-xl p-3 ${diff >= 0 ? "bg-emerald-400/15" : "bg-surface"}`}>
          <p className="text-xs text-muted">Ти</p>
          <p className="font-display text-2xl font-bold">{game.total}</p>
        </div>
        <div className={`rounded-xl p-3 ${diff <= 0 ? "bg-emerald-400/15" : "bg-surface"}`}>
          <p className="truncate text-xs text-muted">{info.name}</p>
          <p className="font-display text-2xl font-bold">{info.total}</p>
        </div>
      </div>
      <ol className="grid grid-cols-5 gap-1 text-center text-xs sm:grid-cols-10">
        {game.rounds.map((r, i) => {
          const theirs = info.rounds[i]?.points ?? 0;
          return (
            <li key={r.index} className="rounded-lg bg-surface p-1.5" title={`Песен ${i + 1}`}>
              <span className={r.points > theirs ? "text-emerald-300" : r.points < theirs ? "text-red-300" : ""}>{r.points}</span>
              <span className="block text-muted">{theirs}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// --- Дневно: статистика като в Wordle + класация за деня ---

const HISTORY_KEY = "poznai:daily-history";

function loadHistory(): DailyHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as DailyHistory) : {};
  } catch {
    return {};
  }
}

function DailyPanel({ game, date }: { game: GameView; date: string }) {
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [board, setBoard] = useState<RankedEntry[] | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Записваме днешния резултат в историята на браузъра и смятаме статистиката.
  useEffect(() => {
    const history = loadHistory();
    history[date] = toRecord(game);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // частен режим — статистиката няма да се запомни
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- данни от localStorage след показване
    setStats(computeStats(history, date));
  }, [game, date]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/leaderboard?board=daily&date=${date}`)
        .then((r) => r.json() as Promise<{ entries: RankedEntry[] }>)
        .then((d) => !cancelled && setBoard(d.entries))
        .catch(() => undefined);
    void load();
    // Обновяваме след малко — името може да се запише току-що.
    const t = setTimeout(load, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [date]);

  const share = async () => {
    const result = await shareOrCopy(shareText(game, date, `${window.location.origin}/dnevno`));
    setShareStatus(result === "copied" ? "Копирано! Постави го където искаш." : null);
  };

  const maxBar = stats ? Math.max(1, ...stats.distribution) : 1;
  const myName = loadName().toLocaleLowerCase("bg");

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 text-center">
        <pre className="mx-auto w-fit text-left text-lg leading-tight" aria-label="Резултат по рундове">
          {game.rounds.map(roundSquares).join("\n")}
        </pre>
        <button type="button" onClick={share} className="btn-primary w-full">
          Сподели резултата
        </button>
        {shareStatus && <p className="text-sm text-muted">{shareStatus}</p>}
      </div>

      {stats && (
        <div className="card space-y-4 p-4">
          <p className="text-sm font-semibold">📊 Твоята статистика</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              [stats.played, "изиграни"],
              [stats.currentStreak, "серия 🔥"],
              [stats.bestStreak, "най-добра серия"],
              [stats.average, "среден резултат"],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="font-display text-2xl font-bold">{value}</p>
                <p className="text-[11px] leading-tight text-muted">{label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted">На коя стъпка познаваш (всички дни)</p>
            {stats.distribution.map((count, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-right text-muted">{i <= LAST_STEP ? `${STEPS[i]} сек.` : "не"}</span>
                <span
                  className={`h-5 rounded-md px-2 text-right leading-5 ${i <= LAST_STEP ? "bg-gradient-to-r from-accent to-accent-2" : "bg-white/15"}`}
                  style={{ width: `${Math.max(8, (count / maxBar) * 100)}%` }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card space-y-2 p-4">
        <p className="text-sm font-semibold">🏆 Днешна класация</p>
        {!board && <p className="text-sm text-muted">Зареждане…</p>}
        {board?.length === 0 && <p className="text-sm text-muted">Още няма никой — запиши името си и бъди първи.</p>}
        <ol className="space-y-1">
          {board?.slice(0, 10).map((e) => (
            <li
              key={`${e.name}-${e.at}`}
              className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${e.name.toLocaleLowerCase("bg") === myName ? "bg-accent/15" : ""}`}
            >
              <span className="w-6 text-right text-muted">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="font-semibold">{e.total}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
