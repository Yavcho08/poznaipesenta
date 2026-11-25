"use client";

import { useEffect, useState } from "react";

export interface Unlock {
  code: string;
  name: string;
  description: string;
  icon: string;
}

/** Анимирано известие „Ново постижение!“ (по едно, ~4 сек. всяко). */
export function UnlockToasts({ items }: { items: Unlock[] }) {
  const [shown, setShown] = useState(0);
  const current = items[shown];

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setShown((n) => n + 1), 4200);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div
        key={current.code}
        className="animate-rise pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-accent/50 bg-popup/95 px-4 py-3 shadow-2xl shadow-accent/30 backdrop-blur"
      >
        <span className="text-3xl" aria-hidden>
          {current.icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Ново постижение!</p>
          <p className="font-display font-bold">{current.name}</p>
          <p className="text-xs text-muted">{current.description}</p>
        </div>
      </div>
    </div>
  );
}
