"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface SongOption {
  deezerId: string;
  title: string;
  artist: string;
  cover: string | null;
}

const DEBOUNCE_MS = 250;
/** Колко да изчакаме след загуба на фокус, преди да затворим списъка (за да мине докосването на iPhone). */
const BLUR_CLOSE_MS = 250;
const MIN_CHARS = 2;

type Status = "idle" | "loading" | "done" | "error";

/**
 * Поле за търсене с падащо меню „Заглавие – Артист“.
 * Играчът не пише свободен отговор — избира песен от менюто.
 * Клавиатура: ↑/↓ избор, Enter потвърждава, Esc затваря.
 */
export function SongCombobox({
  selected,
  onSelect,
  disabled,
  autoFocus,
}: {
  selected: SongOption | null;
  onSelect: (option: SongOption | null) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(selected ? `${selected.title} – ${selected.artist}` : "");
  const [results, setResults] = useState<SongOption[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = selected ? "" : text.trim();

  useEffect(() => {
    if (query.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: SongOption[] };
        setResults(body.results);
        setActive(body.results.length > 0 ? 0 : -1);
        setStatus("done");
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
          setStatus("error");
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Активният ред да е видим — само при навигация със стрелки. Иначе (напр. при идване на резултати)
  // scrollIntoView на iPhone с отворена клавиатура мести страницата точно докато потребителят докосва.
  const keyboardNav = useRef(false);
  /** Последното натискане върху ред беше с пръст (не с мишка). */
  const touchRef = useRef(false);
  useEffect(() => {
    if (active < 0 || !keyboardNav.current) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // iPhone (Safari): докосването на ред първо маха фокуса от полето и чак после идва click.
  // Ако списъкът се затвори веднага при blur, редът изчезва и изборът не се случва
  // (бутонът „Познай“ остава сив). Затова затваряме със закъснение.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);

  const choose = (option: SongOption, viaTouch = false) => {
    cancelClose();
    onSelect(option);
    setText(`${option.title} – ${option.artist}`);
    setOpen(false);
    // На телефон скриваме клавиатурата, за да се види веднага бутонът „Познай“.
    if (viaTouch) inputRef.current?.blur();
  };

  const showList = open && query.length >= MIN_CHARS;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      if (results.length === 0) return;
      keyboardNav.current = true;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + results.length) % results.length);
    } else if (e.key === "Enter") {
      // Отворено меню: Enter избира. Затворено с избрана песен: Enter изпраща формата.
      if (showList && active >= 0 && results[active]) {
        e.preventDefault();
        choose(results[active]);
      } else if (!selected) {
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      if (showList) {
        e.preventDefault();
        setOpen(false);
      } else if (text) {
        e.preventDefault();
        setText("");
        onSelect(null);
      }
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/30">
        {!selected?.cover && (
          <span className="text-muted" aria-hidden>
            🔎
          </span>
        )}
        {selected?.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
          <img src={selected.cover} alt="" width={28} height={28} className="rounded" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Търси песен или изпълнител"
          placeholder="Търси песен или изпълнител…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          autoFocus={autoFocus}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (e.target.value.trim().length < MIN_CHARS) {
              setResults([]);
              setStatus("idle");
            }
            if (selected) onSelect(null);
          }}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={() => {
            cancelClose();
            closeTimer.current = setTimeout(() => setOpen(false), BLUR_CLOSE_MS);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent py-3 text-base text-foreground outline-none placeholder:text-muted"
        />
        {text && !disabled && (
          <button
            type="button"
            aria-label="Изчисти"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              setText("");
              setResults([]);
              setStatus("idle");
              onSelect(null);
              inputRef.current?.focus();
            }}
            className="px-1 text-muted hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {showList && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Песни"
          className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-popup p-1 shadow-2xl shadow-black/50 sm:bottom-auto sm:top-full sm:mt-2 sm:mb-0"
        >
          {status === "loading" && results.length === 0 && <li className="px-3 py-2 text-sm text-muted">Търся…</li>}
          {status === "error" && <li className="px-3 py-2 text-sm text-red-300">Търсенето не работи. Опитай пак.</li>}
          {status === "done" && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">Няма намерени песни</li>
          )}
          {results.map((r, i) => (
            <li
              key={r.deezerId}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              // preventDefault: иначе input-ът губи фокус преди клика (особено на телефон).
              onPointerDown={(e) => {
                e.preventDefault();
                touchRef.current = e.pointerType !== "mouse";
              }}
              onClick={() => choose(r, touchRef.current)}
              // Подсветка при посочване — само с мишка (на iPhone промени при „hover“ искат второ докосване).
              onPointerMove={(e) => {
                if (e.pointerType !== "mouse") return;
                keyboardNav.current = false;
                setActive(i);
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 ${i === active ? "bg-white/10" : ""}`}
            >
              {r.cover ? (
                // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
                <img src={r.cover} alt="" width={36} height={36} loading="lazy" className="shrink-0 rounded" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded bg-white/10" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.title}</span>
                <span className="block truncate text-xs text-muted">{r.artist}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
