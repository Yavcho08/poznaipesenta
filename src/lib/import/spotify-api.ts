import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SourceTrack } from "@/lib/import/similarity";

// Spotify Web API с OAuth PKCE (без client secret). Само за списъци с песни — НИКОГА за звук.
// Development Mode (от 02.2026): макс. 5 потребители, добавени ръчно в Spotify Dashboard;
// GET /playlists/{id}/items работи само за плейлисти на влезлия потребител.

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
const SCOPE = "playlist-read-private playlist-read-collaborative";

const TOKEN_COOKIE = "spotify";
const VERIFIER_COOKIE = "spotify_pkce";

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

interface StoredToken {
  access: string;
  refresh: string | null;
  /** ms epoch */
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function config(): { clientId: string; redirectUri: string } | null {
  // trim: стойности, зададени през конзола, често завършват с нов ред.
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim();
  return clientId && redirectUri ? { clientId, redirectUri } : null;
}

export function spotifyConfigured(): boolean {
  return config() !== null;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** URL за вход; записва verifier + state в бисквитка (10 мин.). */
export async function startLogin(): Promise<string> {
  const cfg = config();
  if (!cfg) throw new SpotifyApiError("Spotify не е настроен (SPOTIFY_CLIENT_ID / SPOTIFY_REDIRECT_URI).", 500);
  const verifier = base64url(randomBytes(64));
  const state = base64url(randomBytes(16));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  (await cookies()).set(VERIFIER_COOKIE, JSON.stringify({ verifier, state }), { ...cookieOptions, maxAge: 600 });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPE,
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function saveToken(t: TokenResponse, previousRefresh: string | null): Promise<StoredToken> {
  const stored: StoredToken = {
    access: t.access_token,
    refresh: t.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
  };
  (await cookies()).set(TOKEN_COOKIE, JSON.stringify(stored), { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 });
  return stored;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) throw new SpotifyApiError("Spotify отказа входа. Опитай пак.", 401);
  return (await res.json()) as TokenResponse;
}

export async function finishLogin(code: string, state: string): Promise<void> {
  const cfg = config();
  if (!cfg) throw new SpotifyApiError("Spotify не е настроен.", 500);
  const jar = await cookies();
  const raw = jar.get(VERIFIER_COOKIE)?.value;
  jar.delete(VERIFIER_COOKIE);
  const saved = raw ? (JSON.parse(raw) as { verifier: string; state: string }) : null;
  if (!saved || saved.state !== state) throw new SpotifyApiError("Изтекла или невалидна сесия за вход. Опитай пак.");

  const token = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    code_verifier: saved.verifier,
  });
  await saveToken(token, null);
}

export async function spotifyConnected(): Promise<boolean> {
  return (await cookies()).has(TOKEN_COOKIE);
}

export async function disconnect(): Promise<void> {
  (await cookies()).delete(TOKEN_COOKIE);
}

/** Валиден access token (опреснява го при нужда). Само в route handler / server action. */
async function accessToken(): Promise<string> {
  const cfg = config();
  const raw = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!cfg || !raw) throw new SpotifyApiError("Не си свързан със Spotify.", 401);
  const stored = JSON.parse(raw) as StoredToken;
  if (stored.expiresAt > Date.now()) return stored.access;
  if (!stored.refresh) throw new SpotifyApiError("Сесията със Spotify изтече. Влез пак.", 401);
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: stored.refresh, client_id: cfg.clientId });
  return (await saveToken(fresh, stored.refresh)).access;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new SpotifyApiError("Сесията със Spotify изтече. Влез пак.", 401);
  if (res.status === 403) {
    throw new SpotifyApiError(
      "Spotify отказа достъп. В Development Mode приложението работи само за потребители, добавени в Spotify Dashboard, и само за твоите собствени плейлисти.",
      403,
    );
  }
  if (res.status === 404) throw new SpotifyApiError("Плейлистът не е намерен.", 404);
  if (res.status === 429) throw new SpotifyApiError("Твърде много заявки към Spotify. Опитай след малко.", 429);
  if (!res.ok) throw new SpotifyApiError(`Грешка от Spotify (${res.status}).`, 502);
  return (await res.json()) as T;
}

interface Paging<T> {
  items: T[];
  next: string | null;
  total: number;
}

interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  images?: { url: string }[] | null;
  // Старото име е tracks, новото (2026) — items.
  tracks?: { total: number } | null;
  items?: { total: number } | null;
  owner?: { id: string } | null;
  collaborative?: boolean;
}

export interface MyPlaylist {
  id: string;
  name: string;
  image: string | null;
  total: number;
  /**
   * Собствен или съвместен плейлист → всички песни през API-то.
   * Чужд (следван) плейлист → Spotify не дава песните му в Development Mode;
   * вносът минава през публичния линк (първите 100).
   */
  owned: boolean;
}

export async function getMyPlaylists(): Promise<MyPlaylist[]> {
  const me = await api<{ id: string }>("/me");
  const out: MyPlaylist[] = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const page: Paging<SpotifyPlaylistSummary | null> = await api(url);
    for (const p of page.items) {
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        image: p.images?.[0]?.url ?? null,
        total: p.items?.total ?? p.tracks?.total ?? 0,
        owned: p.owner?.id === me.id || p.collaborative === true,
      });
    }
    url = page.next;
  }
  // Собствените първо — от тях идват всички песни.
  return out.sort((a, b) => Number(b.owned) - Number(a.owned));
}

interface SpotifyTrackObject {
  type?: string;
  name: string;
  duration_ms?: number;
  artists: { name: string }[];
  external_ids?: { isrc?: string };
}

interface PlaylistItem {
  // Новото API връща песента в `item`, старото — в `track`.
  item?: SpotifyTrackObject | null;
  track?: SpotifyTrackObject | null;
}

/** Всички песни на плейлиста, без значение колко са (страници по 100). */
export async function getPlaylistTracks(playlistId: string): Promise<{ name: string; tracks: SourceTrack[] }> {
  const meta = await api<{ name: string }>(`/playlists/${playlistId}?fields=name`);
  const tracks: SourceTrack[] = [];
  let url: string | null = `/playlists/${playlistId}/items?limit=100`;
  while (url) {
    const page: Paging<PlaylistItem> = await api(url);
    for (const entry of page.items) {
      const t = entry.item ?? entry.track;
      // Подкасти/епизоди се пропускат.
      if (!t || (t.type && t.type !== "track")) continue;
      tracks.push({
        title: t.name,
        artists: t.artists.map((a) => a.name),
        isrc: t.external_ids?.isrc ?? null,
        durationMs: t.duration_ms ?? null,
      });
    }
    url = page.next;
  }
  return { name: meta.name, tracks };
}
