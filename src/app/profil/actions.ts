"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { AVATAR_EMOJIS } from "@/components/avatar";
import { checkUsername } from "@/lib/auth/username";
import { getViewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface ProfileFormState {
  ok: boolean;
  message: string | null;
}

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/vhod?next=/profil");
  return viewer;
}

export async function saveUsernameAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const viewer = await requireViewer();
  const raw = form.get("username");
  const check = checkUsername(typeof raw === "string" ? raw : "");
  if (!check.ok) return { ok: false, message: check.error };
  try {
    await prisma.profile.update({ where: { id: viewer.userId }, data: { username: check.username } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, message: "Това име е заето — избери друго" };
    }
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Името е запазено" };
}

export async function saveAvatarAction(value: string): Promise<void> {
  const viewer = await requireViewer();
  const emoji = value.startsWith("emoji:") ? value.slice("emoji:".length) : null;
  // Само емоджи от списъка или снимката от входа (Google) — без произволни адреси.
  let avatarUrl: string | null = null;
  if (emoji && (AVATAR_EMOJIS as readonly string[]).includes(emoji)) avatarUrl = value;
  else if (value === "provider") {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.auth.getUser();
    const meta = data.user?.user_metadata ?? {};
    const url = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null;
    avatarUrl = url && url.startsWith("https://") ? url : null;
  }
  await prisma.profile.update({ where: { id: viewer.userId }, data: { avatarUrl } });
  revalidatePath("/", "layout");
}

/** Изтрива акаунта и всичките му данни (игри, постижения — каскадно през тригера в базата). */
export async function deleteAccountAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const viewer = await requireViewer();
  if (form.get("confirm") !== "ИЗТРИЙ") return { ok: false, message: "Напиши ИЗТРИЙ (с главни букви), за да потвърдиш" };
  const { error } = await createSupabaseAdmin().auth.admin.deleteUser(viewer.userId);
  if (error) return { ok: false, message: "Изтриването не успя. Опитай пак." };
  // Ако тригерът по някаква причина не е минал — трием профила (каскадно игрите) и оттук.
  await prisma.profile.deleteMany({ where: { id: viewer.userId } });
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/?iztrit=1");
}
