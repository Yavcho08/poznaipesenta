"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { GameError } from "@/lib/game/server";
import { removeFriend, respondToRequest, sendFriendRequest } from "@/lib/social/friends";

export interface FriendFormState {
  ok: boolean;
  message: string | null;
}

async function me(): Promise<string> {
  const viewer = await getViewer();
  if (!viewer) redirect("/vhod?next=/priyateli");
  if (!viewer.profile.username) redirect("/profil");
  return viewer.userId;
}

export async function addFriendAction(_prev: FriendFormState, form: FormData): Promise<FriendFormState> {
  const userId = await me();
  try {
    const r = await sendFriendRequest(userId, String(form.get("username") ?? ""));
    revalidatePath("/priyateli");
    return { ok: true, message: r.status === "accepted" ? `Вече сте приятели с ${r.username} 🎉` : `Молбата до ${r.username} е изпратена` };
  } catch (error) {
    return { ok: false, message: error instanceof GameError ? error.message : "Нещо се обърка" };
  }
}

export async function respondAction(requestId: string, accept: boolean): Promise<void> {
  const userId = await me();
  await respondToRequest(userId, requestId, accept).catch(() => undefined);
  revalidatePath("/priyateli");
}

export async function removeFriendAction(otherId: string): Promise<void> {
  const userId = await me();
  await removeFriend(userId, otherId);
  revalidatePath("/priyateli");
}
