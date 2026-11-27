import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Owner } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";
import { artistStats, MIN_PLAYED_FOR_RANKING, percentileBetter, type ArtistStat, type RoundRow } from "./compute";

function ownerSql(owner: Owner): Prisma.Sql {
  return owner.userId ? Prisma.sql`g.user_id = ${owner.userId}::uuid` : Prisma.sql`g.guest_id = ${owner.guestId}::uuid`;
}

/** Всички приключили рундове на играча (до 20 000 последни). */
export async function loadRounds(owner: Owner): Promise<RoundRow[]> {
  const rows = await prisma.$queryRaw<
    {
      game_id: string;
      game_type: string;
      game_total: number;
      game_finished: Date | null;
      track_id: string | null;
      title: string | null;
      artist_id: string | null;
      artist_name: string | null;
      album_id: string | null;
      album_title: string | null;
      release_year: number | null;
      solved_step: number | null;
      points: number;
      answer_ms: number | null;
      game_score: number | null;
      round_done: boolean;
    }[]
  >`
    SELECT g.id AS game_id, g.game_type, g.total AS game_total, g.finished_at AS game_finished,
           gr.track_id, t.title, gr.artist_id, coalesce(a.name, t.artist_name) AS artist_name,
           t.album_id, al.title AS album_title, t.release_year, gr.solved_step, gr.points, gr.answer_ms,
           g.score AS game_score, (gr.finished_at IS NOT NULL) AS round_done
    FROM game_rounds gr
    JOIN games g ON g.id = gr.game_id
    LEFT JOIN tracks t ON t.id = gr.track_id
    LEFT JOIN artists a ON a.id = gr.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    WHERE ${ownerSql(owner)} AND (g.finished_at IS NOT NULL OR gr.finished_at IS NOT NULL)
    ORDER BY g.created_at DESC
    LIMIT 20000`;
  return rows.map((r) => ({
    gameId: r.game_id,
    gameType: r.game_type,
    gameTotal: r.game_total,
    finishedAt: r.game_finished,
    trackId: r.track_id,
    title: r.title,
    artistId: r.artist_id,
    artistName: r.artist_name,
    albumId: r.album_id,
    albumTitle: r.album_title,
    releaseYear: r.release_year,
    solvedStep: r.solved_step,
    points: r.points,
    answerMs: r.answer_ms,
    gameScore: r.game_score,
    roundDone: r.round_done,
  }));
}

export interface ArtistStatFull extends ArtistStat {
  /** Активни песни на артиста в базата */
  catalog: number;
  /** distinctSolved / catalog, 0–100 */
  coverage: number;
  /** „По-добър си от X% от играчите“ (сред играчите с поне 5 изиграни песни на артиста) */
  betterThan: number | null;
}

/** Статистика по артист + покритие на каталога + сравнение с другите играчи. */
export async function artistStatsFull(owner: Owner, rows: RoundRow[]): Promise<ArtistStatFull[]> {
  const base = artistStats(rows);
  if (base.length === 0) return [];
  const ids = base.map((s) => s.artistId);
  const catalog = new Map(
    (
      await prisma.track.groupBy({
        by: ["artistId"],
        where: { artistId: { in: ids }, isActive: true },
        _count: { _all: true },
      })
    ).map((r) => [r.artistId, r._count._all]),
  );
  const ranked = base.filter((s) => s.played >= MIN_PLAYED_FOR_RANKING).map((s) => s.artistId);
  const others = new Map<string, number[]>();
  if (ranked.length > 0) {
    const me = owner.userId ?? owner.guestId ?? "";
    const rowsOthers = await prisma.$queryRaw<{ artist_id: string; acc: number }[]>`
      SELECT gr.artist_id, avg((gr.solved_step IS NOT NULL)::int)::float * 100 AS acc
      FROM game_rounds gr JOIN games g ON g.id = gr.game_id
      WHERE g.game_type = 'listen' AND gr.artist_id IN (${Prisma.join(ranked)})
        AND coalesce(g.user_id::text, g.guest_id::text) IS NOT NULL
        AND coalesce(g.user_id::text, g.guest_id::text) <> ${me}
        AND (g.finished_at IS NOT NULL OR gr.finished_at IS NOT NULL)
      GROUP BY gr.artist_id, coalesce(g.user_id::text, g.guest_id::text)
      HAVING count(*) >= ${MIN_PLAYED_FOR_RANKING}`;
    for (const r of rowsOthers) {
      const list = others.get(r.artist_id) ?? [];
      list.push(Number(r.acc));
      others.set(r.artist_id, list);
    }
  }
  return base.map((s) => {
    const total = catalog.get(s.artistId) ?? 0;
    return {
      ...s,
      catalog: total,
      coverage: total > 0 ? Math.min(100, Math.round((s.distinctSolved / total) * 100)) : 0,
      betterThan: s.played >= MIN_PLAYED_FOR_RANKING ? percentileBetter(s.accuracy, others.get(s.artistId) ?? []) : null,
    };
  });
}
