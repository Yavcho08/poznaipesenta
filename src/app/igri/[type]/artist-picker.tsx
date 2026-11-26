"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { looseKey } from "@/lib/normalize";

interface PickerArtist {
  id: string;
  name: string;
  count: number;
}

const MAX_ARTISTS = 30;

/** Избор на един или няколко артиста за играта (?type=artists&id=a,b,c). */
export function ArtistPicker({ type, artists, selected: initial }: { type: string; artists: PickerArtist[]; selected: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(initial.length > 0);
  const [selected, setSelected] = useState<string[]>(initial);
  const [filter, setFilter] = useState("");
  const byId = useMemo(() => new Map(artists.map((a) => [a.id, a])), [artists]);
  const shown = useMemo(() => {
    const key = looseKey(filter);
    const list = key ? artists.filter((a) => looseKey(a.name).includes(key)) : [...artists].sort((a, b) => b.count - a.count);
    return list.slice(0, 60);
  }, [artists, filter]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ARTISTS ? s : [...s, id]));
  const songs = selected.reduce((sum, id) => sum + (byId.get(id)?.count ?? 0), 0);
  const changed = selected.join(",") !== initial.join(",");

  const apply = () => {
    router.push(selected.length ? `/igri/${type}?type=artists&id=${selected.map(encodeURIComponent).join(",")}` : `/igri/${type}`);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost w-full py-2 text-sm">
        🎤 Играй само с песни на избрани артисти…
      </button>
    );
  }

  return (
    <div className="card space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Избери един или няколко артиста</p>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted" aria-label="Скрий">
          ×
        </button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="rounded-full bg-accent/25 px-3 py-1 text-xs font-semibold"
              aria-label={`Махни ${byId.get(id)?.name ?? ""}`}
            >
              {byId.get(id)?.name ?? "?"} ×
            </button>
          ))}
        </div>
      )}

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Търси артист…"
        aria-label="Търси артист"
        className="field py-2"
      />
      <ul className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
        {shown.map((a) => {
          const on = selected.includes(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => toggle(a.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${on ? "bg-accent/20" : "hover:bg-surface-strong"}`}
              >
                <span aria-hidden>{on ? "☑" : "☐"}</span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-xs text-muted">{a.count}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted">Няма такъв артист</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs text-muted">
          {selected.length ? `${selected.length} ${selected.length === 1 ? "артист" : "артиста"} · ${songs} песни` : "Целият поп-фолк"}
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])} className="btn-ghost px-3 py-1.5 text-xs">
            Изчисти
          </button>
        )}
        <button type="button" onClick={apply} disabled={!changed} className="btn-primary px-4 py-1.5 text-sm">
          Играй с тях
        </button>
      </div>
    </div>
  );
}
