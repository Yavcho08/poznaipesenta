// Дали клип в YouTube е официалното изпълнение на песента. Чисти функции (без мрежа) — за тестове.

import { cleanTitle, looseKey, mainArtist, normalizeText } from "@/lib/normalize";

export interface VideoCandidate {
  id: string;
  title: string;
  channel: string;
  views: number;
  /** секунди */
  duration: number | null;
}

// Каверите, живите изпълнения, караокето, текстовете и т.н. не са „песента“.
const BAD_WORDS = [
  "cover",
  "кавър",
  "karaoke",
  "караоке",
  "live",
  "на живо",
  "лайв",
  "lyrics",
  "lyric",
  "текст",
  "reaction",
  "реакция",
  "remix",
  "ремикс",
  "slowed",
  "sped up",
  "speed up",
  "8d",
  "nightcore",
  "bass boosted",
  "instrumental",
  "инструментал",
  "минус",
  "piano",
  "tutorial",
  "урок",
  "parody",
  "пародия",
  "mix",
  "микс",
  "1 hour",
  "1 час",
  "megamix",
];

function hasWord(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

/** ISO 8601 продължителност от YouTube („PT3M42S“) → секунди. */
export function parseIsoDuration(value: string | undefined): number | null {
  const m = value?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** Подходящ ли е клипът за песента. */
export function videoMatches(track: { title: string; artistName: string; duration: number | null }, video: VideoCandidate): boolean {
  const titleKey = looseKey(cleanTitle(track.title) || track.title);
  const artistKey = looseKey(mainArtist(track.artistName));
  if (titleKey.length < 3 || artistKey.length < 2) return false;

  const videoKey = looseKey(video.title);
  if (!videoKey.includes(titleKey)) return false;
  if (!videoKey.includes(artistKey) && !looseKey(video.channel).includes(artistKey)) return false;

  // Думите за версия се допускат само ако ги има и в заглавието на песента.
  const videoText = normalizeText(video.title);
  const trackText = normalizeText(track.title);
  if (BAD_WORDS.some((w) => hasWord(videoText, w) && !hasWord(trackText, w))) return false;

  // Без часови миксове и откъси: клипът може да е по-дълъг (интро), но не много.
  if (video.duration !== null) {
    if (video.duration > 12 * 60 || video.duration < 60) return false;
    if (track.duration && (video.duration < track.duration * 0.6 || video.duration > track.duration * 2.5)) return false;
  }
  return true;
}

/** Най-гледаният подходящ клип (официалният обикновено е най-гледан). */
export function bestVideo(track: { title: string; artistName: string; duration: number | null }, videos: VideoCandidate[]): VideoCandidate | null {
  return videos.filter((v) => videoMatches(track, v)).sort((a, b) => b.views - a.views)[0] ?? null;
}

/** „1,2 млн.“, „845 хил.“ */
export function formatViews(views: number): string {
  if (views >= 1e9) return `${(views / 1e9).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} млрд.`;
  if (views >= 1e6) return `${(views / 1e6).toLocaleString("bg-BG", { maximumFractionDigits: 1 })} млн.`;
  if (views >= 1e3) return `${Math.round(views / 1e3).toLocaleString("bg-BG")} хил.`;
  return String(Math.round(views));
}
