import "server-only";
import { cached } from "@/lib/cache";
import { spotifyLoginEnabled, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

export interface LoginProviders {
  google: boolean;
  spotify: boolean;
  email: boolean;
}

interface AuthSettings {
  external?: Record<string, boolean>;
}

/** Кои начини за вход са включени в Supabase (Authentication → Providers). Кеш 5 мин. */
export function loginProviders(): Promise<LoginProviders> {
  return cached("auth:providers", 5 * 60 * 1000, async () => {
    const url = supabaseUrl();
    const key = supabasePublishableKey();
    if (!url || !key) return { google: false, spotify: false, email: false };
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store" });
      const settings = (await res.json()) as AuthSettings;
      const ext = settings.external ?? {};
      return { google: Boolean(ext.google), spotify: Boolean(ext.spotify) && spotifyLoginEnabled(), email: ext.email !== false };
    } catch {
      return { google: false, spotify: false, email: true };
    }
  });
}

/** Само относителни пътища в сайта (без отворени пренасочвания към чужди адреси). */
export function safeNext(value: unknown, fallback = "/profil"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
