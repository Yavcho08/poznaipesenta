"use client";

import { useEffect, useState } from "react";
import type { Playback } from "@/lib/audio/clip-player";
import { STEPS } from "@/lib/game/rules";

/**
 * Лента на прогреса. С `step` — 5 равни сегмента, по един за всеки откъс (0.2/1/2/5/10 сек.):
 * при линейна скала 0.2 сек. е 2% от лентата и не се вижда. Отключените сегменти са оцветени,
 * а запълването се движи сегмент по сегмент. С `step = null` (след рунда, целият откъс) — линейна лента.
 */
export function ClipProgress({
  playback,
  now,
  step,
}: {
  playback: Playback | null;
  now: () => number;
  step: number | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!playback) return;
    let frame = requestAnimationFrame(function tick() {
      setElapsed(Math.max(0, Math.min(now() - playback.startedAt, playback.duration)));
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setElapsed(0);
    };
  }, [playback, now]);

  const t = playback ? elapsed : 0;

  if (step === null) {
    const total = playback?.duration ?? 30;
    return (
      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${(t / total) * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>{t.toFixed(1)} сек.</span>
          <span>{total.toFixed(0)} сек.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" aria-hidden>
      <div className="flex gap-1">
        {STEPS.map((end, k) => {
          const start = k === 0 ? 0 : STEPS[k - 1];
          const fill = Math.max(0, Math.min(1, (t - start) / (end - start)));
          const unlocked = k <= step;
          return (
            <div key={end} className={`relative h-3 flex-1 overflow-hidden rounded-full ${unlocked ? "bg-accent/25" : "bg-white/[0.06]"}`}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[11px]">
        {STEPS.map((end, k) => (
          <span key={end} className={`flex-1 text-right ${k <= step ? "text-foreground" : "text-muted/60"}`}>
            {end} с
          </span>
        ))}
      </div>
    </div>
  );
}
