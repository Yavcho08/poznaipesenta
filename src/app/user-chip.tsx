import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Avatar } from "@/components/avatar";
import { getViewer } from "@/lib/auth/viewer";
import { levelFromXp } from "@/lib/achievements/progress";
import { NotificationBell } from "./notification-bell";

async function Chip() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/vhod" className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-strong">
        Вход
      </Link>
    );
  }
  const name = viewer.profile.username ?? "Профил";
  return (
    <>
    <NotificationBell userId={viewer.userId} />
    <Link href="/profil" className="flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-surface-strong sm:pr-3" title={name}>
      <span className="relative">
        <Avatar value={viewer.profile.avatarUrl} name={viewer.profile.username ?? viewer.email} size={30} />
        <span
          className="absolute -bottom-1 -right-1.5 rounded-full bg-gradient-to-r from-accent to-accent-2 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-background"
          title="Ниво"
        >
          {levelFromXp(viewer.profile.xp)}
        </span>
      </span>
      <span className="hidden max-w-28 truncate text-sm font-semibold sm:inline">{name}</span>
    </Link>
    </>
  );
}

/** Горе вдясно: „Вход“ или аватарът на влезлия (с бисквитки → динамично, затова в Suspense). */
export function UserChip() {
  return (
    <Suspense fallback={<span className="h-8 w-8 shrink-0 rounded-full bg-surface" aria-hidden />}>
      <Chip />
    </Suspense>
  );
}
