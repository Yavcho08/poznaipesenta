-- Играчи (профили и гости), игри, рундове, постижения, дневни предизвикателства.
--
-- Логиката и точките са само на сървъра. През Data API потребителят може да ЧЕТЕ свои неща
-- (профил, приключили игри, постижения) — никога да пише и никога да вижда рунд, който още играе
-- (иначе би видял отговора).

-- --- Профили ---

create table public.profiles (
  -- = auth.users.id. Без FK (Prisma не допуска връзки към схемата auth) — изтриването
  -- на потребител трие профила чрез тригера on_auth_user_deleted по-долу.
  id         uuid primary key,
  -- Уникално без значение от главни/малки букви (индексът по-долу). null = още не е избрано.
  username   text,
  avatar_url text,
  -- user | admin
  role       text not null default 'user' check (role in ('user', 'admin')),
  xp         integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_auth_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_auth_user_deleted();

-- Гост: uuid, генериран в браузъра (localStorage). При вход прогресът му минава към профила.
create table public.guests (
  id           uuid primary key,
  merged_into  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- --- Игри ---

create table public.games (
  id             text primary key default gen_random_uuid()::text,
  -- Играч: профил ИЛИ гост (или никой — стари игри отпреди профилите).
  user_id        uuid references public.profiles (id) on delete cascade,
  guest_id       uuid references public.guests (id) on delete cascade,
  -- listen | cover | newer | higher | year | order | album | singer | word
  game_type      text not null default 'listen',
  -- free | daily | challenge
  mode           text not null default 'free',
  -- Източникът на песните: popfolk | genre | artists | playlist | daily | challenge
  source_type    text,
  -- JSON на източника (free), дата YYYY-MM-DD (daily) или код (challenge)
  source_ref     text,
  -- Име за класацията на гост (за профил се ползва username).
  player_name    text,
  total          integer not null default 0,
  -- „Предизвикай приятел“: код за линка (не самото id — иначе приятелят би видял отговорите).
  challenge_code text unique,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  check (user_id is null or guest_id is null)
);
create index games_user_idx on public.games (user_id, finished_at);
create index games_guest_idx on public.games (guest_id);
create index games_finished_idx on public.games (finished_at);
create index games_source_idx on public.games (source_type, source_ref);

create table public.game_rounds (
  id          text primary key default gen_random_uuid()::text,
  game_id     text not null references public.games (id) on delete cascade,
  -- Пореден номер (0–9)
  index       integer not null,
  -- Обектът на въпроса (за игрите без слушане някои са null)
  track_id    text references public.tracks (id),
  album_id    text references public.albums (id),
  artist_id   text references public.artists (id) on delete set null,
  -- Данни за въпроса при игрите без слушане (варианти, двойка песни и т.н.)
  question    jsonb,
  -- Опити: [{ step, kind: "guess" | "skip", title?, artist?, deezerId?, correct? }]
  attempts    jsonb not null default '[]'::jsonb,
  -- Стъпка (0–4 → 0.2/1/2/5/10 сек), на която е познато; null = не е познато.
  solved_step integer,
  points      integer not null default 0,
  -- От пускането на рунда до верния отговор / края (ms)
  answer_ms   integer,
  started_at  timestamptz,
  finished_at timestamptz,
  unique (game_id, index)
);
create index game_rounds_track_idx on public.game_rounds (track_id);
create index game_rounds_artist_idx on public.game_rounds (artist_id);

-- --- Постижения ---

create table public.achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  icon        text not null,
  -- Нужен прогрес за отключване (1 = еднократно събитие)
  target      integer not null default 1,
  sort_order  integer not null default 0,
  is_secret   boolean not null default false
);

create table public.user_achievements (
  id               text primary key default gen_random_uuid()::text,
  user_id          uuid references public.profiles (id) on delete cascade,
  guest_id         uuid references public.guests (id) on delete cascade,
  achievement_code text not null references public.achievements (code) on delete cascade,
  progress         integer not null default 0,
  unlocked_at      timestamptz,
  updated_at       timestamptz not null default now(),
  check ((user_id is null) <> (guest_id is null)),
  unique (user_id, achievement_code),
  unique (guest_id, achievement_code)
);
create trigger user_achievements_updated_at before update on public.user_achievements for each row execute function public.set_updated_at();

-- --- Дневно предизвикателство ---

create table public.daily_challenges (
  -- YYYY-MM-DD по българско време
  date       text not null,
  game_type  text not null default 'listen',
  -- Подредени tracks.id — едни и същи за всички през деня
  track_ids  jsonb not null,
  -- Допълнителни данни за игрите без слушане
  payload    jsonb,
  created_at timestamptz not null default now(),
  primary key (date, game_type)
);

-- --- RLS ---

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.games enable row level security;
alter table public.game_rounds enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
-- Дневните песни НЕ са публични (иначе отговорите за деня се виждат) — без политика.
alter table public.daily_challenges enable row level security;

create policy "Профили: публично четене" on public.profiles for select to anon, authenticated using (true);
create policy "Постижения: публично четене" on public.achievements for select to anon, authenticated using (true);
create policy "Игри: само свои" on public.games for select to authenticated using (user_id = (select auth.uid()));
create policy "Рундове: само от свои приключили игри" on public.game_rounds for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and g.user_id = (select auth.uid()) and g.finished_at is not null
  ));
create policy "Постижения на играча: само свои" on public.user_achievements for select to authenticated
  using (user_id = (select auth.uid()));
-- guests: без политики (само сървърът).
