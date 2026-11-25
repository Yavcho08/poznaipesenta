import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { looseKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { AdminGate } from "../gate";
import { deleteFilterAction, toggleFilterAction, toggleTrackHiddenAction } from "./actions";
import { AddFilterForm, RunSyncButton } from "./client";

export const metadata: Metadata = { title: "Синхронизация · Админ" };

const STATUS: Record<string, string> = { running: "⏳ тече", ok: "✅ готово", partial: "⏸️ частично", error: "❌ грешка" };

async function Content({ q }: { q: string }) {
  const [runs, filters, found] = await Promise.all([
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.syncFilter.findMany({ orderBy: { pattern: "asc" } }),
    q.length >= 2
      ? prisma.track.findMany({
          where: { searchKey: { contains: looseKey(q) } },
          orderBy: { rank: "desc" },
          take: 20,
          select: { id: true, title: true, artistName: true, isActive: true, deactivatedReason: true, releaseYear: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Синхронизация с Deezer</h1>
        <Link href="/admin" className="text-sm text-muted underline">
          ← Админ
        </Link>
      </div>

      <section className="card space-y-3 p-4">
        <p className="text-sm text-muted">
          Всяка нощ (03:00 UTC) за всеки активен артист: нови албуми/сингли → нови песни (без версиите от филтрите и без дубликати), обновена
          популярност. Новите поп-фолк песни от {2020}+ влизат в „Нов поп-фолк“. Нов артист се добавя от <Link href="/admin" className="underline">админа</Link>.
        </p>
        <RunSyncButton />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Последни синхронизации</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">Още няма.</p>
        ) : (
          <ul className="card divide-y divide-line text-sm">
            {runs.map((r) => {
              const errors = Array.isArray(r.errors) ? (r.errors as { artist: string; message: string }[]) : [];
              return (
                <li key={r.id} className="space-y-1 px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{STATUS[r.status] ?? r.status}</span>
                    <span className="text-muted">{r.startedAt.toLocaleString("bg-BG", { timeZone: "Europe/Sofia" })}</span>
                    <span className="text-xs text-muted">{r.trigger === "cron" ? "автоматично" : "ръчно"}</span>
                    <span className="flex-1" />
                    <span>
                      артисти <strong>{r.artistsProcessed}</strong> · нови <strong>{r.newTracks}</strong> · обновени {r.updatedTracks}
                    </span>
                  </div>
                  {errors.length > 0 && (
                    <details className="text-xs text-red-200">
                      <summary>{errors.length} грешки</summary>
                      <ul className="mt-1 space-y-0.5">
                        {errors.slice(0, 20).map((e, i) => (
                          <li key={i}>
                            {e.artist}: {e.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Филтри срещу версии и дубликати</h2>
        <p className="text-xs text-muted">Песен, чието заглавие или версия съдържа някоя от думите (цяла дума), не се внася.</p>
        <AddFilterForm />
        <ul className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <li key={f.id} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${f.isActive ? "border-line" : "border-line opacity-50 line-through"}`} title={f.note ?? undefined}>
              <form action={toggleFilterAction.bind(null, f.id)}>
                <button type="submit" className="hover:underline">
                  {f.pattern}
                </button>
              </form>
              <form action={deleteFilterAction.bind(null, f.id)}>
                <button type="submit" aria-label={`Изтрий ${f.pattern}`} className="text-muted hover:text-red-300">
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Скрий песен</h2>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Заглавие или артист" className="field py-2" />
          <button type="submit" className="btn-ghost shrink-0 px-4 py-2 text-sm">
            Търси
          </button>
        </form>
        {found.length > 0 && (
          <ul className="card divide-y divide-line text-sm">
            {found.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <span className={`min-w-0 flex-1 truncate ${t.isActive ? "" : "text-muted line-through"}`}>
                  {t.title} – {t.artistName} {t.releaseYear && <span className="text-xs text-muted">({t.releaseYear})</span>}
                </span>
                {!t.isActive && t.deactivatedReason !== "hidden" && <span className="text-xs text-muted">{t.deactivatedReason}</span>}
                <form action={toggleTrackHiddenAction.bind(null, t.id)}>
                  <button type="submit" className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-strong">
                    {t.deactivatedReason === "hidden" ? "Покажи" : "Скрий"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Page({ searchParams }: PageProps<"/admin/sinhronizaciya">) {
  await connection();
  const q = (await searchParams).q;
  return <AdminGate>{async () => <Content q={typeof q === "string" ? q.trim() : ""} />}</AdminGate>;
}

export default function SyncPage(props: PageProps<"/admin/sinhronizaciya">) {
  return (
    <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
      <Page {...props} />
    </Suspense>
  );
}
