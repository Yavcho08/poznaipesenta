"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { recomputeDisplayNames } from "@/lib/catalog/display-names";
import { recomputeAllYears } from "@/lib/catalog/years-recompute";
import { runSync } from "@/lib/sync/run";

export interface SyncActionState {
  ok: boolean;
  message: string | null;
}

const PAGE = "/admin/sinhronizaciya";

export async function runSyncAction(): Promise<SyncActionState> {
  await requireAdmin();
  const s = await runSync({ trigger: "manual", budgetMs: 40_000 });
  const years = await recomputeAllYears();
  await recomputeDisplayNames();
  revalidatePath(PAGE);
  const rest = s.remaining > 0 ? ` Остават ${s.remaining} артиста — пусни пак, за да продължи.` : "";
  return {
    ok: s.status !== "error",
    message: `Обработени артисти: ${s.artistsProcessed}, нови песни: ${s.newTracks}, обновени: ${s.updatedTracks}, грешки: ${s.errors.length}. Поправени години: ${years.changedTracks} песни, ${years.changedAlbums} албума.${rest}`,
  };
}

export async function addFilterAction(_prev: SyncActionState, form: FormData): Promise<SyncActionState> {
  await requireAdmin();
  const pattern = String(form.get("pattern") ?? "").trim().toLowerCase().slice(0, 40);
  const note = String(form.get("note") ?? "").trim().slice(0, 80) || null;
  if (pattern.length < 2) return { ok: false, message: "Поне 2 знака" };
  try {
    await prisma.syncFilter.create({ data: { pattern, note } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: "Вече го има" };
    throw error;
  }
  revalidatePath(PAGE);
  return { ok: true, message: `Добавен филтър „${pattern}“` };
}

export async function toggleFilterAction(id: string): Promise<void> {
  await requireAdmin();
  const f = await prisma.syncFilter.findUniqueOrThrow({ where: { id } });
  await prisma.syncFilter.update({ where: { id }, data: { isActive: !f.isActive } });
  revalidatePath(PAGE);
}

export async function deleteFilterAction(id: string): Promise<void> {
  await requireAdmin();
  await prisma.syncFilter.delete({ where: { id } });
  revalidatePath(PAGE);
}

/** Скрива песен от игрите (или я връща). Скритите не се активират обратно от синхронизацията. */
export async function toggleTrackHiddenAction(trackId: string): Promise<void> {
  await requireAdmin();
  const t = await prisma.track.findUniqueOrThrow({ where: { id: trackId } });
  const hidden = t.deactivatedReason === "hidden";
  await prisma.track.update({
    where: { id: trackId },
    data: hidden ? { isActive: true, deactivatedReason: null } : { isActive: false, deactivatedReason: "hidden" },
  });
  revalidatePath(PAGE);
}
