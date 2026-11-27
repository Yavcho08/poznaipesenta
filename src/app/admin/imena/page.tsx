import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { shownArtist, shownTitle } from "@/lib/catalog/display";
import { looseKey } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { AdminGate } from "../gate";
import { renameArtistAction, setTitleOverrideAction } from "./actions";

export const metadata: Metadata = { title: "Имена · Админ" };

async function Content({ q, artistFilter }: { q: string; artistFilter: string }) {
  const key = looseKey(artistFilter);
  const [artists, tracks] = await Promise.all([
    prisma.artist.findMany({
      where: { isActive: true },
      orderBy: [{ isPopFolk: "desc" }, { name: "asc" }],
      select: { id: true, name: true, nameLatin: true, isPopFolk: true },
    }),
    q.length >= 2
      ? prisma.track.findMany({
          where: { searchKey: { contains: looseKey(q) } },
          orderBy: { rank: "desc" },
          take: 30,
          select: { id: true, title: true, artistName: true, titleOverride: true, displayTitle: true, displayArtist: true, isActive: true },
        })
      : Promise.resolve([]),
  ]);
  const shownArtists = key ? artists.filter((a) => looseKey(a.name).includes(key) || looseKey(a.nameLatin ?? "").includes(key)) : artists;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Имена (кирилица)</h1>
        <Link href="/admin" className="text-sm text-muted underline">
          ← Админ
        </Link>
      </div>
      <p className="text-sm text-muted">
        Навсякъде в играта показваме една форма: името на артиста оттук и заглавието на кирилица, ако има кирилско издание на същата песен (по
        ISRC или нормализирано заглавие). Тук можеш да ги смениш. Проверката на отговорите не зависи от това как е изписано.
      </p>

      <section className="space-y-3">
        <h2 className="font-semibold">Песни</h2>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Търси песен (заглавие или артист)…" className="field py-2" />
          <input type="hidden" name="a" value={artistFilter} />
          <button type="submit" className="btn-ghost shrink-0 px-4 py-2 text-sm">
            Търси
          </button>
        </form>
        {tracks.length > 0 && (
          <ul className="card divide-y divide-line text-sm">
            {tracks.map((t) => (
              <li key={t.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{shownTitle(t)}</span>
                  <span className="text-muted">– {shownArtist(t)}</span>
                  {!t.isActive && <span className="text-xs text-muted">(неактивна)</span>}
                </div>
                <p className="text-xs text-muted">
                  От Deezer: {t.title} – {t.artistName}
                  {t.displayTitle && !t.titleOverride && " · кирилицата е взета от друго издание"}
                </p>
                <form action={setTitleOverrideAction.bind(null, t.id)} className="flex gap-2">
                  <input name="title" defaultValue={t.titleOverride ?? ""} placeholder="Заглавие за показване (празно = автоматично)" className="field py-1.5 text-sm" />
                  <button type="submit" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
                    Запази
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {q.length >= 2 && tracks.length === 0 && <p className="text-sm text-muted">Нищо не е намерено.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Артисти</h2>
        <form method="get" className="flex gap-2">
          <input name="a" defaultValue={artistFilter} placeholder="Филтър по име…" className="field py-2" />
          <input type="hidden" name="q" value={q} />
          <button type="submit" className="btn-ghost shrink-0 px-4 py-2 text-sm">
            Покажи
          </button>
        </form>
        <ul className="card divide-y divide-line text-sm">
          {shownArtists.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <form action={renameArtistAction.bind(null, a.id)} className="flex min-w-0 flex-1 gap-2">
                <input name="name" defaultValue={a.name} aria-label={`Име на ${a.name}`} className="field py-1.5 text-sm" />
                <button type="submit" className="btn-ghost shrink-0 px-3 py-1.5 text-xs">
                  Запази
                </button>
              </form>
              <span className="text-xs text-muted">{a.isPopFolk ? "поп-фолк" : "друг"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function Page({ searchParams }: PageProps<"/admin/imena">) {
  await connection();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const a = typeof params.a === "string" ? params.a.trim() : "";
  return <AdminGate>{async () => <Content q={q} artistFilter={a} />}</AdminGate>;
}

export default function NamesPage(props: PageProps<"/admin/imena">) {
  return (
    <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
      <Page {...props} />
    </Suspense>
  );
}
