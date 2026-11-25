import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ownerWhere, type Owner } from "@/lib/auth/viewer";
import { todayInSofia } from "@/lib/game/daily-shared";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS, type PlayerStats } from "./definitions";
import { ACHIEVEMENT_XP, computeStreak, gameXp, levelInfo, type LevelInfo, type Streak } from "./progress";

function ownerSql(owner: Owner): Prisma.Sql {
  return owner.userId ? Prisma.sql`g.user_id = ${owner.userId}::uuid` : Prisma.sql`g.guest_id = ${owner.guestId}::uuid`;
}

const num = (v: unknown): number => (typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : Number(v ?? 0) || 0);

/** Дати (YYYY-MM-DD) с довършено дневно предизвикателство (която и да е игра). */
async function dailyDates(owner: Owner): Promise<string[]> {
  const rows = await prisma.game.findMany({
    where: { ...ownerWhere(owner), mode: "daily", finishedAt: { not: null } },
    select: { sourceRef: true },
    distinct: ["sourceRef"],
  });
  return rows.flatMap((r) => (r.sourceRef ? [r.sourceRef] : []));
}

export async function getStreak(owner: Owner): Promise<Streak> {
  return computeStreak(await dailyDates(owner), todayInSofia());
}

export async function playerStats(owner: Owner): Promise<PlayerStats> {
  const who = ownerSql(owner);
  const [listen] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      count(*) FILTER (WHERE gr.solved_step IS NOT NULL)::int AS solved,
      count(*) FILTER (WHERE gr.solved_step = 0)::int AS flash,
      count(*) FILTER (WHERE gr.solved_step IS NOT NULL AND t.release_year BETWEEN 1990 AND 2009)::int AS retro,
      count(*) FILTER (WHERE gr.solved_step IS NOT NULL AND t.release_year >= 2020)::int AS fresh
    FROM game_rounds gr
    JOIN games g ON g.id = gr.game_id
    LEFT JOIN tracks t ON t.id = gr.track_id
    WHERE ${who} AND g.game_type = 'listen'`;

  const [games] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      count(*)::int AS finished,
      coalesce(array_agg(DISTINCT g.game_type), '{}') AS types,
      coalesce(sum(g.total), 0)::int AS points,
      count(*) FILTER (WHERE g.mode = 'daily')::int AS daily,
      count(*) FILTER (WHERE extract(hour FROM g.finished_at AT TIME ZONE 'Europe/Sofia') < 5)::int AS night,
      count(*) FILTER (WHERE extract(hour FROM g.finished_at AT TIME ZONE 'Europe/Sofia') IN (5, 6))::int AS early
    FROM games g
    WHERE ${who} AND g.finished_at IS NOT NULL`;

  const [perfect] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      count(*) FILTER (WHERE s.solved = s.rounds AND s.rounds >= 10)::int AS games,
      count(*) FILTER (WHERE s.solved = s.rounds AND s.rounds >= 10 AND s.mode = 'daily')::int AS daily
    FROM (
      SELECT g.id, g.mode, count(gr.*) AS rounds, count(gr.*) FILTER (WHERE gr.solved_step IS NOT NULL) AS solved
      FROM games g JOIN game_rounds gr ON gr.game_id = g.id
      WHERE ${who} AND g.game_type = 'listen' AND g.finished_at IS NOT NULL
      GROUP BY g.id, g.mode
    ) s`;

  const [expert] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT coalesce(max(acc), 0)::float AS acc FROM (
      SELECT avg((gr.solved_step IS NOT NULL)::int) AS acc
      FROM game_rounds gr JOIN games g ON g.id = gr.game_id
      WHERE ${who} AND g.game_type = 'listen' AND gr.artist_id IS NOT NULL AND gr.finished_at IS NOT NULL
      GROUP BY gr.artist_id HAVING count(*) >= 50
    ) a`;

  const [quiz] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      count(DISTINCT gr.album_id) FILTER (WHERE g.game_type IN ('cover', 'album') AND gr.points > 0)::int AS albums,
      count(*) FILTER (WHERE g.game_type = 'cover' AND gr.solved_step = 0)::int AS cover1,
      count(*) FILTER (WHERE g.game_type = 'year' AND gr.points = 100)::int AS year_exact,
      count(*) FILTER (WHERE g.game_type = 'order' AND gr.points = 100)::int AS order_perfect,
      count(*) FILTER (WHERE g.game_type = 'singer' AND gr.points > 0)::int AS singer,
      count(*) FILTER (WHERE g.game_type = 'word' AND gr.points > 0)::int AS word
    FROM game_rounds gr JOIN games g ON g.id = gr.game_id
    WHERE ${who} AND g.game_type <> 'listen'`;

  const [pair] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT coalesce(max(c), 0)::int AS best FROM (
      SELECT count(*) FILTER (WHERE gr.points > 0) AS c
      FROM games g JOIN game_rounds gr ON gr.game_id = g.id
      WHERE ${who} AND g.game_type IN ('newer', 'higher')
      GROUP BY g.id
    ) p`;

  let roomGames = 0;
  let roomWins = 0;
  if (owner.userId) {
    const [rooms] = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        count(*)::int AS played,
        count(*) FILTER (WHERE rp.score > 0 AND rp.score = (SELECT max(o.score) FROM room_players o WHERE o.room_id = rp.room_id))::int AS wins
      FROM room_players rp JOIN rooms r ON r.id = rp.room_id
      WHERE rp.user_id = ${owner.userId}::uuid AND r.status = 'finished'`;
    roomGames = num(rooms?.played);
    roomWins = num(rooms?.wins);
  }

  const streak = computeStreak(await dailyDates(owner), todayInSofia());
  return {
    songsSolved: num(listen?.solved),
    flash: num(listen?.flash),
    retroSolved: num(listen?.retro),
    newSolved: num(listen?.fresh),
    gamesFinished: num(games?.finished),
    gameTypes: Array.isArray(games?.types) ? (games.types as string[]) : [],
    perfectGames: num(perfect?.games),
    perfectDaily: num(perfect?.daily),
    dailyGames: num(games?.daily),
    streakBest: streak.best,
    nightGames: num(games?.night),
    earlyGames: num(games?.early),
    totalPoints: num(games?.points),
    expertAccuracy: num(expert?.acc),
    albumsCollected: num(quiz?.albums),
    coverFirstStep: num(quiz?.cover1),
    yearExact: num(quiz?.year_exact),
    orderPerfect: num(quiz?.order_perfect),
    pairStreakBest: num(pair?.best),
    singerCorrect: num(quiz?.singer),
    wordCorrect: num(quiz?.word),
    roomGames,
    roomWins,
  };
}

// --- Постижения ---

const globalForSeed = globalThis as unknown as { __achievementsSeeded?: boolean };

/** Записва дефинициите в таблицата achievements (веднъж на процес). */
async function ensureAchievementRows(): Promise<void> {
  if (globalForSeed.__achievementsSeeded) return;
  await prisma.$transaction(
    ACHIEVEMENTS.map((a, i) =>
      prisma.achievement.upsert({
        where: { code: a.code },
        update: { name: a.name, description: a.description, icon: a.icon, target: a.target, sortOrder: i, isSecret: a.secret ?? false },
        create: { code: a.code, name: a.name, description: a.description, icon: a.icon, target: a.target, sortOrder: i, isSecret: a.secret ?? false },
      }),
    ),
  );
  globalForSeed.__achievementsSeeded = true;
}

export interface UnlockedAchievement {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface AchievementProgress extends UnlockedAchievement {
  target: number;
  progress: number;
  unlockedAt: Date | null;
}

/**
 * Пресмята прогреса на всички постижения, записва го и връща НОВООТКЛЮЧЕНИТЕ.
 * Вика се на сървъра след всяка довършена игра. Обновява и кеша profiles.xp.
 */
export async function evaluateAchievements(owner: Owner): Promise<UnlockedAchievement[]> {
  await ensureAchievementRows();
  const stats = await playerStats(owner);
  const where = ownerWhere(owner);
  const existing = new Map((await prisma.userAchievement.findMany({ where })).map((a) => [a.achievementCode, a]));
  const now = new Date();
  const unlocked: UnlockedAchievement[] = [];
  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const def of ACHIEVEMENTS) {
    const progress = Math.min(def.progress(stats), def.target);
    const row = existing.get(def.code);
    const done = progress >= def.target;
    if (!row) {
      if (progress === 0) continue;
      writes.push(prisma.userAchievement.create({ data: { ...where, achievementCode: def.code, progress, unlockedAt: done ? now : null } }));
    } else if (row.progress !== progress || (done && !row.unlockedAt)) {
      writes.push(
        prisma.userAchievement.update({
          where: { id: row.id },
          data: { progress, ...(done && !row.unlockedAt && { unlockedAt: now }) },
        }),
      );
    }
    if (done && !row?.unlockedAt) unlocked.push({ code: def.code, name: def.name, description: def.description, icon: def.icon });
  }
  if (writes.length) await prisma.$transaction(writes);
  if (owner.userId) await refreshXp(owner.userId);
  return unlocked;
}

/** XP = точките от игрите + бонуси за довършване/дневно + 100 за всяко постижение. */
export async function computeXp(owner: Owner): Promise<number> {
  const where = ownerWhere(owner);
  const [games, unlocked] = await Promise.all([
    prisma.game.findMany({ where: { ...where, finishedAt: { not: null } }, select: { total: true, mode: true } }),
    prisma.userAchievement.count({ where: { ...where, unlockedAt: { not: null } } }),
  ]);
  return games.reduce((sum, g) => sum + gameXp(g.total, g.mode === "daily"), 0) + unlocked * ACHIEVEMENT_XP;
}

async function refreshXp(userId: string): Promise<number> {
  const xp = await computeXp({ userId });
  await prisma.profile.update({ where: { id: userId }, data: { xp } });
  return xp;
}

export async function getLevel(owner: Owner): Promise<LevelInfo> {
  return levelInfo(await computeXp(owner));
}

/** Всички постижения с прогреса на играча (за профила). */
export async function achievementProgress(owner: Owner): Promise<AchievementProgress[]> {
  const rows = new Map((await prisma.userAchievement.findMany({ where: ownerWhere(owner) })).map((a) => [a.achievementCode, a]));
  return ACHIEVEMENTS.map((def) => {
    const row = rows.get(def.code);
    return {
      code: def.code,
      name: def.name,
      description: def.description,
      icon: def.icon,
      target: def.target,
      progress: row?.progress ?? 0,
      unlockedAt: row?.unlockedAt ?? null,
    };
  });
}

/** След довършена игра: отключване на постижения за собственика ѝ (тихо при грешка — не спира играта). */
export async function afterGameFinished(gameId: string): Promise<UnlockedAchievement[]> {
  try {
    const game = await prisma.game.findUnique({ where: { id: gameId }, select: { userId: true, guestId: true } });
    const owner: Owner | null = game?.userId ? { userId: game.userId } : game?.guestId ? { guestId: game.guestId } : null;
    return owner ? await evaluateAchievements(owner) : [];
  } catch (error) {
    console.error("achievements", error);
    return [];
  }
}
