import "server-only";
import type { SourceTrack } from "@/lib/import/similarity";

// ИЗОЛИРАН МОДУЛ: чете публичната embed страница на Spotify (open.spotify.com/embed/playlist/{id}).
// Това не е официално API — Spotify може да промени страницата по всяко време.
// Ако спре да работи, хвърля SpotifyEmbedError с ясно съобщение; останалото приложение не зависи от него.
// Взимаме САМО заглавия и артисти. Звукът НИКОГА не идва от Spotify (audioPreview се игнорира).

export class SpotifyEmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyEmbedError";
  }
}

interface EmbedTrack {
  title?: unknown;
  subtitle?: unknown;
  duration?: unknown;
}

const BROKEN =
  "Четенето на публичен Spotify линк спря да работи (Spotify е променил страницата си). Използвай вход със Spotify или Deezer линк.";

export async function readSpotifyEmbed(playlistId: string): Promise<{ name: string; tracks: SourceTrack[] }> {
  let html: string;
  try {
    const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "Accept-Language": "bg,en;q=0.8",
      },
    });
    if (res.status === 404) throw new SpotifyEmbedError("Плейлистът не е намерен или не е публичен.");
    if (!res.ok) throw new SpotifyEmbedError(`Spotify отговори с грешка ${res.status}.`);
    html = await res.text();
  } catch (error) {
    if (error instanceof SpotifyEmbedError) throw error;
    throw new SpotifyEmbedError("Няма връзка със Spotify.");
  }

  const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new SpotifyEmbedError(BROKEN);

  let entity: { name?: unknown; trackList?: unknown };
  try {
    const data = JSON.parse(raw) as {
      props?: { pageProps?: { status?: unknown; state?: { data?: { entity?: typeof entity } } } };
    };
    // Несъществуващ/частен плейлист: страницата е 200, но pageProps.status е 404.
    if (data.props?.pageProps?.status === 404) {
      throw new SpotifyEmbedError("Плейлистът не е намерен или не е публичен.");
    }
    entity = data.props?.pageProps?.state?.data?.entity ?? {};
  } catch (error) {
    if (error instanceof SpotifyEmbedError) throw error;
    throw new SpotifyEmbedError(BROKEN);
  }
  if (!Array.isArray(entity.trackList)) throw new SpotifyEmbedError(BROKEN);

  const tracks: SourceTrack[] = (entity.trackList as EmbedTrack[])
    .filter((t): t is { title: string; subtitle: string; duration?: unknown } => typeof t.title === "string" && typeof t.subtitle === "string")
    .map((t) => ({
      title: t.title,
      // „Galin, Azis“ — артистите са в subtitle, разделени със запетая.
      artists: t.subtitle.split(/\s*,\s*/).filter(Boolean),
      durationMs: typeof t.duration === "number" ? t.duration : null,
    }));

  return { name: typeof entity.name === "string" ? entity.name : "Плейлист от Spotify", tracks };
}
