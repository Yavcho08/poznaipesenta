import "server-only";
// Генератори на въпроси за всяка игра. Получават пул от песни (вече филтриран по източник и
// по is_active) и генератор на случайни числа (детерминиран за дневното).

import { cleanTitle, looseKey, songKey } from "@/lib/normalize";
import type { Album, Artist, Track, TrackArtist } from "@/generated/prisma/client";
import { STREAK_MAX } from "./scoring";
import type { Option, QuizType, SongCard, StoredQuestion } from "./types";
import { QUIZZES } from "./types";

export type PoolTrack = Track & { album: Album | null; artist: Artist | null; artists: TrackArtist[] };

export interface RoundSpec {
  trackId: string | null;
  albumId: string | null;
  artistId: string | null;
  question: StoredQuestion;
}

type Random = () => number;

export class NotEnoughData extends Error {}

// --- Помощни ---

function shuffle<T>(items: readonly T[], random: Random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)];
}

/** Една версия на песен (без дубликати по заглавие + артист). */
function uniqueSongs(pool: PoolTrack[]): PoolTrack[] {
  const seen = new Set<string>();
  // По-популярната версия първа — тя е „каноничната“.
  return [...pool]
    .sort((a, b) => b.rank - a.rank)
    .filter((t) => {
      const key = songKey(t.title, t.artistName);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function card(t: PoolTrack, id: string, withCover = true): SongCard {
  return { id, title: cleanTitle(t.title) || t.title, artist: t.artistName, cover: withCover ? t.albumCover : null };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

function need<T>(items: T[], count: number, what: string): T[] {
  if (items.length < count) throw new NotEnoughData(`Няма достатъчно ${what} за тази игра. Избери друг източник.`);
  return items.slice(0, count);
}

const yearOf = (d: Date | null): number | null => (d ? d.getUTCFullYear() : null);

// --- Игрите ---

function coverRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const albums = new Map<string, { album: Album; artist: string; artistId: string | null }>();
  for (const t of pool) {
    if (!t.album?.coverUrl || t.album.recordType === "compile") continue;
    if (!albums.has(t.album.id)) albums.set(t.album.id, { album: t.album, artist: t.artistName, artistId: t.artistId });
  }
  // Без повтарящи се заглавия (сингъл и албум с едно име).
  const byTitle = new Map<string, { album: Album; artist: string; artistId: string | null }>();
  for (const a of albums.values()) {
    const key = `${looseKey(a.album.title)}|${a.artistId}`;
    const cur = byTitle.get(key);
    if (!cur || (cur.album.recordType === "single" && a.album.recordType !== "single")) byTitle.set(key, a);
  }
  const all = [...byTitle.values()];
  // Първо албуми/EP-та (по-разпознаваеми корици), после сингли.
  const preferred = shuffle(all.filter((a) => a.album.recordType !== "single"), random);
  const singles = shuffle(all.filter((a) => a.album.recordType === "single"), random);
  const chosen = need([...preferred, ...singles], QUIZZES.cover.length as number, "албуми с корици");
  if (all.length < 6) throw new NotEnoughData("Няма достатъчно албуми за тази игра. Избери друг източник.");

  return chosen.map((target) => {
    const sameArtist = shuffle(all.filter((a) => a.artistId === target.artistId && a.album.id !== target.album.id), random);
    const others = shuffle(all.filter((a) => a.artistId !== target.artistId), random);
    const seenTitles = new Set([looseKey(target.album.title)]);
    const decoys: typeof all = [];
    for (const a of [...sameArtist.slice(0, 3), ...others.slice(0, 30)]) {
      const key = looseKey(a.album.title);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      decoys.push(a);
      if (decoys.length >= 5) break;
    }
    const shuffled = shuffle([target, ...decoys], random);
    const options: Option[] = shuffled.map((a, i) => ({ id: `o${i}`, label: a.album.title, sub: a.artist }));
    const correct = options[shuffled.indexOf(target)];
    return {
      trackId: null,
      albumId: target.album.id,
      artistId: target.artistId,
      question: {
        public: { kind: "cover", artist: null, options, steps: 5 },
        answer: { kind: "option", id: correct.id, label: target.album.title },
        reveal: { id: "album", title: target.album.title, artist: target.artist, cover: target.album.coverUrl },
      },
    };
  });
}

function pairRounds(type: "newer" | "higher", pool: PoolTrack[], random: Random): RoundSpec[] {
  const songs = shuffle(
    uniqueSongs(pool).filter((t) => (type === "newer" ? t.releaseYear !== null : t.rank > 0)),
    random,
  );
  const value = (t: PoolTrack) => (type === "newer" ? (t.releaseYear ?? 0) : t.rank);
  const clearlyDifferent = (a: PoolTrack, b: PoolTrack) =>
    type === "newer" ? Math.abs(value(a) - value(b)) >= 2 : Math.max(value(a), value(b)) >= 1.5 * Math.min(value(a), value(b));

  const rounds: RoundSpec[] = [];
  const used = new Set<string>();
  for (const a of songs) {
    if (rounds.length >= STREAK_MAX) break;
    if (used.has(a.id)) continue;
    const b = songs.find((x) => !used.has(x.id) && x.id !== a.id && clearlyDifferent(a, x));
    if (!b) continue;
    used.add(a.id);
    used.add(b.id);
    const [left, right] = random() < 0.5 ? [a, b] : [b, a];
    const correct = value(left) > value(right) ? "left" : "right";
    const fmt = (t: PoolTrack) => (type === "newer" ? String(t.releaseYear) : `${Math.round(t.rank / 1000).toLocaleString("bg-BG")} хил.`);
    rounds.push({
      trackId: (correct === "left" ? left : right).id,
      albumId: null,
      artistId: (correct === "left" ? left : right).artistId,
      question: {
        public: {
          kind: "pair",
          prompt: type === "newer" ? "Коя е излязла по-късно?" : "Коя е по-популярна?",
          left: card(left, "left"),
          right: card(right, "right"),
        },
        answer: { kind: "pair", correct, left: fmt(left), right: fmt(right) },
        reveal: null,
      },
    });
  }
  return need(rounds, 10, "песни");
}

function yearRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const now = new Date().getUTCFullYear();
  const songs = need(
    shuffle(uniqueSongs(pool).filter((t) => t.releaseYear !== null && t.releaseYear >= 1980), random),
    QUIZZES.year.length as number,
    "песни с известна година",
  );
  return songs.map((t) => ({
    trackId: t.id,
    albumId: t.albumId,
    artistId: t.artistId,
    question: {
      public: { kind: "year", song: card(t, "song"), min: 1980, max: now },
      answer: { kind: "year", year: t.releaseYear as number },
      reveal: card(t, "song"),
    },
  }));
}

function orderRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const byArtist = groupBy(
    uniqueSongs(pool).filter((t) => t.artistId && t.releaseYear !== null),
    (t) => t.artistId as string,
  );
  const candidates = [...byArtist.values()].filter((list) => new Set(list.map((t) => t.releaseYear)).size >= 5);
  if (candidates.length === 0) throw new NotEnoughData("Няма артист с поне 5 песни от различни години. Избери друг източник.");

  const rounds: RoundSpec[] = [];
  const artistsOrder = shuffle(candidates, random);
  for (let i = 0; rounds.length < (QUIZZES.order.length as number); i++) {
    const list = artistsOrder[i % artistsOrder.length];
    const byYear = groupBy(shuffle(list, random), (t) => t.releaseYear as number);
    const years = shuffle([...byYear.keys()], random).slice(0, 5);
    const songs = years.map((y) => (byYear.get(y) as PoolTrack[])[0]);
    const items = shuffle(
      songs.map((t, k) => card(t, `s${k}`)),
      random,
    );
    const yearsById: Record<string, number> = {};
    songs.forEach((t, k) => (yearsById[`s${k}`] = t.releaseYear as number));
    const ids = [...items].sort((a, b) => yearsById[a.id] - yearsById[b.id]).map((it) => it.id);
    rounds.push({
      trackId: null,
      albumId: null,
      artistId: songs[0].artistId,
      question: { public: { kind: "order", items }, answer: { kind: "order", ids, years: yearsById }, reveal: null },
    });
    if (i > 50) break;
  }
  return need(rounds, QUIZZES.order.length as number, "песни");
}

function albumRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const real = (a: Album | null): a is Album => !!a && (a.recordType === "album" || a.recordType === "ep");
  const songs = uniqueSongs(pool).filter((t) => t.artistId && real(t.album));
  const albumsByArtist = new Map<string, Album[]>();
  for (const t of songs) {
    const list = albumsByArtist.get(t.artistId as string) ?? [];
    if (!list.some((a) => a.id === t.album?.id || looseKey(a.title) === looseKey(t.album?.title ?? ""))) list.push(t.album as Album);
    albumsByArtist.set(t.artistId as string, list);
  }
  const eligible = shuffle(
    songs.filter((t) => (albumsByArtist.get(t.artistId as string)?.length ?? 0) >= 4),
    random,
  );
  // Най-много 2 въпроса от един артист.
  const perArtist = new Map<string, number>();
  const chosen: PoolTrack[] = [];
  for (const t of eligible) {
    const n = perArtist.get(t.artistId as string) ?? 0;
    if (n >= 2) continue;
    perArtist.set(t.artistId as string, n + 1);
    chosen.push(t);
    if (chosen.length >= (QUIZZES.album.length as number)) break;
  }
  return need(chosen, QUIZZES.album.length as number, "артисти с поне 4 албума").map((t) => {
    const album = t.album as Album;
    const others = shuffle(
      (albumsByArtist.get(t.artistId as string) ?? []).filter((a) => a.id !== album.id && looseKey(a.title) !== looseKey(album.title)),
      random,
    ).slice(0, 3);
    const shuffled = shuffle([album, ...others], random);
    const options: Option[] = shuffled.map((a, i) => ({ id: `o${i}`, label: a.title, sub: yearOf(a.releaseDate)?.toString() }));
    const correctId = `o${shuffled.indexOf(album)}`;
    return {
      trackId: t.id,
      albumId: album.id,
      artistId: t.artistId,
      question: {
        public: { kind: "choice", prompt: `От кой албум на ${t.artistName} е тази песен?`, song: card(t, "song", false), options },
        answer: { kind: "option", id: correctId, label: album.title },
        reveal: { ...card(t, "song"), cover: album.coverUrl ?? t.albumCover },
      },
    };
  });
}

function singerRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const songs = shuffle(
    uniqueSongs(pool).filter((t) => t.artist),
    random,
  );
  const artistNames = [...new Map(songs.map((t) => [t.artistId, t.artist?.name ?? t.artistName])).values()];
  if (artistNames.length < 4) throw new NotEnoughData("Нужни са песни на поне 4 изпълнители.");
  const duets = songs.filter((t) => t.artists.some((a) => a.role === "featured" && a.artistId));
  const rounds: RoundSpec[] = [];
  const used = new Set<string>();
  const total = QUIZZES.singer.length as number;
  const duetCount = Math.min(3, duets.length);

  for (const t of duets.slice(0, duetCount)) {
    const feat = t.artists.find((a) => a.role === "featured" && a.artistId) as TrackArtist;
    const main = t.artist?.name ?? t.artistName;
    const decoys = shuffle(
      artistNames.filter((n) => looseKey(n) !== looseKey(main) && looseKey(n) !== looseKey(feat.name)),
      random,
    ).slice(0, 3);
    const options = shuffle([feat.name, ...decoys], random).map((label, i) => ({ id: `o${i}`, label }));
    used.add(t.id);
    rounds.push({
      trackId: t.id,
      albumId: t.albumId,
      artistId: feat.artistId,
      question: {
        public: { kind: "choice", prompt: `Кой пее заедно с ${main}?`, song: null, options },
        answer: { kind: "option", id: (options.find((o) => o.label === feat.name) as Option).id, label: feat.name },
        reveal: card(t, "song"),
      },
    });
  }
  // Най-много 2 песни от един изпълнител — иначе става лесно.
  const perArtist = new Map<string, number>();
  for (const t of songs) {
    if (rounds.length >= total) break;
    if (used.has(t.id)) continue;
    const name = t.artist?.name ?? t.artistName;
    const n = perArtist.get(name) ?? 0;
    if (n >= 2) continue;
    perArtist.set(name, n + 1);
    const decoys = shuffle(
      artistNames.filter((x) => looseKey(x) !== looseKey(name)),
      random,
    ).slice(0, 3);
    const options = shuffle([name, ...decoys], random).map((label, i) => ({ id: `o${i}`, label }));
    rounds.push({
      trackId: t.id,
      albumId: t.albumId,
      artistId: t.artistId,
      question: {
        public: { kind: "choice", prompt: "Кой пее?", song: null, options },
        answer: { kind: "option", id: (options.find((o) => o.label === name) as Option).id, label: name },
        reveal: card(t, "song"),
      },
    });
  }
  return need(shuffle(rounds, random), total, "песни");
}

