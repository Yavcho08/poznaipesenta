"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";

interface Friend {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
}

/** „Покани приятели“ в лобито на стаята — поканата пристига на приятеля като известие. */
export function InviteFriends({ code, playerNames }: { code: string; playerNames: string[] }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [loggedIn, setLoggedIn] = useState(true);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/friends", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setLoggedIn(false);
          setFriends([]);
          return;
        }
        const body = (await res.json()) as { friends?: Friend[] };
        setFriends(body.friends ?? []);
      })
      .catch(() => !cancelled && setFriends([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const invite = async (friend: Friend) => {
    setBusy(friend.userId);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendIds: [friend.userId] }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Поканата не беше изпратена");
      }
      setInvited((s) => new Set(s).add(friend.userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка");
    } finally {
      setBusy(null);
    }
  };

  if (friends === null) return null;
  if (!loggedIn) {
    return (
      <p className="text-xs text-muted">
        <Link href={`/vhod?next=/staya/${code}`} className="underline">
          Влез
        </Link>
        , за да каниш приятелите си с едно докосване.
      </p>
    );
  }
  if (friends.length === 0) {
    return (
      <p className="text-xs text-muted">
        Добави приятели в{" "}
        <Link href="/priyateli" className="underline">
          Приятели
        </Link>
        , за да ги каниш направо в стаята.
      </p>
    );
  }
  const inRoom = new Set(playerNames.map((n) => n.toLocaleLowerCase("bg")));
  return (
    <div className="space-y-2 text-left">
      <p className="text-center text-sm font-semibold">Покани приятели</p>
      <ul className="space-y-1.5">
        {friends.map((f) => {
          const here = inRoom.has(f.username.toLocaleLowerCase("bg"));
          const done = invited.has(f.userId);
          return (
            <li key={f.userId} className="flex items-center gap-3 rounded-xl bg-surface-strong px-3 py-2">
              <Avatar value={f.avatarUrl} name={f.username} size={30} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.username}</span>
              {here ? (
                <span className="text-xs text-emerald-300">в стаята ✓</span>
              ) : (
                <button
                  type="button"
                  onClick={() => invite(f)}
                  disabled={busy !== null || done}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${done ? "text-emerald-300" : "bg-gradient-to-r from-accent to-accent-2 text-white"}`}
                >
                  {done ? "Поканен ✓" : busy === f.userId ? "…" : "Покани"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="text-center text-xs text-red-300">{error}</p>}
    </div>
  );
}
