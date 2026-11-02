import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "admin";
const MAX_AGE_S = 7 * 24 * 60 * 60;

function password(): string | null {
  // trim: при задаване през конзола (напр. `… | vercel env add`) в края често влиза нов ред.
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value ? value : null;
}

// Бисквитката съдържа HMAC, не паролата. Смяна на паролата обезсилва всички сесии.
function token(secret: string): string {
  return createHmac("sha256", secret).update("poznai-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function adminConfigured(): boolean {
  return password() !== null;
}

export async function isAdmin(): Promise<boolean> {
  const secret = password();
  if (!secret) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  return value !== undefined && safeEqual(value, token(secret));
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Нужен е вход в админ панела");
}

/** Връща true при вярна парола и записва бисквитката. */
export async function logIn(attempt: string): Promise<boolean> {
  const secret = password();
  if (!secret || !safeEqual(token(attempt.trim()), token(secret))) return false;
  (await cookies()).set(COOKIE, token(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
