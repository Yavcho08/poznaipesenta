"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROUNDS_PER_GAME } from "@/lib/game/rules";
import { sourceToQuery } from "@/lib/game/source";
import type { ImportEvent, ImportRequest } from "@/lib/import/run";
import type { MyPlaylist } from "@/lib/import/spotify-api";

const input = "field";
const primary = "btn-primary";

type Progress =
  | { state: "idle" }
  | { state: "running"; name: string | null; done: number; total: number; ready: number; notice?: string }
  | { state: "done"; playlistId: string; name: string; ready: number; total: number; missing: string[]; notice?: string }
  | { state: "error"; message: string };

async function runImport(request: ImportRequest, onEvent: (e: ImportEvent) => void): Promise<void> {
  const res = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok || !res.body) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Вносът не успя";
    onEvent({ type: "error", message });
    return;
  }
  // NDJSON: по едно събитие на ред.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as ImportEvent);
  }
}

export function ImportClient({
  spotifyConfigured,
  spotifyConnected,
  spotifyError,
}: {
  spotifyConfigured: boolean;
  spotifyConnected: boolean;
  spotifyError: string | null;
}) {
  const [deezerUrl, setDeezerUrl] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [progress, setProgress] = useState<Progress>({ state: "idle" });
  const [playlists, setPlaylists] = useState<MyPlaylist[] | null>(null);
  const [playlistsError, setPlaylistsError] = useState<string | null>(null);
  const [connected, setConnected] = useState(spotifyConnected);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch("/api/spotify/playlists")
      .then(async (res) => {
        const body = (await res.json()) as { playlists?: MyPlaylist[]; error?: string };
        if (cancelled) return;
        if (body.playlists) setPlaylists(body.playlists);
        else setPlaylistsError(body.error ?? "Грешка");
      })
      .catch(() => !cancelled && setPlaylistsError("Няма връзка"));
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const busy = progress.state === "running";

  const start = (request: ImportRequest) => {
    setProgress({ state: "running", name: null, done: 0, total: 0, ready: 0 });
    void runImport(request, (e) => {
      setProgress((cur) => {
        switch (e.type) {
          case "start":
            return { state: "running", name: e.name, done: 0, total: e.total, ready: 0, notice: e.notice };
          case "progress":
            return cur.state === "running" ? { ...cur, done: e.done, total: e.total, ready: e.ready } : cur;
          case "done":
            return {
              state: "done",
              playlistId: e.playlistId,
              name: e.name,
              ready: e.ready,
              total: e.total,
              missing: e.missing,
              notice: cur.state === "running" ? cur.notice : undefined,
            };
          case "error":
            return { state: "error", message: e.message };
        }
      });
    }).catch(() => setProgress({ state: "error", message: "Връзката прекъсна" }));
  };

  const logout = async () => {
    await fetch("/api/spotify/logout", { method: "POST" });
    setConnected(false);
    setPlaylists(null);
  };

  return (
    <div className="space-y-6">
      <ProgressView progress={progress} />

      <section className="space-y-2 rounded-xl bg-surface p-4">
        <h2 className="font-semibold">Deezer плейлист</h2>
        <p className="text-sm text-muted">Постави линк към публичен плейлист (Сподели → Копирай линка).</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            start({ kind: "deezer", url: deezerUrl });
          }}
        >
          <input value={deezerUrl} onChange={(e) => setDeezerUrl(e.target.value)} placeholder="https://www.deezer.com/bg/playlist/…" className={input} />
          <button type="submit" disabled={busy || !deezerUrl.trim()} className={primary}>
            Внеси
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl bg-surface p-4">
        <h2 className="font-semibold">Spotify — моите плейлисти</h2>
        {spotifyError && <p className="text-sm text-red-300">{spotifyError}</p>}
        {!spotifyConfigured ? (
          <p className="text-sm text-muted">
            Входът със Spotify не е настроен на този сървър (липсва <code>SPOTIFY_CLIENT_ID</code>). Използвай публичен линк по-долу.
          </p>
        ) : !connected ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Spotify се ползва само за списъка с песни — звукът идва от Deezer. В тестов режим Spotify позволява до 5
              потребители, добавени от собственика на приложението.
            </p>
            <a href="/api/spotify/login" className={`${primary} inline-block bg-[#1db954]`}>
              Свържи Spotify
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-green-300">Свързан със Spotify</span>
              <button type="button" onClick={logout} className="text-muted underline">
                Изход
              </button>
            </div>
            {playlistsError && <p className="text-sm text-red-300">{playlistsError}</p>}
            {!playlists && !playlistsError && <p className="text-sm text-muted">Зареждам плейлистите…</p>}
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {playlists?.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg bg-background p-2">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- обложка от Spotify CDN
                    <img src={p.image} alt="" width={40} height={40} className="rounded" />
                  ) : (
                    <span className="h-10 w-10 rounded bg-white/10" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-muted">
                      {p.total} песни ·{" "}
                      {p.owned ? (
                        <span className="text-emerald-300">всички</span>
                      ) : (
                        <span className="text-amber-200">чужд — до 100</span>
                      )}
                    </span>
                  </span>
                  <button type="button" disabled={busy} onClick={() => start({ kind: "spotify-api", playlistId: p.id })} className="rounded-full bg-white/10 px-3 py-1 text-sm disabled:opacity-50">
                    Внеси
                  </button>
                </li>
              ))}
            </ul>
            {playlists?.length === 0 && <p className="text-sm text-muted">Нямаш плейлисти.</p>}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-xl bg-surface p-4">
        <h2 className="font-semibold">Spotify — публичен линк</h2>
        <p className="text-sm text-muted">
          Без вход. Работи с публични плейлисти, но не е официален начин и може да спре да работи, ако Spotify промени сайта си.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            start({ kind: "spotify-link", url: spotifyUrl });
          }}
        >
          <input value={spotifyUrl} onChange={(e) => setSpotifyUrl(e.target.value)} placeholder="https://open.spotify.com/playlist/…" className={input} />
          <button type="submit" disabled={busy || !spotifyUrl.trim()} className={primary}>
            Внеси
          </button>
        </form>
      </section>
    </div>
  );
}

