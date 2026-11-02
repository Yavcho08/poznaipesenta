import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SpotifyApiError, startLogin } from "@/lib/import/spotify-api";

export async function GET() {
  // Винаги при заявка: всеки вход има собствен PKCE verifier и state (без prerender при build).
  await connection();
  let url: string;
  try {
    url = await startLogin();
  } catch (error) {
    const message = error instanceof SpotifyApiError ? error.message : "Spotify входът не работи";
    redirect(`/vnos?spotifyError=${encodeURIComponent(message)}`);
  }
  redirect(url);
}
