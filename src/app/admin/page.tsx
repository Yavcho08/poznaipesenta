import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import {
  deleteArtistAction,
  deleteGenreAction,
  deletePlaylistAction,
  logoutAction,
  refreshArtistAction,
  setArtistGenresAction,
  togglePopFolkAction,
} from "./actions";
import { ActionButton, ArtistAdder, ConfirmButton, GenreForm, PlaylistForm } from "./client";
import { AdminGate } from "./gate";

export const metadata: Metadata = { title: "Админ · Познай песента" };

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
      <AdminGate>{Dashboard}</AdminGate>
    </Suspense>
  );
}

const small = "rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20";

async function Dashboard() {
  const [artists, genres, playlists] = await Promise.all([
    prisma.artist.findMany({
      orderBy: { name: "asc" },
      include: { genres: true, _count: { select: { tracks: true } } },
    }),
    prisma.genre.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { artists: true } } } }),
    prisma.playlist.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { tracks: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Админ</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted underline">
            Изход
          </button>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Артисти ({artists.length})</h2>
        <ArtistAdder genres={genres.map((g) => ({ slug: g.slug, name: g.name }))} />
        <ul className="divide-y divide-white/5 rounded-xl bg-surface">
          {artists.map((a) => (
            <li key={a.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-3">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- снимка от Deezer CDN
                  <img src={a.imageUrl} alt="" width={36} height={36} className="rounded-full" />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-white/10" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.name} <span className="text-xs font-normal text-muted">{a.nameLatin}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {a._count.tracks} песни
                    {a.deezerId && (
                      <>
                        {" · "}
                        <a href={`https://www.deezer.com/artist/${a.deezerId}`} target="_blank" rel="noreferrer" className="underline">
                          Deezer {a.deezerId}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <ActionButton action={togglePopFolkAction.bind(null, a.id)} className={`${small} ${a.isPopFolk ? "bg-accent/40" : ""}`}>
                  {a.isPopFolk ? "✓ Поп-фолк" : "Поп-фолк"}
                </ActionButton>
                <ActionButton action={refreshArtistAction.bind(null, a.id)} className={small}>
                  Обнови песните
                </ActionButton>
                <ConfirmButton action={deleteArtistAction.bind(null, a.id)} question="Изтрий?" className={`${small} text-red-300`}>
                  Изтрий
                </ConfirmButton>
              </div>
              <form action={setArtistGenresAction.bind(null, a.id)} className="flex flex-wrap items-center gap-3 pl-12 text-xs">
                {genres.map((g) => (
                  <label key={g.id} className="flex items-center gap-1">
                    <input type="checkbox" name="genre" value={g.slug} defaultChecked={a.genres.some((x) => x.id === g.id)} />
                    {g.name}
                  </label>
                ))}
                <button type="submit" className={small}>
                  Запази жанровете
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Жанрове</h2>
        <GenreForm />
        <ul className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1 text-sm">
              {g.name} <span className="text-xs text-muted">({g._count.artists})</span>
              <ConfirmButton action={deleteGenreAction.bind(null, g.id)} question="Изтрий?" className={`${small} text-red-300`}>
                ✕
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Плейлисти</h2>
        <PlaylistForm />
        <ul className="divide-y divide-white/5 rounded-xl bg-surface">
          {playlists.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/pleylisti/${p.id}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>
                <p className="text-xs text-muted">
                  {p._count.tracks} песни · {p.source}
                  {p.category === "pop-folk" && " · секция Поп-фолк"}
                </p>
              </div>
              <Link href={`/admin/pleylisti/${p.id}`} className={small}>
                Редактирай
              </Link>
              <ConfirmButton action={deletePlaylistAction.bind(null, p.id)} question="Изтрий?" className={`${small} text-red-300`}>
                Изтрий
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
