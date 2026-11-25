"use client";

import { useActionState, useState } from "react";
import type { LoginProviders } from "@/lib/auth/providers";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

const initial: AuthFormState = { error: null };

export function LoginPanel({
  next,
  providers,
  initialError,
}: {
  next: string;
  providers: LoginProviders;
  initialError: string | null;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signIn, signingIn] = useActionState(signInAction, initial);
  const [signUpState, signUp, signingUp] = useActionState(signUpAction, initial);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);

  const oauth = async (provider: "google" | "spotify") => {
    setOauthError(null);
    setRedirecting(provider);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        ...(provider === "spotify" && { scopes: "playlist-read-private playlist-read-collaborative" }),
      },
    });
    if (error) {
      setOauthError("Входът не можа да започне. Опитай пак.");
      setRedirecting(null);
    }
  };

  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;
  const error = oauthError ?? state.error ?? initialError;

  return (
    <div className="card space-y-5 p-5">
      {providers.google && (
        <button
          type="button"
          onClick={() => oauth("google")}
          disabled={redirecting !== null}
          className="btn w-full bg-white text-[#1f1f1f] hover:brightness-95"
        >
          <GoogleIcon />
          {redirecting === "google" ? "Пренасочвам…" : "Вход с Google"}
        </button>
      )}
      {providers.spotify && (
        <button
          type="button"
          onClick={() => oauth("spotify")}
          disabled={redirecting !== null}
          className="btn w-full bg-[#1db954] text-black hover:brightness-110"
        >
          {redirecting === "spotify" ? "Пренасочвам…" : "Вход със Spotify"}
        </button>
      )}
      {(providers.google || providers.spotify) && providers.email && (
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-line" />
          или с имейл
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      {providers.email && (
        <>
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-surface p-1 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full py-2 font-semibold transition ${mode === m ? "bg-surface-strong" : "text-muted"}`}
              >
                {m === "signin" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
          <form action={mode === "signin" ? signIn : signUp} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <label className="block space-y-1">
              <span className="text-sm text-muted">Имейл</span>
              <input name="email" type="email" autoComplete="email" required className="field" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Парола {mode === "signup" && "(поне 8 знака)"}</span>
              <input
                name="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                className="field"
              />
            </label>
            <button type="submit" disabled={pending} className="btn-primary w-full">
              {pending ? "Момент…" : mode === "signin" ? "Влез" : "Създай профил"}
            </button>
          </form>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      <p className="text-center text-xs text-muted">Игрите, които си изиграл като гост на това устройство, минават в профила ти.</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
