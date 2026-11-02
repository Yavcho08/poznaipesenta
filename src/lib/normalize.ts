// Нормализация на заглавия и имена за сравнение кирилица ↔ латиница.
// Без зависимости от сървъра — ползва се и на клиента, и в тестовете.

// Официалната българска транслитерация (Закон за транслитерацията, 2009).
const BG_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/** Кирилица → латиница по официалния стандарт („ия“ в края на дума → „ia“). */
export function transliterate(input: string): string {
  const lower = input.toLowerCase().replace(/ия(?=$|[^\p{L}])/gu, "ia");
  let out = "";
  for (const ch of lower) out += BG_TO_LATIN[ch] ?? ch;
  return out;
}

/** lowercase, без диакритики и пунктуация, единични интервали. Азбуката се запазва. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Свежда различните неофициални латински изписвания до една форма:
// „Niama“/„Nyama“, „Jivot“/„Zhivot“, „Cvetelina“/„Tsvetelina“.
function foldLatin(latin: string): string {
  return latin
    .replace(/dzh|dj|zh/g, "j")
    .replace(/tz|ts/g, "c")
    .replace(/kh/g, "h")
    .replace(/ph/g, "f")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1");
}

/** Ключ за сравнение: транслитериран, сгънат, без интервали. */
export function looseKey(input: string): string {
  return foldLatin(transliterate(normalizeText(input))).replace(/ /g, "");
}

// Скоби/тирета с версия на песента, които не променят коя е песента.
const VERSION_WORDS =
  /\b(feat|ft|featuring|with|remix|rmx|mix|live|radio edit|edit|version|remaster(ed)?|acoustic|original|extended|club|instrumental|karaoke|explicit|clean)\b|ремикс|версия|на живо|лайв/iu;

/** Заглавие без „(feat. …)“, „- Remix“, „[Live]“, „Radio Edit“ и т.н. */
export function cleanTitle(title: string): string {
  let t = title;
  // Скоби, в които има дума за версия или участие.
  t = t.replace(/[([{][^)\]}]*[)\]}]/g, (part) => (VERSION_WORDS.test(part) ? " " : part));
  // „ - Remix“, „ - Live at …“, „ - Radio Edit“ в края.
  t = t.replace(/\s[-–—]\s.*$/u, (part) => (VERSION_WORDS.test(part) ? "" : part));
  // Свободно „feat. X“ без скоби.
  t = t.replace(/\s(feat|ft|featuring)\.?\s.*$/iu, "");
  return t.trim();
}

const ARTIST_SEPARATOR = /\s+(?:feat\.?|ft\.?|featuring|x|vs\.?|и|with)\s+|\s*[&,/+]\s*/iu;

/** Основният артист: „Галена feat. Фики“ / „Галена & Фики“ / „Галена, Фики“ → „Галена“. */
export function mainArtist(name: string): string {
  return name.split(ARTIST_SEPARATOR)[0].trim();
}

/** Всички артисти в полето: „Галена & Фики“ → [„Галена“, „Фики“]. */
export function splitArtists(name: string): string[] {
  return name
    .split(ARTIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Гост-артисти, записани в заглавието: „Делник и празник (feat. Kali)“ → [„Kali“]. */
export function featuredInTitle(title: string): string[] {
  const match = title.match(/\b(?:feat|ft|featuring)\.?\s+([^)\]]+)|[([]with\s+([^)\]]+)/iu);
  const names = match?.[1] ?? match?.[2];
  return names ? splitArtists(names) : [];
}

export function titleKey(title: string): string {
  return looseKey(cleanTitle(title));
}

export function artistKey(name: string): string {
  return looseKey(mainArtist(name));
}

/** Ключ за премахване на дубликати: нормализирани заглавие + основен артист. */
export function songKey(title: string, artist: string): string {
  return `${titleKey(title)}|${artistKey(artist)}`;
}

function artistKeys(song: { title: string; artist: string }): Set<string> {
  return new Set([...splitArtists(song.artist), ...featuredInTitle(song.title)].map(looseKey).filter(Boolean));
}

/**
 * Една и съща песен ли е (друга версия/албум се зачита).
 * Заглавието трябва да съвпада след нормализация, а основният артист на едната —
 * да участва в другата. Така дуетът „Тази дискотека“ е верен и като „Galin & Azis“,
 * и като „Azis feat. Galin“, но не и същото заглавие от съвсем друг артист.
 */
export function isSameSong(
  a: { title: string; artist: string },
  b: { title: string; artist: string },
): boolean {
  if (titleKey(a.title) !== titleKey(b.title)) return false;
  const aKeys = artistKeys(a);
  const bKeys = artistKeys(b);
  return aKeys.has(artistKey(b.artist)) || bKeys.has(artistKey(a.artist));
}

/** Ключ за търсене в нашата база (заглавие + всички артисти, без интервали). */
export function searchKey(title: string, artist: string): string {
  return `${looseKey(title)} ${looseKey(artist)}`;
}

// --- Латиница → кирилица (за заявки, написани на латиница) ---

// По-дългите съчетания първи.
const LATIN_TO_BG: [string, string][] = [
  ["sht", "щ"], ["zh", "ж"], ["ch", "ч"], ["sh", "ш"], ["ts", "ц"], ["yu", "ю"], ["ya", "я"],
  ["ju", "ю"], ["ja", "я"], ["a", "а"], ["b", "б"], ["c", "ц"], ["d", "д"], ["e", "е"], ["f", "ф"],
  ["g", "г"], ["h", "х"], ["i", "и"], ["j", "ж"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"],
  ["o", "о"], ["p", "п"], ["q", "к"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["v", "в"],
  ["w", "в"], ["x", "кс"], ["y", "й"], ["z", "з"],
];

/** Обратна транслитерация (приблизителна — „ъ“ и „й/ь“ не се различават еднозначно). */
export function toCyrillic(input: string): string {
  const lower = input.toLowerCase().replace(/ia(?=$|[^a-z])/g, "ия");
  let out = "";
  let i = 0;
  outer: while (i < lower.length) {
    for (const [latin, bg] of LATIN_TO_BG) {
      if (lower.startsWith(latin, i)) {
        out += bg;
        i += latin.length;
        continue outer;
      }
    }
    out += lower[i];
    i++;
  }
  return out;
}

export function hasCyrillic(input: string): boolean {
  return /\p{Script=Cyrillic}/u.test(input);
}

export function hasLatin(input: string): boolean {
  return /[a-z]/i.test(input);
}

/** Вариантите на заявката за търсене: оригинал + другата азбука. */
export function queryVariants(query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  const variants = [q];
  if (hasCyrillic(q)) variants.push(transliterate(q));
  else if (hasLatin(q)) variants.push(toCyrillic(q));
  return [...new Set(variants)];
}
