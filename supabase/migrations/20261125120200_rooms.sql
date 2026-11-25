-- Мултиплейър стаи. Времевата линия на рунда се изчислява от round_start_at
-- (src/lib/room/timeline.ts), затова не са нужни фонови задачи.
-- Всичко минава през сървъра: таблиците са без политики (RLS отказва всичко през Data API),
-- защото текущият рунд издава песента.

create table public.rooms (
  id             text primary key default gen_random_uuid()::text,
  -- 6 символа, без лесни за бъркане (0/O, 1/I)
  code           text not null unique,
  -- lobby | playing | finished
  status         text not null default 'lobby',
  -- JSON на GameSource
  source         text not null,
  label          text not null,
  round_index    integer not null default -1,
  -- Кога започва откъсът на стъпка 0 в текущия рунд
  round_start_at timestamptz,
  -- Ранен край (всички са готови); иначе краят се изчислява от времевата линия
  round_end_at   timestamptz,
  host_id        text,
  -- Код на стаята-реванш
  next_code      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger rooms_updated_at before update on public.rooms for each row execute function public.set_updated_at();

create table public.room_players (
  id           text primary key default gen_random_uuid()::text,
  room_id      text not null references public.rooms (id) on delete cascade,
  -- Влязъл потребител (по желание)
  user_id      uuid references public.profiles (id) on delete set null,
  name         text not null,
  -- Тайна на играча (в localStorage); с нея се правят ходовете
  token        text not null unique,
  score        integer not null default 0,
  last_seen_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),
  unique (room_id, name)
);

create table public.room_rounds (
  room_id  text not null references public.rooms (id) on delete cascade,
  index    integer not null,
  track_id text not null references public.tracks (id),
  primary key (room_id, index)
);

create table public.room_guesses (
  id          text primary key default gen_random_uuid()::text,
  room_id     text not null references public.rooms (id) on delete cascade,
  player_id   text not null references public.room_players (id) on delete cascade,
  round_index integer not null,
  -- Стъпката (0–4) — всеки играч си минава стъпките сам
  step        integer not null,
  -- guess | skip (при skip deezer_id/title/artist са празни)
  kind        text not null default 'guess',
  deezer_id   text not null,
  title       text not null,
  artist      text not null,
  correct     boolean not null,
  points      integer not null,
  created_at  timestamptz not null default now(),
  unique (player_id, round_index, step)
);
create index room_guesses_round_idx on public.room_guesses (room_id, round_index);

-- Емоджи реакции (пазят се за кратко)
create table public.room_reactions (
  id         text primary key default gen_random_uuid()::text,
  room_id    text not null references public.rooms (id) on delete cascade,
  player_id  text not null references public.room_players (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now()
);
create index room_reactions_recent_idx on public.room_reactions (room_id, created_at);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_rounds enable row level security;
alter table public.room_guesses enable row level security;
alter table public.room_reactions enable row level security;
