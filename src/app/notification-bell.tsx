"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabaseBrowser } from "@/lib/supabase/browser";

interface Invite {
  id: string;
  code: string;
  label: string;
  seen: boolean;
  from: { username: string };
}

interface Notifications {
  requests: number;
  invites: Invite[];
}

const POLL_MS = 45_000;

/** Звънче в хедъра: молби за приятелство + покани за стая (Realtime сигнал + рядко питане). */
export function NotificationBell({ userId }: { userId: string }) {
  const [data, setData] = useState<Notifications>({ requests: 0, invites: [] });
  const [toast, setToast] = useState<Invite | null>(null);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/me/notifications", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const next = (await res.json()) as Notifications;
        // Невидяна покана (и при отваряне на сайта) → известие на екрана, после се маркира като видяна.
        const shown = (known.current ??= new Set());
        const fresh = next.invites.find((i) => !i.seen && !shown.has(i.id));
        for (const i of next.invites) shown.add(i.id);
        if (fresh) {
          setToast(fresh);
          void fetch("/api/me/notifications", { method: "POST" }).catch(() => undefined);
        }
        setData(next);
      } catch {
        // без мрежа — следващия път
      }
    };
    void load();
    const timer = setInterval(load, POLL_MS);
    let cleanup: (() => void) | null = null;
    try {
      const supabase = supabaseBrowser();
      const channel = supabase
        .channel(`user:${userId}`)
        .on("broadcast", { event: "notify" }, () => void load())
        .subscribe();
      cleanup = () => void supabase.removeChannel(channel);
    } catch {
      // Supabase не е настроен — само питане
    }
    return () => {
      stopped = true;
      clearInterval(timer);
      cleanup?.();
    };
  }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12_000);
    return () => clearTimeout(t);
  }, [toast]);

  const count = data.requests + data.invites.filter((i) => !i.seen).length;

  return (
    <>
      <Link
        href="/priyateli"
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-surface-strong"
        aria-label={count ? `Приятели — ${count} нови` : "Приятели"}
        title="Приятели и покани"
      >
        <span aria-hidden>👫</span>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
      {toast &&
        // Портал: хедърът има backdrop-filter и иначе fixed би било спрямо него, не спрямо екрана.
        createPortal(
        <div className="fixed inset-x-0 top-20 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <div className="animate-rise flex w-full max-w-sm items-center gap-3 rounded-2xl border border-accent/50 bg-popup/95 px-4 py-3 shadow-2xl shadow-accent/30 backdrop-blur">
            <span className="text-2xl" aria-hidden>
              🎉
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.from.username} те кани в стая</p>
              <p className="truncate text-xs text-muted">{toast.label}</p>
            </div>
            <Link href={`/staya/${toast.code}`} onClick={() => setToast(null)} className="btn-primary px-4 py-2 text-sm">
              Влез
            </Link>
            <button type="button" onClick={() => setToast(null)} className="text-muted" aria-label="Затвори">
              ×
            </button>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
