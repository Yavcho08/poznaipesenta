"use client";

import { useEffect, useState } from "react";

/** Секунди до полунощ по българско време (тогава сменя дневното предизвикателство). */
function secondsToSofiaMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return 86400 - (get("hour") * 3600 + get("minute") * 60 + get("second"));
}

const pad = (n: number) => String(n).padStart(2, "0");

export function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(secondsToSofiaMidnight());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  if (left === null) return <span className="tabular-nums">--:--:--</span>;
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {pad(Math.floor(left / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
    </span>
  );
}
