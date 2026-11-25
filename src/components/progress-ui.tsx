// Ниво, серия и постижения — визуални елементи (без състояние; ползват се и в server components).

import type { LevelInfo, Streak } from "@/lib/achievements/progress";

export function LevelBar({ info }: { info: LevelInfo }) {
  const pct = info.span > 0 ? Math.min(100, Math.round((info.into / info.span) * 100)) : 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-display text-lg font-bold">Ниво {info.level}</span>
        <span className="text-muted tabular-nums">
          {info.into.toLocaleString("bg-BG")} / {info.span.toLocaleString("bg-BG")} XP
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-strong" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="До следващото ниво">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted">Общо {info.xp.toLocaleString("bg-BG")} XP</p>
    </div>
  );
}

export function StreakBadge({ streak }: { streak: Streak }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className={`text-3xl ${streak.current > 0 ? "" : "opacity-40 grayscale"}`} aria-hidden>
        🔥
      </span>
      <div className="min-w-0">
        <p className="font-display text-lg font-bold">
          {streak.current} {streak.current === 1 ? "ден" : "дни"} поред
        </p>
        <p className="text-xs text-muted">
          Най-дълга: {streak.best} · {streak.playedToday ? "Днешното е изиграно ✓" : "Изиграй днешното, за да не прекъснеш серията"}
        </p>
      </div>
    </div>
  );
}

export interface AchievementItem {
  code: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  unlockedAt: Date | null;
}

export function AchievementGrid({ items }: { items: AchievementItem[] }) {
  const unlocked = items.filter((a) => a.unlockedAt).length;
  const sorted = [...items].sort((a, b) => Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt)) || b.progress / b.target - a.progress / a.target);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Отключени: <strong className="text-foreground">{unlocked}</strong> от {items.length}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((a) => {
          const done = Boolean(a.unlockedAt);
          const pct = Math.min(100, Math.round((a.progress / a.target) * 100));
          return (
            <li key={a.code} className={`card flex items-center gap-3 p-3 ${done ? "border-accent/40" : ""}`}>
              <span className={`text-3xl ${done ? "" : "opacity-35 grayscale"}`} aria-hidden>
                {a.icon}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-semibold">{a.name}</p>
                <p className="text-xs text-muted">{a.description}</p>
                {done ? (
                  <p className="text-xs text-accent">Отключено {a.unlockedAt?.toLocaleDateString("bg-BG")}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-strong">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted">
                      {a.progress}/{a.target}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
