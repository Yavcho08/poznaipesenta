import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Avatar } from "@/components/avatar";
import { getViewer } from "@/lib/auth/viewer";
import { listFriends, listInvites, listRequests, markInvitesSeen, type FriendView } from "@/lib/social/friends";
import { removeFriendAction, respondAction } from "./actions";
import { AddFriendForm } from "./add-friend";

export const metadata: Metadata = { title: "Приятели · Познай песента" };

function Person({ user, children }: { user: FriendView; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Avatar value={user.avatarUrl} name={user.username} size={36} />
      <Link href={`/igrach/${encodeURIComponent(user.username)}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
        {user.username}
        <span className="ml-2 text-xs font-normal text-muted">ниво {user.level}</span>
      </Link>
      {children}
    </li>
  );
}

const small = "rounded-full border border-line px-3 py-1 text-xs hover:bg-surface-strong";

async function Friends() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) redirect("/vhod?next=/priyateli");
  if (!viewer.profile.username) {
    return (
      <div className="card space-y-3 p-6 text-center">
        <p>Избери си име, за да могат приятелите да те намерят.</p>
        <Link href="/profil" className="btn-primary">
          Към профила
        </Link>
      </div>
    );
  }
  const [friends, requests, invites] = await Promise.all([listFriends(viewer.userId), listRequests(viewer.userId), listInvites(viewer.userId)]);
  if (invites.some((i) => !i.seen)) await markInvitesSeen(viewer.userId);

  return (
    <div className="space-y-6">
      {invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">🎉 Покани за игра</h2>
          <ul className="card divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar value={i.from.avatarUrl} name={i.from.username} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{i.from.username} те кани</p>
                  <p className="truncate text-xs text-muted">
                    {i.label} · {i.status === "lobby" ? "чака играчи" : "играе се"}
                  </p>
                </div>
                <Link href={`/staya/${i.code}`} className="btn-primary px-4 py-2 text-sm">
                  Влез
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Добави приятел</h2>
        <p className="text-xs text-muted">
          Твоето име е <strong className="text-foreground">{viewer.profile.username}</strong> — кажи го на приятелите си.
        </p>
        <AddFriendForm />
      </section>

      {requests.incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold">Молби за приятелство</h2>
          <ul className="card divide-y divide-line">
            {requests.incoming.map((r) => (
              <Person key={r.id} user={r.user}>
                <form action={respondAction.bind(null, r.id, true)}>
                  <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
                    Приеми
                  </button>
                </form>
                <form action={respondAction.bind(null, r.id, false)}>
                  <button type="submit" className={small}>
                    Откажи
                  </button>
                </form>
              </Person>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">Приятели ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="card p-6 text-center text-sm text-muted">Още нямаш приятели тук. Добави някого по име!</p>
        ) : (
          <ul className="card divide-y divide-line">
            {friends.map((f) => (
              <Person key={f.userId} user={f}>
                <form action={removeFriendAction.bind(null, f.userId)}>
                  <button type="submit" className={small} aria-label={`Премахни ${f.username}`}>
                    Премахни
                  </button>
                </form>
              </Person>
            ))}
          </ul>
        )}
        {friends.length > 0 && (
          <p className="text-xs text-muted">
            За да поканиш приятели в стая: <Link href="/staya" className="underline">създай стая</Link> → „Покани приятели“.
          </p>
        )}
      </section>

      {requests.outgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">Изпратени молби</h2>
          <ul className="card divide-y divide-line">
            {requests.outgoing.map((r) => (
              <Person key={r.id} user={r.user}>
                <form action={removeFriendAction.bind(null, r.user.userId)}>
                  <button type="submit" className={small}>
                    Оттегли
                  </button>
                </form>
              </Person>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function FriendsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">👫 Приятели</h1>
      <Suspense fallback={<div className="card h-64 animate-pulse" />}>
        <Friends />
      </Suspense>
    </div>
  );
}
