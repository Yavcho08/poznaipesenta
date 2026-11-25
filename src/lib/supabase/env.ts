// Публичните настройки на Supabase (отиват и в браузъра). Тайният ключ е в admin.ts — само на сървъра.

export function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

export function supabasePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || null;
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

/** Входът със Spotify е скрит по подразбиране (Spotify Development Mode допуска само ръчно добавени потребители). */
export function spotifyLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SPOTIFY_LOGIN === "true";
}
