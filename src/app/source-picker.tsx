"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ROUNDS_PER_GAME } from "@/lib/game/rules";
import { sourceToQuery, type GameSource } from "@/lib/game/source";
import { looseKey } from "@/lib/normalize";

export interface PickerArtist {
  id: string;
  name: string;
  imageUrl: string | null;
  isPopFolk: boolean;
  count: number;
}

export interface PickerData {
  popFolkCount: number;
  genres: { slug: string; name: string; count: number; images: string[] }[];
  artists: PickerArtist[];
  playlists: {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    source: "curated" | "deezer" | "spotify";
    count: number;
  }[];
}

type Tab = "popfolk" | "genres" | "artists" | "playlists";

const TABS: { id: Tab; label: string }[] = [
  { id: "popfolk", label: "Поп-фолк" },
  { id: "genres", label: "Жанрове" },
  { id: "artists", label: "Артисти" },
  { id: "playlists", label: "Плейлисти" },
];

function playHref(source: GameSource): string {
  return `/igra?${sourceToQuery(source)}`;
}

/** Припокриващи се кръгли снимки — бърз визуален намек какво има вътре. */
function Collage({ images, size = 40 }: { images: string[]; size?: number }) {
  if (images.length === 0) return null;
  return (
    <span className="flex -space-x-3" aria-hidden>
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- снимки от Deezer CDN
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="rounded-full border-2 border-background object-cover"
          style={{ width: size, height: size, zIndex: images.length - i }}
        />
      ))}
    </span>
  );
}

function SourceCard({
  source,
  title,
  subtitle,
  count,
  images = [],
}: {
  source: GameSource;
  title: string;
  subtitle?: string | null;
  count: number;
  images?: string[];
}) {
  const enough = count >= ROUNDS_PER_GAME;
  const body = (
    <>
      {images.length > 0 && (
        <span className="mb-3 block">
          <Collage images={images} size={34} />
        </span>
      )}
      <span className="block font-semibold leading-snug">{title}</span>
      {subtitle && <span className="block text-sm text-muted">{subtitle}</span>}
      <span className="mt-2 block text-xs text-muted">
        {count} песни{!enough && ` · нужни са поне ${ROUNDS_PER_GAME}`}
      </span>
    </>
  );
  return enough ? (
    <Link href={playHref(source)} className="card block p-4 transition hover:-translate-y-0.5 hover:bg-surface-strong">
      {body}
    </Link>
  ) : (
    <div className="card block p-4 opacity-40" aria-disabled>
      {body}
    </div>
  );
}

function ArtistTile({ artist, selected, onClick, href }: { artist: PickerArtist; selected?: boolean; onClick?: () => void; href?: string }) {
  const enough = artist.count >= ROUNDS_PER_GAME;
  const inner = (
    <>
      <span className={`relative block aspect-square overflow-hidden rounded-full ring-2 transition ${selected ? "ring-accent" : "ring-transparent group-hover:ring-white/30"}`}>
        {artist.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- снимка от Deezer CDN
          <img src={artist.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface-strong text-2xl">🎤</span>
        )}
        {selected && <span className="absolute inset-0 grid place-items-center bg-accent/50 text-2xl font-bold">✓</span>}
      </span>
      <span className="mt-2 block truncate text-center text-sm font-semibold">{artist.name}</span>
      <span className="block text-center text-xs text-muted">{enough ? `${artist.count} песни` : `само ${artist.count} песни`}</span>
    </>
  );
  if (href && enough) {
    return (
      <Link href={href} className="group block" title={`Играй само с песни на ${artist.name}`}>
        {inner}
      </Link>
    );
  }
  return (
    // Без onClick = плочка за директна игра на артист с малко песни → неактивна.
    <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={onClick ? selected : undefined} className={`group block w-full ${onClick ? "" : "opacity-40"}`}>
      {inner}
    </button>
  );
}

