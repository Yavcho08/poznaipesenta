import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { Avatar } from "@/components/avatar";
import { PercentBar } from "@/components/charts";
import { LevelBar } from "@/components/progress-ui";
import { achievementProgress, getStreak } from "@/lib/achievements/server";
import { levelInfo } from "@/lib/achievements/progress";
import { prisma } from "@/lib/prisma";
import { strongWeak } from "@/lib/stats/compute";
import { artistStatsFull, loadRounds } from "@/lib/stats/server";

export async function generateMetadata({ params }: PageProps<"/igrach/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)} · Познай песента` };
}

async function PublicProfile({ params }: PageProps<"/igrach/[username]">) {
  await connection();
  const username = decodeURIComponent((await params).username);
  const profile = await prisma.profile.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
  if (!profile?.username) notFound();
  const owner = { userId: profile.id };
  const [rows, streak, achievements] = await Promise.all([loadRounds(owner), getStreak(owner), achievementProgress(owner)]);
  const artists = await artistStatsFull(owner, rows);
  const { strong } = strongWeak(artists, 5);
  const unlocked = achievements.filter((a) => a.unlockedAt);

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-4">
        <Avatar value={profile.avatarUrl} name={profile.username} size={64} />
        <div>
          <h1 className="font-display text-2xl font-bold">{profile.username}</h1>
          <p className="text-sm text-muted">
            🔥 {streak.current} дни поред · {unlocked.length} постижения · от {profile.createdAt.toLocaleDateString("bg-BG", { month: "long", year: "numeric" })}
          </p>
        </div>
      </header>
      <section className="card p-4">
        <LevelBar info={levelInfo(profile.xp)} />
      </section>
      {strong.length > 0 && (
        <section className="card space-y-3 p-4">
          <h2 className="font-display text-lg font-bold">Познава най-добре</h2>
          {strong.map((a) => (
            <PercentBar key={a.artistId} label={a.name} value={a.accuracy} sub={a.avgSeconds !== null ? `средно от ${a.avgSeconds} сек.` : undefined} />
          ))}
        </section>
      )}
      {unlocked.length > 0 && (
        <section className="card space-y-3 p-4">
          <h2 className="font-display text-lg font-bold">Постижения</h2>
          <ul className="flex flex-wrap gap-2">
            {unlocked.map((a) => (
              <li key={a.code} title={`${a.name} — ${a.description}`} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
                {a.icon} {a.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function PublicProfilePage(props: PageProps<"/igrach/[username]">) {
  return (
    <Suspense fallback={<div className="card h-64 animate-pulse" />}>
      <PublicProfile {...props} />
    </Suspense>
  );
}
