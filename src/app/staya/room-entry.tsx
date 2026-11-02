"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GameSource } from "@/lib/game/source";
import { ROOM_ROUND_OPTIONS } from "@/lib/room/types";
import { loadName, saveName, saveToken } from "./room-storage";

export interface SourceOption {
  label: string;
  source: GameSource;
  count: number;
}

const input = "field";
const primary = "btn-primary";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Грешка";
    throw new Error(message);
  }
  return data as T;
}

export function RoomEntry({ options }: { options: SourceOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [rounds, setRounds] = useState<number>(10);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // localStorage е достъпен само в браузъра.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- еднократно зареждане на запомненото име
  useEffect(() => setName(loadName()), []);

  const enter = (room: { code: string; token: string }) => {
    saveToken(room.code, room.token);
    saveName(name.trim());
    router.push(`/staya/${room.code}`);
  };

  const create = async () => {
    setBusy("create");
    setError(null);
    try {
      enter(await post<{ code: string; token: string }>("/api/rooms", { name, source: options[sourceIndex]?.source, rounds }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
      setBusy(null);
    }
  };

  const join = async () => {
    setBusy("join");
    setError(null);
    try {
      enter(await post<{ code: string; token: string }>(`/api/rooms/${encodeURIComponent(code.trim())}/join`, { name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <label className="block space-y-1">
        <span className="text-sm text-muted">Твоето име</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="напр. Мария" className={input} />
      </label>

      {error && <p className="rounded-lg bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-3 rounded-xl bg-surface p-4">
          <h2 className="font-semibold">Влез в стая</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="КОД (6 символа)"
            autoCapitalize="characters"
            className={`${input} font-mono text-lg tracking-[0.3em]`}
          />
          <button type="button" onClick={join} disabled={busy !== null || !name.trim() || code.trim().length !== 6} className={`${primary} w-full`}>
            {busy === "join" ? "Влизам…" : "Влез"}
          </button>
        </section>

        <section className="space-y-3 rounded-xl bg-surface p-4">
          <h2 className="font-semibold">Създай стая</h2>
          <select value={sourceIndex} onChange={(e) => setSourceIndex(Number(e.target.value))} className={input} aria-label="Песни">
            {options.map((o, i) => (
              <option key={i} value={i}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
          <div role="radiogroup" aria-label="Брой песни" className="flex gap-2">
            {ROOM_ROUND_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rounds === n}
                onClick={() => setRounds(n)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                  rounds === n ? "border-accent bg-accent/20" : "border-line text-muted"
                }`}
              >
                {n} песни
              </button>
            ))}
          </div>
          <button type="button" onClick={create} disabled={busy !== null || !name.trim() || options.length === 0} className={`${primary} w-full`}>
            {busy === "create" ? "Подготвям песните…" : "Създай"}
          </button>
        </section>
      </div>
    </div>
  );
}
