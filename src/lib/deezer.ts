import "server-only";
import { cached, cacheDelete, cacheGet, cacheSet } from "@/lib/cache";

// Сървърен клиент за публичното Deezer API (без ключ, без CORS → само от сървъра).

const API = "https://api.deezer.com";

// Deezer позволява ~50 заявки за 5 сек.; оставяме резерв.
const RATE_LIMIT = 45;
const RATE_WINDOW_MS = 5000;

const HOUR = 60 * 60 * 1000;
const METADATA_TTL_MS = 6 * HOUR;
const SEARCH_TTL_MS = HOUR;

export interface DeezerArtist {
  id: number;
  name: string;
  picture_medium?: string;
  picture_big?: string;
  nb_album?: number;
  nb_fan?: number;
}

export interface DeezerAlbum {
  id: number;
  title: string;
  cover_small?: string;
  cover_medium?: string;
  cover_big?: string;
  release_date?: string;
}

export interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  title_version?: string;
  isrc?: string;
  rank?: number;
  readable?: boolean;
  preview?: string;
  duration?: number;
  release_date?: string;
  artist: { id: number; name: string };
  contributors?: { id: number; name: string; role?: string }[];
  album: DeezerAlbum;
}

interface DeezerList<T> {
  data: T[];
  total?: number;
  next?: string;
}

interface DeezerErrorBody {
  error: { type?: string; message?: string; code?: number };
}

export class DeezerError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "DeezerError";
  }
}

// Код 800 = „няма данни“ (несъществуващ ID).
export const DEEZER_NOT_FOUND = 800;
const DEEZER_QUOTA_EXCEEDED = 4;

// --- Rate limit: плъзгащ прозорец, общ за процеса ---

const globalForRate = globalThis as unknown as { __deezerCalls?: number[] };
const calls: number[] = (globalForRate.__deezerCalls ??= []);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (calls.length > 0 && now - calls[0] >= RATE_WINDOW_MS) calls.shift();
    if (calls.length < RATE_LIMIT) {
      calls.push(now);
      return;
    }
    await sleep(RATE_WINDOW_MS - (now - calls[0]) + 10);
  }
}

function isErrorBody(body: unknown): body is DeezerErrorBody {
  return typeof body === "object" && body !== null && "error" in body;
}

async function request<T>(path: string, attempt = 0): Promise<T> {
  await acquireSlot();
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new DeezerError(`Deezer HTTP ${res.status} за ${path}`);
  const body: unknown = await res.json();
  if (isErrorBody(body)) {
    const { code, message } = body.error;
    if (code === DEEZER_QUOTA_EXCEEDED && attempt < 3) {
      await sleep(RATE_WINDOW_MS);
      return request<T>(path, attempt + 1);
    }
    throw new DeezerError(message ?? "Грешка от Deezer", code);
  }
  return body as T;
}

// --- Публични функции ---

export function searchArtists(query: string, limit = 10): Promise<DeezerArtist[]> {
  const q = encodeURIComponent(query);
  return cached(`dz:search-artist:${limit}:${query}`, SEARCH_TTL_MS, async () => {
    const list = await request<DeezerList<DeezerArtist>>(`/search/artist?q=${q}&limit=${limit}`);
    return list.data;
  });
}

export function searchTracks(query: string, limit = 25): Promise<DeezerTrack[]> {
  const q = encodeURIComponent(query);
  return cached(`dz:search-track:${limit}:${query}`, SEARCH_TTL_MS, async () => {
    const list = await request<DeezerList<DeezerTrack>>(`/search/track?q=${q}&limit=${limit}`);
    return list.data;
  });
}

export function getArtist(id: string): Promise<DeezerArtist> {
  return cached(`dz:artist:${id}`, METADATA_TTL_MS, () => request<DeezerArtist>(`/artist/${id}`));
}

export function getArtistTop(id: string, limit = 50): Promise<DeezerTrack[]> {
  return cached(`dz:artist-top:${id}:${limit}`, METADATA_TTL_MS, async () => {
    const list = await request<DeezerList<DeezerTrack>>(`/artist/${id}/top?limit=${limit}`);
    return list.data;
  });
}

// Preview URL-ите са подписани (hdnea=exp=<unix>) и изтичат. Кешираме пистата
// само до малко преди изтичането на подписа.
function previewTtlMs(preview: string | undefined): number {
  const match = preview?.match(/exp=(\d+)/);
  if (!match) return 10 * 60 * 1000;
  const expiresAt = Number(match[1]) * 1000;
  return Math.max(0, Math.min(expiresAt - Date.now() - 5 * 60 * 1000, METADATA_TTL_MS));
}

export async function getTrack(id: string): Promise<DeezerTrack> {
  const key = `dz:track:${id}`;
  const hit = cacheGet<DeezerTrack>(key);
  if (hit) return hit;
  const track = await request<DeezerTrack>(`/track/${id}`);
  const ttl = previewTtlMs(track.preview);
  if (ttl > 0) cacheSet(key, track, ttl);
  return track;
}

export function getArtistAlbums(id: string): Promise<DeezerAlbum[]> {
  return cached(`dz:artist-albums:${id}`, METADATA_TTL_MS, async () => {
    const list = await request<DeezerList<DeezerAlbum>>(`/artist/${id}/albums?limit=100`);
    return list.data;
  });
}

/** Песните в албума. Обектите нямат поле album — добавяме го от самия албум. */
export function getAlbumTracks(album: DeezerAlbum): Promise<DeezerTrack[]> {
  return cached(`dz:album-tracks:${album.id}`, METADATA_TTL_MS, async () => {
    const list = await request<DeezerList<Omit<DeezerTrack, "album">>>(`/album/${album.id}/tracks?limit=100`);
    return list.data.map((t) => ({ ...t, album, release_date: t.release_date ?? album.release_date }));
  });
}

export interface DeezerPlaylist {
  id: number;
  title: string;
  nb_tracks: number;
  picture_medium?: string;
  public?: boolean;
}

export function getPlaylist(id: string): Promise<DeezerPlaylist> {
  return request<DeezerPlaylist>(`/playlist/${id}`);
}

/** Всички песни на плейлиста, без значение колко са (страници по 100). */
export async function getPlaylistTracks(id: string): Promise<DeezerTrack[]> {
  const all: DeezerTrack[] = [];
  for (let index = 0; ; index += 100) {
    const page = await request<DeezerList<DeezerTrack>>(`/playlist/${id}/tracks?index=${index}&limit=100`);
    all.push(...page.data);
    if (!page.next || page.data.length === 0) break;
  }
  return all;
}

/** Песен по ISRC или null. */
export async function getTrackByIsrc(isrc: string): Promise<DeezerTrack | null> {
  if (!/^[A-Z0-9]{12}$/i.test(isrc)) return null;
  try {
    return await cached(`dz:isrc:${isrc}`, METADATA_TTL_MS, () => request<DeezerTrack>(`/track/isrc:${isrc.toUpperCase()}`));
  } catch (error) {
    if (error instanceof DeezerError && error.code === DEEZER_NOT_FOUND) return null;
    throw error;
  }
}

export function forgetTrack(id: string): void {
  cacheDelete(`dz:track:${id}`);
}

/** Свеж preview URL или null, ако песента няма preview / не е налична. */
export async function getPreviewUrl(id: string): Promise<string | null> {
  try {
    const track = await getTrack(id);
    if (track.readable === false || !track.preview) return null;
    return track.preview;
  } catch (error) {
    if (error instanceof DeezerError && error.code === DEEZER_NOT_FOUND) return null;
    throw error;
  }
}

export function isDeezerId(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}