function ProgressView({ progress }: { progress: Progress }) {
  if (progress.state === "idle") return null;
  if (progress.state === "error") return <p className="rounded-xl bg-red-500/15 p-4 text-red-200">{progress.message}</p>;

  if (progress.state === "running") {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="space-y-2 rounded-xl bg-surface p-4" aria-live="polite">
        <p className="font-semibold">{progress.name ?? "Чета плейлиста…"}</p>
        {progress.notice && <p className="text-sm text-amber-200">{progress.notice}</p>}
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted">
          Съпоставям с Deezer: {progress.done}/{progress.total} · готови за игра: {progress.ready}
        </p>
      </div>
    );
  }

  const enough = progress.ready >= ROUNDS_PER_GAME;
  return (
    <div className="space-y-3 rounded-xl bg-accent/15 p-4 ring-1 ring-accent/40" aria-live="polite">
      <p className="font-semibold">{progress.name}</p>
      <p className="font-display text-2xl font-bold">
        {progress.ready}/{progress.total} песни са готови за игра
      </p>
      {progress.notice && <p className="text-sm text-amber-200">{progress.notice}</p>}
      {enough ? (
        <Link href={`/igra?${sourceToQuery({ type: "playlist", id: progress.playlistId })}`} className={`${primary} inline-block`}>
          Играй
        </Link>
      ) : (
        <p className="text-sm text-muted">Нужни са поне {ROUNDS_PER_GAME} песни за игра.</p>
      )}
      {progress.missing.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Без откъс в Deezer ({progress.missing.length})</summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-muted">
            {progress.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