const STOP_WORDS = new Set(
  ["на", "за", "от", "до", "по", "със", "без", "под", "над", "при", "или", "ако", "как", "кой", "коя", "кое", "не", "се", "да", "ме", "те", "ти", "ми", "му", "ни", "ви", "им", "си", "е", "и", "в", "с", "а", "но", "че", "the", "and", "you", "for", "feat", "remix"].map(looseKey),
);

function titleWords(title: string): string[] {
  return cleanTitle(title)
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""))
    .filter(Boolean);
}

function wordRounds(pool: PoolTrack[], random: Random): RoundSpec[] {
  const songs = shuffle(uniqueSongs(pool), random);
  const allWords = [
    ...new Map(
      songs.flatMap((t) => titleWords(t.title)).filter((w) => w.length >= 3 && !STOP_WORDS.has(looseKey(w))).map((w) => [looseKey(w), w]),
    ).values(),
  ];
  const rounds: RoundSpec[] = [];
  for (const t of songs) {
    if (rounds.length >= (QUIZZES.word.length as number)) break;
    const words = titleWords(t.title);
    if (words.length < 2) continue;
    const candidates = words.filter((w) => w.length >= 3 && !STOP_WORDS.has(looseKey(w)));
    if (candidates.length === 0) continue;
    const word = pick(candidates, random);
    const cyr = /\p{Script=Cyrillic}/u.test(word);
    const decoys = shuffle(
      allWords.filter(
        (w) => looseKey(w) !== looseKey(word) && /\p{Script=Cyrillic}/u.test(w) === cyr && Math.abs(w.length - word.length) <= 2,
      ),
      random,
    ).slice(0, 3);
    if (decoys.length < 3) continue;
    const display = cleanTitle(t.title) || t.title;
    const masked = display.replace(new RegExp(`(^|[^\\p{L}\\d])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\d])`, "u"), `$1${"＿".repeat(Math.min(word.length, 8))}`);
    if (masked === display) continue;
    const options = shuffle([word, ...decoys], random).map((label, i) => ({ id: `o${i}`, label }));
    rounds.push({
      trackId: t.id,
      albumId: t.albumId,
      artistId: t.artistId,
      question: {
        public: { kind: "word", masked, artist: t.artistName, options },
        answer: { kind: "option", id: (options.find((o) => o.label === word) as Option).id, label: word },
        reveal: card(t, "song"),
      },
    });
  }
  return need(rounds, QUIZZES.word.length as number, "заглавия");
}

export function generateRounds(type: QuizType, pool: PoolTrack[], random: Random): RoundSpec[] {
  switch (type) {
    case "cover":
      return coverRounds(pool, random);
    case "newer":
    case "higher":
      return pairRounds(type, pool, random);
    case "year":
      return yearRounds(pool, random);
    case "order":
      return orderRounds(pool, random);
    case "album":
      return albumRounds(pool, random);
    case "singer":
      return singerRounds(pool, random);
    case "word":
      return wordRounds(pool, random);
  }
}
