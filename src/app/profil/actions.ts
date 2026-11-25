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

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 600 * 1024;

/**
 * Собствена снимка за аватар. Браузърът я смалява до 256×256 JPEG; тук проверяваме тип/размер
 * и качваме в Supabase Storage (публичен bucket „avatars“, папка = id на потребителя).
 */
export async function uploadAvatarAction(form: FormData): Promise<ProfileFormState> {
  const viewer = await requireViewer();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Избери снимка" };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { ok: false, message: "Само JPG, PNG или WebP" };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, message: "Снимката е твърде голяма" };

  const storage = createSupabaseAdmin().storage.from(AVATAR_BUCKET);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${viewer.userId}/${Date.now()}.${ext}`;
  const { error } = await storage.upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return { ok: false, message: "Качването не успя. Опитай пак." };

  // Старите снимки на потребителя се трият (пазим само текущата).
  const { data: old } = await storage.list(viewer.userId);
  const stale = (old ?? []).map((o) => `${viewer.userId}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await storage.remove(stale);

  await prisma.profile.update({ where: { id: viewer.userId }, data: { avatarUrl: storage.getPublicUrl(path).data.publicUrl } });
  revalidatePath("/", "layout");
  return { ok: true, message: "Снимката е сменена" };
}
