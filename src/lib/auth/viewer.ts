import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import type { Profile } from "@/generated/prisma/client";

// --- Влязъл потребител ---

export interface Viewer {
  userId: string;
  email: string | null;
  profile: Profile;
}

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function metaString(meta: unknown, key: string): string | null {
  if (typeof meta !== "object" || meta === null || !(key in meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

/** Профилът на потребителя; създава се при първото влизане. Админ = имейл от ADMIN_EMAILS. */
export async function ensureProfile(userId: string, email: string | null, meta: unknown): Promise<Profile> {
  const admin = email !== null && adminEmails().has(email.toLowerCase());
  const existing = await prisma.profile.findUnique({ where: { id: userId } });
  if (existing) {
    if (admin && existing.role !== "admin") return prisma.profile.update({ where: { id: userId }, data: { role: "admin" } });
    return existing;
  }
  return prisma.profile.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      avatarUrl: metaString(meta, "avatar_url") ?? metaString(meta, "picture"),
      role: admin ? "admin" : "user",
    },
  });
}

/** Текущият влязъл потребител или null (веднъж на заявка). */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!supabaseConfigured()) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const email = typeof claims.email === "string" && claims.email ? claims.email : null;
  const profile = await ensureProfile(claims.sub, email, claims.user_metadata);
  return { userId: claims.sub, email, profile };
});

export async function isAdminViewer(): Promise<boolean> {
  return (await getViewer())?.profile.role === "admin";
}

// --- Гост ---
// uuid в httpOnly бисквитка (сървърът я чете при всяка заявка, клиентът не може да я подмени
// с чужда, без да я знае). При вход прогресът минава към профила (mergeGuestInto).

const GUEST_COOKIE = "pp_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readGuestId(): Promise<string | null> {
  const value = (await cookies()).get(GUEST_COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

/** Id на госта (създава го). Само в route handler / server action — пише бисквитка. */
async function ensureGuestId(): Promise<string> {
  let id = await readGuestId();
  if (!id) {
    id = randomUUID();
    (await cookies()).set(GUEST_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });
  }
  await prisma.guest.upsert({ where: { id }, update: { lastSeenAt: new Date() }, create: { id } });
  return id;
}

/** Чий е ходът/играта: профил или гост. */
export type Owner = { userId: string; guestId?: undefined } | { guestId: string; userId?: undefined };

/** Текущият играч (създава гост, ако няма вход). Само в route handler / server action. */
export async function currentOwner(): Promise<Owner> {
  const viewer = await getViewer();
  return viewer ? { userId: viewer.userId } : { guestId: await ensureGuestId() };
}

/** Текущият играч само за четене (без да създава гост) — за server components. */
export async function peekOwner(): Promise<Owner | null> {
  const viewer = await getViewer();
  if (viewer) return { userId: viewer.userId };
  const guestId = await readGuestId();
  return guestId ? { guestId } : null;
}

export function ownerWhere(owner: Owner): { userId: string } | { guestId: string } {
  return owner.userId ? { userId: owner.userId } : { guestId: owner.guestId as string };
}

/**
 * Прехвърля игрите и постиженията на госта (от бисквитката) към профила и маха бисквитката.
 * Вика се веднага след вход/регистрация.
 */
export async function mergeGuestInto(user: { id: string; email?: string | null; user_metadata?: unknown }): Promise<number> {
  const userId = user.id;
  // Профилът трябва да съществува преди игрите да сочат към него (FK).
  await ensureProfile(userId, user.email ?? null, user.user_metadata);
  const guestId = await readGuestId();
  if (!guestId) return 0;
  const guest = await prisma.guest.findUnique({ where: { id: guestId }, include: { achievements: true } });
  let moved = 0;
  if (guest && !guest.mergedInto) {
    const mine = new Map(
      (await prisma.userAchievement.findMany({ where: { userId } })).map((a) => [a.achievementCode, a]),
    );
    await prisma.$transaction(async (tx) => {
      moved = (await tx.game.updateMany({ where: { guestId }, data: { userId, guestId: null } })).count;
      for (const a of guest.achievements) {
        const own = mine.get(a.achievementCode);
        if (!own) {
          await tx.userAchievement.update({ where: { id: a.id }, data: { userId, guestId: null } });
          continue;
        }
        const unlockedAt =
          own.unlockedAt && a.unlockedAt ? (own.unlockedAt < a.unlockedAt ? own.unlockedAt : a.unlockedAt) : (own.unlockedAt ?? a.unlockedAt);
        await tx.userAchievement.update({
          where: { id: own.id },
          data: { progress: Math.max(own.progress, a.progress), unlockedAt },
        });
        await tx.userAchievement.delete({ where: { id: a.id } });
      }
      await tx.guest.update({ where: { id: guestId }, data: { mergedInto: userId } });
    });
  }
  (await cookies()).delete(GUEST_COOKIE);
  return moved;
}
