import { NextResponse, type NextRequest } from "next/server";
import { mergeGuestInto } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/providers";
import { saveSpotifyAccessToken } from "@/lib/import/spotify-api";
import { createSupabaseServer } from "@/lib/supabase/server";

// Връщане след вход с Google/Spotify (OAuth, PKCE): кодът се разменя за сесия в бисквитките.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const next = safeNext(params.get("next"), "/");
  const code = params.get("code");
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/vhod?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`, req.url));

  if (params.get("error") || !code) return fail("Входът беше отказан или прекъснат.");

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return fail("Входът не успя. Опитай пак.");

  // Вход със Spotify: токенът на Spotify е наличен само сега — пазим го за вноса на плейлисти (/vnos).
  if (data.session.provider_token && data.user.app_metadata.provider === "spotify") {
    await saveSpotifyAccessToken(data.session.provider_token, 3600);
  }
  await mergeGuestInto(data.user);
  return NextResponse.redirect(new URL(next, req.url));
}
