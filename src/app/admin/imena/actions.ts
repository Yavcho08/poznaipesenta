"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { recomputeDisplayNames } from "@/lib/catalog/display-names";
import { latinName } from "@/lib/import-artist";
import { prisma } from "@/lib/prisma";

const PAGE = "/admin/imena";

/** Ново име на артист (навсякъде в играта). Съпоставянето с Deezer е по id, не по име. */
export async function renameArtistAction(artistId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (!name) return;
  await prisma.artist.update({ where: { id: artistId }, data: { name, nameLatin: latinName(name) } });
  await recomputeDisplayNames();
  revalidatePath(PAGE);
}

/** Заглавие за показване на песен (празно = автоматично). */
export async function setTitleOverrideAction(trackId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const value = String(form.get("title") ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  await prisma.track.update({ where: { id: trackId }, data: { titleOverride: value || null } });
  await recomputeDisplayNames();
  revalidatePath(PAGE);
}
