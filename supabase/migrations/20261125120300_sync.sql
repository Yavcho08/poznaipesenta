-- Нощна синхронизация на каталога с Deezer (/api/cron/sync-catalog).

create table public.sync_runs (
  id                text primary key default gen_random_uuid()::text,
  -- cron | manual
  trigger           text not null default 'cron',
  -- running | ok | partial | error
  status            text not null default 'running',
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  -- Докъде е стигнала (за продължение на партиди): { "afterArtistId": "..." }
  cursor            jsonb,
  artists_processed integer not null default 0,
  new_tracks        integer not null default 0,
  updated_tracks    integer not null default 0,
  -- [{ artist, message }]
  errors            jsonb not null default '[]'::jsonb
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);

-- Филтри срещу дубликати и нежелани версии (remix, live, karaoke...). Редактират се от админа.
create table public.sync_filters (
  id         text primary key default gen_random_uuid()::text,
  -- Дума/фраза, търсена в заглавието и версията (без значение от главни/малки букви)
  pattern    text not null unique,
  is_active  boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);

insert into public.sync_filters (pattern, note) values
  ('remix', 'ремикси'),
  ('rmx', 'ремикси'),
  ('live', 'концертни записи'),
  ('instrumental', 'без вокал'),
  ('karaoke', 'караоке'),
  ('speed up', 'ускорени версии'),
  ('sped up', 'ускорени версии'),
  ('slowed', 'забавени версии'),
  ('acoustic', 'акустични версии'),
  ('extended', 'удължени версии'),
  ('radio edit', 'радио версии'),
  ('version', 'други версии'),
  ('mix', 'миксове'),
  ('cover', 'кавъри'),
  ('ремикс', 'ремикси'),
  ('караоке', 'караоке')
on conflict (pattern) do nothing;

alter table public.sync_runs enable row level security;
alter table public.sync_filters enable row level security;
