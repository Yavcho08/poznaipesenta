// Разпознаване на линкове към плейлисти. Без зависимости от сървъра.

/** deezer.com/bg/playlist/123, deezer.com/playlist/123?utm=… → "123" */
export function parseDeezerPlaylistId(input: string): string | null {
  const m = input.trim().match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?playlist\/(\d+)/i);
  if (m) return m[1];
  return /^\d{3,20}$/.test(input.trim()) ? input.trim() : null;
}

/** Кратки линкове от приложението (link.deezer.com/s/…, deezer.page.link/…) се разгъват на сървъра. */
export function isDeezerShortLink(input: string): boolean {
  return /^https?:\/\/(link\.deezer\.com|deezer\.page\.link)\//i.test(input.trim());
}

/** open.spotify.com/(intl-bg/)playlist/ID?si=…, spotify:playlist:ID → ID */
export function parseSpotifyPlaylistId(input: string): string | null {
  const m =
    input.trim().match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?playlist\/([A-Za-z0-9]{22})/) ??
    input.trim().match(/^spotify:playlist:([A-Za-z0-9]{22})$/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{22}$/.test(input.trim()) ? input.trim() : null;
}
