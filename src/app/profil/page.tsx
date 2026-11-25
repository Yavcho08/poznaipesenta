import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Avatar } from "@/components/avatar";
import { getViewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";
import { signOutAction } from "@/app/vhod/actions";
import { AvatarPicker, DeleteAccount, UsernameForm } from "./forms";
import { achievementProgress, evaluateAchievements, getLevel, getStreak } from "@/lib/achievements/server";
import { AchievementGrid, LevelBar, StreakBadge } from "@/components/progress-ui";
import Link from "next/link";

export const metadata = { title: "Профил · Познай песента" };

async function Profile() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) redirect("/vhod?next=/profil");
  const { profile } = viewer;
  const owner = { userId: viewer.userId };
  // Догонва прогреса (напр. след прехвърляне от гост или игра в стая).
  await evaluateAchievements(owner).catch(() => []);
  const [level, streak, achievements, games, best] = await Promise.all([
    getLevel(owner),
    getStreak(owner),
    achievementProgress(owner),
    prisma.game.count({ where: { userId: viewer.userId, finishedAt: { not: null } } }),
    prisma.game.aggregate({ where: { userId: viewer.userId, finishedAt: { not: null } }, _max: { total: true }, _sum: { total: true } }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar value={profile.avatarUrl} name={profile.username ?? viewer.email} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">{profile.username ?? "Без име"}</h1>
          <p className="truncate text-sm text-muted">{viewer.email}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {profile.role === "admin" && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">админ</span>}
            <Link href="/priyateli" className="rounded-full border border-line px-2 py-0.5 text-xs hover:bg-surface-strong">
              👫 Приятели
            </Link>
          </div>
        </div>
      </header>

      <section id="redaktirai" className="card space-y-4 p-4">
        <h2 className="font-display text-lg font-bold">✏️ Име и аватар</h2>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Име в играта</h3>
          <UsernameForm current={profile.username} />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Аватар</h3>
          <AvatarPicker current={profile.avatarUrl} />
        </div>
      </section>


      <section className="card p-4">
        <LevelBar info={level} />
      </section>

      <StreakBadge streak={streak} />

      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Игри" value={games} />
        <Stat label="Точки общо" value={best._sum.total ?? 0} />
        <Stat label="Най-добра игра" value={best._max.total ?? 0} />
      </section>

      {!profile.username && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
          Избери си име — с него влизаш в класациите и в стаите с приятели.
        </p>
      )}

      <Link href="/statistiki" className="btn-ghost w-full">
        📊 Моите статистики
      </Link>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">Постижения</h2>
        <AchievementGrid items={achievements} />
      </section>



      <section className="flex flex-wrap gap-3">
        <form action={signOutAction}>
          <button type="submit" className="btn-ghost">
            Изход
          </button>
        </form>
      </section>

      <section className="card space-y-3 border-red-500/30 p-4">
        <h2 className="font-semibold text-red-200">Изтриване на акаунта</h2>
        <p className="text-sm text-muted">Изтрива профила, игрите, точките и постиженията ти завинаги. Не може да се върне.</p>
        <DeleteAccount />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3">
      <div className="font-display text-xl font-bold">{value.toLocaleString("bg-BG")}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <Profile />
    </Suspense>
  );
}