export function SourcePicker({ data }: { data: PickerData }) {
  const [tab, setTab] = useState<Tab>("popfolk");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const popFolkPlaylists = data.playlists.filter((p) => p.category === "pop-folk");
  const otherPlaylists = data.playlists.filter((p) => p.category !== "pop-folk");
  const popFolkArtists = data.artists.filter((a) => a.isPopFolk).sort((a, b) => b.count - a.count);

  const visibleArtists = useMemo(() => {
    const key = looseKey(filter);
    return key ? data.artists.filter((a) => looseKey(a.name).includes(key)) : data.artists;
  }, [data.artists, filter]);

  const selectedCount = data.artists.filter((a) => selected.includes(a.id)).reduce((s, a) => s + a.count, 0);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div className="space-y-5">
      <div role="tablist" className="card flex gap-1 overflow-x-auto p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-xl px-2 py-2.5 text-[13px] font-semibold transition sm:px-3 sm:text-sm ${
              tab === t.id ? "bg-gradient-to-r from-accent to-accent-2 text-white shadow-md shadow-accent/20" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "popfolk" && (
        <div className="animate-rise space-y-6">
          {data.popFolkCount >= ROUNDS_PER_GAME && (
            <Link
              href={playHref({ type: "popfolk" })}
              className="relative block overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-[#d63a9a] to-accent-2 p-5 shadow-xl shadow-accent/20 transition hover:-translate-y-0.5 sm:p-6"
            >
              <span className="absolute -right-6 -top-10 text-[9rem] leading-none opacity-15" aria-hidden>
                ♪
              </span>
              <Collage images={popFolkArtists.flatMap((a) => (a.imageUrl ? [a.imageUrl] : [])).slice(0, 6)} size={44} />
              <span className="mt-4 block font-display text-2xl font-bold">Целият поп-фолк</span>
              <span className="block text-sm text-white/80">
                {popFolkArtists.length} изпълнители · {data.popFolkCount} песни
              </span>
              <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-[#1a0f2e]">▶ Играй</span>
            </Link>
          )}

          {popFolkPlaylists.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted">По десетилетия</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {popFolkPlaylists.map((p) => (
                  <SourceCard key={p.id} source={{ type: "playlist", id: p.id }} title={p.name} subtitle={p.description} count={p.count} />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div>
              <h2 className="font-semibold">Избери изпълнител</h2>
              <p className="text-sm text-muted">Познавай само неговите песни.</p>
            </div>
            <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
              {popFolkArtists.map((a) => (
                <li key={a.id}>
                  <ArtistTile artist={a} href={playHref({ type: "artists", ids: [a.id] })} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === "genres" && (
        <div className="animate-rise grid gap-3 sm:grid-cols-2">
          {data.genres.map((g) => (
            <SourceCard key={g.slug} source={{ type: "genre", slug: g.slug }} title={g.name} count={g.count} images={g.images} />
          ))}
          {data.genres.length === 0 && <p className="text-sm text-muted">Още няма жанрове.</p>}
        </div>
      )}

      {tab === "artists" && (
        <div className="animate-rise space-y-4">
          <p className="text-sm text-muted">Избери един или няколко изпълнители — песните им се смесват в една игра.</p>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Филтрирай артисти…" className="field" />
          <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
            {visibleArtists.map((a) => (
              <li key={a.id}>
                <ArtistTile artist={a} selected={selected.includes(a.id)} onClick={() => toggle(a.id)} />
              </li>
            ))}
          </ul>
          <div className="card sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex items-center justify-between gap-3 bg-popup/90 p-3 sm:bottom-4">
            <span className="text-sm text-muted">
              Избрани: <strong className="text-foreground">{selected.length}</strong> · {selectedCount} песни
            </span>
            {selectedCount >= ROUNDS_PER_GAME ? (
              <Link href={playHref({ type: "artists", ids: selected })} className="btn-primary px-5 py-2">
                ▶ Играй
              </Link>
            ) : (
              <span className="text-sm text-muted">{selected.length ? "нужни са още песни" : "избери артисти"}</span>
            )}
          </div>
        </div>
      )}

      {tab === "playlists" && (
        <div className="animate-rise space-y-3">
          <Link href="/vnos" className="card flex items-center justify-center gap-2 border-dashed p-4 text-sm hover:bg-surface-strong">
            ➕ Внеси плейлист от Deezer или Spotify
          </Link>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherPlaylists.map((p) => (
              <SourceCard
                key={p.id}
                source={{ type: "playlist", id: p.id }}
                title={p.name}
                subtitle={p.source === "curated" ? p.description : p.source === "deezer" ? "от Deezer" : "от Spotify"}
                count={p.count}
              />
            ))}
          </div>
          {otherPlaylists.length === 0 && <p className="text-center text-sm text-muted">Още няма внесени плейлисти.</p>}
        </div>
      )}
    </div>
  );
}
