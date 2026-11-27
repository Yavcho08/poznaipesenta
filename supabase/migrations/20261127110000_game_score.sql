-- Нормализирани точки за класацията (src/lib/game/score.ts): най-много 1000 на игра във всеки режим.
-- Серия (newer/higher): 100 за верен отговор, таван 1000. Останалите: total / (рундове × 100) × 1000.
alter table public.games add column score integer;

with r as (
  select game_id, count(*) as rounds, count(*) filter (where points > 0) as correct
  from public.game_rounds group by game_id
)
update public.games g set score = case
    when g.game_type in ('newer', 'higher') then least(1000, r.correct * 100)
    else greatest(0, least(1000, round(g.total * 1000.0 / nullif(r.rounds * 100, 0))))
  end
from r
where r.game_id = g.id and g.finished_at is not null;

create index games_score_week_idx on public.games (finished_at desc) where score is not null and user_id is not null;
