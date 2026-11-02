"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { SongCombobox, type SongOption } from "@/components/song-combobox";
import {
  addTrackToPlaylistAction,
  createGenreAction,
  createPlaylistAction,
  findArtistCandidates,
  importArtistAction,
  loginAction,
  type ActionResult,
  type CandidatesResult,
} from "./actions";

const input = "field py-2";
const primary = "btn-primary py-2";

function Message({ result }: { result: ActionResult | null }) {
  if (!result?.message) return null;
  return <p className={`text-sm ${result.ok ? "text-green-300" : "text-red-300"}`}>{result.message}</p>;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mx-auto max-w-sm space-y-3 rounded-xl bg-surface p-6">
      <h1 className="font-display text-xl font-bold">Админ</h1>
      <input name="password" type="password" placeholder="Парола" autoFocus required className={input} />
      <button type="submit" disabled={pending} className={primary}>
        Вход
      </button>
      <Message result={state} />
    </form>
  );
}

/** Бутон, който иска потвърждение преди да изпрати действието. */
export function ConfirmButton({
  action,
  question,
  children,
  className,
}: {
  action: () => Promise<void>;
  question: string;
  children: ReactNode;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (asking) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        {question}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => action())}
          className="rounded bg-red-500/80 px-2 py-1 text-white"
        >
          Да
        </button>
        <button type="button" onClick={() => setAsking(false)} className="rounded bg-white/10 px-2 py-1">
          Не
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setAsking(true)} className={className}>
      {children}
    </button>
  );
}

/** Бутон за действие без потвърждение, с индикация за изпълнение. */
export function ActionButton({
  action,
  children,
  className,
}: {
  action: () => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => action())} className={className}>
      {pending ? "…" : children}
    </button>
  );
}

export function ArtistAdder({ genres }: { genres: { slug: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [found, setFound] = useState<CandidatesResult | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [international, setInternational] = useState(false);
  const [isPopFolk, setIsPopFolk] = useState(true);
  const [genreSlugs, setGenreSlugs] = useState<string[]>(["pop-folk"]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      setResult(null);
      const r = await findArtistCandidates(name, international);
      setFound(r);
      setChosen(r.recommendedId);
    });

  const doImport = () =>
    start(async () => {
      if (!found || chosen === null) return;
      setResult(await importArtistAction({ name: found.name, deezerId: chosen, isPopFolk, genreSlugs }));
      setFound(null);
      setName("");
    });

  return (
    <div className="space-y-3 rounded-xl bg-surface p-4">
      <h3 className="font-semibold">Добави артист от Deezer</h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Име (както да се показва), напр. Преслава" className={input} />
        <button type="submit" disabled={pending || name.trim().length < 2} className={primary}>
          Търси
        </button>
      </form>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={international}
          onChange={(e) => {
            setInternational(e.target.checked);
            // Чуждестранните по подразбиране не са поп-фолк.
            if (e.target.checked) {
              setIsPopFolk(false);
              setGenreSlugs((cur) => cur.filter((s) => s !== "pop-folk"));
            }
          }}
        />
        Чуждестранен изпълнител (напр. Drake) — без проверката за български профил
      </label>

      {found?.error && <p className="text-sm text-red-300">{found.error}</p>}

      {found && found.candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {found.recommendedId
              ? "Намерен е сигурен профил (маркиран). Можеш да избереш друг."
              : "Несигурно съвпадение — избери правилния профил:"}
          </p>
          <ul className="space-y-1">
            {found.candidates.map((c) => (
              <li key={c.id}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 ${chosen === c.id ? "bg-accent/20 ring-1 ring-accent" : "bg-background"}`}>
                  <input type="radio" name="candidate" checked={chosen === c.id} onChange={() => setChosen(c.id)} />
                  {c.picture && (
                    // eslint-disable-next-line @next/next/no-img-element -- снимка от Deezer CDN
                    <img src={c.picture} alt="" width={40} height={40} className="rounded-full" />
                  )}
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{c.name}</span>{" "}
                    <span className="text-muted">
                      · {c.fans} фена · {c.albums} албума · бълг. {Math.round(c.bgScore * 100)}%
                    </span>
                    <span className="block truncate text-xs text-muted">{c.sample.join(" / ") || "няма песни"}</span>
                  </span>
                  <a href={`https://www.deezer.com/artist/${c.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                    Deezer
                  </a>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={isPopFolk} onChange={(e) => setIsPopFolk(e.target.checked)} /> Поп-фолк
            </label>
            {genres.map((g) => (
              <label key={g.slug} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={genreSlugs.includes(g.slug)}
                  onChange={(e) =>
                    setGenreSlugs((cur) => (e.target.checked ? [...cur, g.slug] : cur.filter((s) => s !== g.slug)))
                  }
                />
                {g.name}
              </label>
            ))}
          </div>
          <button type="button" onClick={doImport} disabled={pending || chosen === null} className={primary}>
            {pending ? "Внасям песните…" : "Внеси избрания"}
          </button>
        </div>
      )}
      <Message result={result} />
    </div>
  );
}

export function GenreForm() {
  const [state, action, pending] = useActionState(createGenreAction, null);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="name" placeholder="Нов жанр, напр. Чалга" required className={`${input} flex-1`} />
      <button type="submit" disabled={pending} className={primary}>
        Създай
      </button>
      <Message result={state} />
    </form>
  );
}

export function PlaylistForm() {
  const [state, action, pending] = useActionState(createPlaylistAction, null);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input name="name" placeholder="Име на плейлиста" required className={input} />
      <input name="description" placeholder="Описание (по желание)" className={input} />
      <select name="category" className={input} defaultValue="">
        <option value="">Секция „Плейлисти“</option>
        <option value="pop-folk">Секция „Поп-фолк“</option>
      </select>
      <button type="submit" disabled={pending} className={primary}>
        Създай
      </button>
      <Message result={state} />
    </form>
  );
}

export function PlaylistTrackAdder({ playlistId }: { playlistId: string }) {
  const [selected, setSelected] = useState<SongOption | null>(null);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selected) return;
        start(async () => {
          setResult(await addTrackToPlaylistAction(playlistId, selected.deezerId));
          setSelected(null);
          setRound((r) => r + 1);
        });
      }}
    >
      <SongCombobox key={round} selected={selected} onSelect={setSelected} disabled={pending} />
      <button type="submit" disabled={!selected || pending} className={primary}>
        Добави
      </button>
      <Message result={result} />
    </form>
  );
}
