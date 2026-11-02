import "server-only";
import { cached } from "@/lib/cache";
import { cleanTitle, looseKey, mainArtist, transliterate } from "@/lib/normalize";

// Резервен източник на звук: iTunes Search API (country=BG), когато Deezer няма preview.

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
}

interface ItunesResponse {
  results: ItunesResult[];
}

const DAY = 24 * 60 * 60 * 1000;

async function searchItunes(term: string): Promise<ItunesResult[]> {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=BG&media=music&entity=song&limit=10`,
    { cache: "no-store" },
  );
  if (!res.ok) return [];
  return ((await res.json()) as ItunesResponse).results;
}

export function findItunesPreview(title: string, artist: string): Promise<string | null> {
  return cached(`itunes:${artist}|${title}`, DAY, async () => {
    const wantTitle = looseKey(cleanTitle(title));
    const wantArtist = looseKey(mainArtist(artist));
    // В iTunes българските артисти често са на латиница, а заглавията — на кирилица,
    // затова пробваме и транслитерирано, и само по заглавие (артистът се проверява отделно).
    const terms = [
      ...new Set([
        `${artist} ${title}`,
        transliterate(`${mainArtist(artist)} ${cleanTitle(title)}`),
        cleanTitle(title),
      ]),
    ];
    for (const term of terms) {
      const match = (await searchItunes(term)).find(
        (r) =>
          r.previewUrl &&
          looseKey(r.trackName ?? "").includes(wantTitle) &&
          looseKey(r.artistName ?? "").includes(wantArtist),
      );
      if (match?.previewUrl) return match.previewUrl;
    }
    return null;
  });
}
