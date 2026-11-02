import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { removeTrackFromPlaylistAction, updatePlaylistAction } from "../../actions";
import { ActionButton, PlaylistTrackAdder } from "../../client";
import { AdminGate } from "../../gate";

const input = "w-full rounded-lg bg-background px-3 py-2 outline-none ring-accent focus:ring-2";

export default function PlaylistEditorPage({ params }: PageProps<"/admin/pleylisti/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
      <AdminGate>{() => Editor({ params })}</AdminGate>
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/pleylisti/[id]">["params"] }) {
  const { id } = await params;
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: { tracks: { orderBy: { position: "asc" }, include: { track: true } } },
  });
  if (!playlist) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-muted underline">
        ← Админ
      </Link>

      <form action={updatePlaylistAction.bind(null, playlist.id)} className="grid gap-2 rounded-xl bg-surface p-4 sm:grid-cols-2">
        <input name="name" defaultValue={playlist.name} required className={input} aria-label="Име" />
        <input name="description" defaultValue={playlist.description ?? ""} placeholder="Описание" className={input} aria-label="Описание" />
        <select name="category" defaultValue={playlist.category ?? ""} className={input} aria-label="Секция">
          <option value="">Секция „Плейлисти“</option>
          <option value="pop-folk">Секция „Поп-фолк“</option>
        </select>
        <input name="sortOrder" type="number" defaultValue={playlist.sortOrder} className={input} aria-label="Подредба" />
        <button type="submit" className="rounded-full bg-accent px-5 py-2 font-semibold text-white sm:col-span-2">
          Запази
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">Добави песен</h2>
        <PlaylistTrackAdder playlistId={playlist.id} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Песни ({playlist.tracks.length})</h2>
        <ol className="divide-y divide-white/5 rounded-xl bg-surface">
          {playlist.tracks.map(({ track }, i) => (
            <li key={track.id} className="flex items-center gap-3 p-2">
              <span className="w-6 text-right text-xs text-muted">{i + 1}</span>
              {track.albumCover && (
                // eslint-disable-next-line @next/next/no-img-element -- обложка от Deezer CDN
                <img src={track.albumCover} alt="" width={36} height={36} className="rounded" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{track.title}</p>
                <p className="truncate text-xs text-muted">
                  {track.artistName}
                  {track.releaseYear && ` · ${track.releaseYear}`}
                </p>
              </div>
              <ActionButton
                action={removeTrackFromPlaylistAction.bind(null, playlist.id, track.id)}
                className="rounded bg-white/10 px-2 py-1 text-xs text-red-300"
              >
                Махни
              </ActionButton>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
