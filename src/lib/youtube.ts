import "server-only";
// Гледания в YouTube през официалното YouTube Data API v3 (ключ YOUTUBE_API_KEY).
// Квота: 10 000 единици на ден. Търсене = 100, videos.list = 1 (до 50 клипа наведнъж).
// Затова търсим клип за ~90 песни на ден (най-популярните първо), а броя гледания опресняваме евтино.
// Пазим само id на клипа и броя гледания (по правилата на YouTube — опреснявани до 30 дни).

import { DEFAULT_SOURCE } from "@/lib/game/source";
import { poolWhere } from "@/lib/game/server";
import { cleanTitle, mainArtist, songKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { bestVideo, parseIsoDuration, type VideoCandidate } from "@/lib/youtube-match";

const API = "https://www.googleapis.com/youtube/v3";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Колко дни е „свеж“ броят гледания. */
const REFRESH_DAYS = 7;

class QuotaExceeded extends Error {}

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

export function youtubeConfigured(): boolean {
  return apiKey() !== null;
}

function dailySearchLimit(): number {
  const n = Number(process.env.YOUTUBE_DAILY_SEARCHES);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 95) : 90;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY липсва");
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key })}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: { errors?: { reason?: string }[]; message?: string } }) | null;
  if (!res.ok || !body || body.error) {
    const reason = body?.error?.errors?.[0]?.reason;
    if (res.status === 403 && (reason === "quotaExceeded" || reason === "dailyLimitExceeded")) throw new QuotaExceeded();
    throw new Error(`YouTube ${res.status}: ${body?.error?.message ?? "грешка"}`);
  }
  return body;
}

interface VideosResponse {
  items: {
    id: string;
    snippet?: { title?: string; channelTitle?: string };
    statistics?: { viewCount?: string };
    contentDetails?: { duration?: string };
  }[];
}

async function videoDetails(ids: string[]): Promise<VideoCandidate[]> {
  if (ids.length === 0) return [];
  const data = await call<VideosResponse>("videos", { part: "snippet,statistics,contentDetails", id: ids.join(","), maxResults: "50" });
  return data.items.map((v) => ({
    id: v.id,
    title: v.snippet?.title ?? "",
    channel: v.snippet?.channelTitle ?? "",
    views: Number(v.statistics?.viewCount ?? 0),
    duration: parseIsoDuration(v.contentDetails?.duration),
  }));
}

/** Търси клипа на песента (101 единици квота). */
async function findVideo(track: { title: string; artistName: string; duration: number | null }): Promise<VideoCandidate | null> {
  const q = `${mainArtist(track.artistName)} ${cleanTitle(track.title) || track.title}`;
  const search = await call<{ items: { id?: { videoId?: string } }[] }>("search", {
    part: "snippet",
    type: "video",
    maxResults: "8",
    regionCode: "BG",
    q,
  });
  const ids = search.items.map((i) => i.id?.videoId).filter((id): id is string => !!id);
  return bestVideo(track, await videoDetails(ids));
}

export interface YoutubeSummary {
  searched: number;
  found: number;
  refreshed: number;
  searchesLeftToday: number;
  stopped: "done" | "budget" | "quota" | "limit" | "not_configured";
}

/** Търсения през последните 24 ч. (всяко търсене оставя едно и също време на песента и версиите ѝ). */
async function searchesLast24h(): Promise<number> {
  const rows = await prisma.track.groupBy({
    by: ["youtubeCheckedAt"],
    where: { youtubeCheckedAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  return rows.length;
}

/** Опреснява броя гледания на вече намерени клипове (1 единица на 50 песни). */
async function refreshViews(deadline: number): Promise<number> {
  let refreshed = 0;
  while (Date.now() < deadline && refreshed < 2000) {
    const stale = await prisma.track.findMany({
      where: { youtubeVideoId: { not: null }, youtubeViewsAt: { lt: new Date(Date.now() - REFRESH_DAYS * DAY_MS) } },
      select: { youtubeVideoId: true },
      distinct: ["youtubeVideoId"],
      orderBy: { youtubeViewsAt: "asc" },
      take: 50,
    });
    if (stale.length === 0) break;
    const ids = stale.map((t) => t.youtubeVideoId as string);
    const details = await videoDetails(ids);
    const now = new Date();
    const views = new Map(details.map((d) => [d.id, d.views]));
    for (const id of ids) {
      // Изтрит/скрит клип → търсим наново при следващото минаване.
      const data = views.has(id)
        ? { youtubeViews: views.get(id) as number, youtubeViewsAt: now }
        : { youtubeVideoId: null, youtubeViews: null, youtubeViewsAt: null, youtubeCheckedAt: null };
      await prisma.track.updateMany({ where: { youtubeVideoId: id }, data });
    }
    refreshed += ids.length;
  }
  return refreshed;
}

/** Следващите песни без проверен клип: първо поп-фолкът, по популярност. */
async function nextPending(take: number) {
  const select = { id: true, title: true, artistName: true, artistId: true, duration: true } as const;
  const base = { youtubeCheckedAt: null, isActive: true };
  const popfolk = await prisma.track.findMany({ where: { ...poolWhere(DEFAULT_SOURCE), ...base }, select, orderBy: { rank: "desc" }, take });
  if (popfolk.length >= take) return popfolk;
  const rest = await prisma.track.findMany({
    where: { ...base, id: { notIn: popfolk.map((t) => t.id) } },
    select,
    orderBy: { rank: "desc" },
    take: take - popfolk.length,
  });
  return [...popfolk, ...rest];
}

/** Една стъпка: опресняване + търсене на нови клипове, докато има време и квота. */
export async function runYoutubeSync(budgetMs = 25_000): Promise<YoutubeSummary> {
  const summary: YoutubeSummary = { searched: 0, found: 0, refreshed: 0, searchesLeftToday: 0, stopped: "done" };
  if (!youtubeConfigured()) return { ...summary, stopped: "not_configured" };
  const deadline = Date.now() + budgetMs;
  try {
    summary.refreshed = await refreshViews(Math.min(deadline, Date.now() + budgetMs / 3));
    let left = dailySearchLimit() - (await searchesLast24h());
    while (left > 0) {
      if (Date.now() > deadline) {
        summary.stopped = "budget";
        break;
      }
      const [track] = await nextPending(1);
      if (!track) break;
      const video = await findVideo(track);
      const now = new Date();
      // Същата песня в други версии/албуми на артиста получава същия клип.
      const key = songKey(track.title, track.artistName);
      const siblings = track.artistId
        ? (
            await prisma.track.findMany({
              where: { artistId: track.artistId, youtubeCheckedAt: null },
              select: { id: true, title: true, artistName: true },
            })
          )
            .filter((t) => songKey(t.title, t.artistName) === key)
            .map((t) => t.id)
        : [];
      await prisma.track.updateMany({
        where: { id: { in: [...new Set([track.id, ...siblings])] } },
        data: video
          ? { youtubeCheckedAt: now, youtubeVideoId: video.id, youtubeViews: video.views, youtubeViewsAt: now }
          : { youtubeCheckedAt: now },
      });
      summary.searched++;
      if (video) summary.found++;
      left--;
    }
    if (left <= 0 && summary.stopped === "done") summary.stopped = "limit";
    summary.searchesLeftToday = Math.max(0, left);
  } catch (error) {
    if (error instanceof QuotaExceeded) summary.stopped = "quota";
    else throw error;
  }
  return summary;
}
