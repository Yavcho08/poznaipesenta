"use client";

import { useEffect, useState } from "react";

const KEY = "poznai:volume";
const DEFAULT = 0.8;

function load(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { volume: DEFAULT, muted: false };
    const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
    const volume = typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT;
    return { volume, muted: parsed.muted === true };
  } catch {
    return { volume: DEFAULT, muted: false };
  }
}

/**
 * Сила на звука: бутон за заглушаване + плъзгач. Помни се в браузъра.
 * `onChange` получава ефективната сила (0 при заглушен звук).
 */
export function VolumeControl({ onChange }: { onChange: (volume: number) => void }) {
  const [volume, setVolume] = useState(DEFAULT);
  const [muted, setMuted] = useState(false);
  // Докато запомнената стойност не е прочетена, не записваме — иначе началната я презаписва.
  const [loaded, setLoaded] = useState(false);

  // localStorage е достъпен само в браузъра — четем го след първото изобразяване.
  useEffect(() => {
    const saved = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- еднократно четене от localStorage
    setVolume(saved.volume);
    setMuted(saved.muted);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    onChange(muted ? 0 : volume);
    try {
      localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
    } catch {
      // частен режим — просто няма да се запомни
    }
  }, [loaded, volume, muted, onChange]);

  const effective = muted ? 0 : volume;
  const icon = effective === 0 ? "🔇" : effective < 0.4 ? "🔈" : effective < 0.75 ? "🔉" : "🔊";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          // Заглушаване; ако плъзгачът е на 0, „включи“ връща разумна сила.
          if (muted || volume === 0) {
            setMuted(false);
            if (volume === 0) setVolume(DEFAULT);
          } else {
            setMuted(true);
          }
        }}
        aria-label={effective === 0 ? "Включи звука" : "Заглуши"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg hover:bg-surface-strong"
      >
        {icon}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(effective * 100)}
        onChange={(e) => {
          setVolume(Number(e.target.value) / 100);
          setMuted(false);
        }}
        aria-label="Сила на звука"
        className="h-1.5 w-full min-w-16 cursor-pointer accent-[var(--accent)]"
      />
    </div>
  );
}
