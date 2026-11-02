import { connection } from "next/server";
import { getMyPlaylists, SpotifyApiError } from "@/lib/import/spotify-api";

// Плейлистите на влезлия Spotify потребител.
export async function GET() {
  await connection();
  try {
    return Response.json({ playlists: await getMyPlaylists() });
  } catch (error) {
    if (error instanceof SpotifyApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Не успях да заредя плейлистите" }, { status: 502 });
  }
}
