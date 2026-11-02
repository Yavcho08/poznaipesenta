import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { finishLogin, SpotifyApiError } from "@/lib/import/spotify-api";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (params.get("error") || !code || !state) {
    redirect(`/vnos?spotifyError=${encodeURIComponent("Входът със Spotify беше отказан.")}`);
  }
  let error: string | null = null;
  try {
    await finishLogin(code, state);
  } catch (e) {
    error = e instanceof SpotifyApiError ? e.message : "Входът със Spotify не успя.";
  }
  redirect(error ? `/vnos?spotifyError=${encodeURIComponent(error)}` : "/vnos");
}
