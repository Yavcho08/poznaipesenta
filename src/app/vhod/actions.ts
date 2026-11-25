"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { mergeGuestInto } from "@/lib/auth/viewer";
import { safeNext } from "@/lib/auth/providers";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface AuthFormState {
  error: string | null;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Грешен имейл или парола",
  user_already_exists: "Вече има профил с този имейл — влез",
  email_exists: "Вече има профил с този имейл — влез",
  weak_password: "Паролата е твърде слаба (поне 8 знака)",
  over_request_rate_limit: "Твърде много опити. Изчакай малко.",
  over_email_send_rate_limit: "Твърде много опити. Изчакай малко.",
  validation_failed: "Провери имейла и паролата",
  email_not_confirmed: "Потвърди имейла си от писмото, което ти пратихме",
};

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function authenticate(mode: "signin" | "signup", form: FormData): Promise<AuthFormState> {
  if (!rateLimit(`auth:${await clientKey()}`, 10, 60_000)) return { error: MESSAGES.over_request_rate_limit };
  const email = field(form, "email");
  const password = typeof form.get("password") === "string" ? (form.get("password") as string) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Въведи валиден имейл" };
  if (password.length < 8) return { error: "Паролата трябва да е поне 8 знака" };

  const supabase = await createSupabaseServer();
  const { data, error } =
    mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
  if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message };
  if (!data.user) return { error: "Нещо се обърка. Опитай пак." };
  if (!data.session) return { error: "Провери пощата си и потвърди имейла, после влез." };

  await mergeGuestInto(data.user);
  redirect(safeNext(field(form, "next")));
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  return authenticate("signin", form);
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  return authenticate("signup", form);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}
