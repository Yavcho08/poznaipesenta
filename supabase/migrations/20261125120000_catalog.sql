-- Каталог: артисти, жанрове, албуми, песни, плейлисти.
--
-- Звук НЕ се пази: само deezer_id. Preview URL-ът е подписан и изтича — взима се свеж
-- от Deezer през /api/audio/... при старт на рунд. Песен без preview → is_active = false.
--
-- ID-тата са text (старите са cuid от Prisma; новите идват от Prisma или от gen_random_uuid()).
-- Deezer ID-тата са text, защото надхвърлят int32.

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --- Артисти и жанрове ---

create table public.artists (
  id          text primary key default gen_random_uuid()::text,
  deezer_id   text unique,
  name        text not null,
  name_latin  text,
  image_url   text,
  is_pop_folk boolean not null default false,
  -- Скрит артист не участва в игри и в нощната синхронизация.
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.genres (
  id   text primary key default gen_random_uuid()::text,
  slug text not null unique,
  name text not null
);

create table public.artist_genres (
  artist_id text not null references public.artists (id) on delete cascade,
  genre_id  text not null references public.genres (id) on delete cascade,
  primary key (artist_id, genre_id)
);
create index artist_genres_genre_idx on public.artist_genres (genre_id);

-- --- Албуми ---

create table public.albums (
  id            text primary key default gen_random_uuid()::text,
  deezer_id     text not null unique,
  artist_id     text references public.artists (id) on delete set null,
  title         text not null,
  cover_url     text,
  -- Датата от Deezer. Често е на преиздаване/компилация, затова игрите с години ползват
  -- tracks.release_year (най-ранната известна година), а date_verified = ръчно потвърдена.
  release_date  date,
  -- album | single | ep | compile
  record_type   text,
  date_verified boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index albums_artist_idx on public.albums (artist_id);

-- --- Песни ---

create table public.tracks (
  id                 text primary key default gen_random_uuid()::text,
  deezer_id          text not null unique,
  isrc               text,
  title              text not null,
  -- Основният артист, както го дава Deezer (за показване и проверка на отговора).
  artist_name        text not null,
  artist_id          text references public.artists (id) on delete set null,
  album_id           text references public.albums (id) on delete set null,
  album_cover        text,
  -- Датата на албума в Deezer (сурова).
  release_date       date,
  -- Най-добрата оценка за годината на излизане: най-ранното от датата на албума,
  -- годината в ISRC и другите версии на същата песен в базата.
  release_year       integer,
  rank               integer not null default 0,
  -- Дължина на пълната песен (сек.).
  duration           integer,
  -- looseKey(title) + looseKey(artist_name) — търсене без значение от азбуката.
  search_key         text not null default '',
  -- Секундата в откъса, от която започват клиповете (припевът); null = още не е изчислена.
  hook_start         double precision,
  is_active          boolean not null default true,
  -- no_preview | hidden | duplicate
  deactivated_reason text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index tracks_isrc_idx on public.tracks (isrc);
create index tracks_artist_idx on public.tracks (artist_id);
create index tracks_album_idx on public.tracks (album_id);
create index tracks_created_idx on public.tracks (created_at desc);

-- Всички изпълнители на песента (дуети, feat.). artist_id е попълнен, ако артистът е в базата.
create table public.track_artists (
  track_id         text not null references public.tracks (id) on delete cascade,
  deezer_artist_id text not null,
  artist_id        text references public.artists (id) on delete set null,
  name             text not null,
  -- main | featured
  role             text not null default 'main',
  position         integer not null default 0,
  primary key (track_id, deezer_artist_id)
);
create index track_artists_artist_idx on public.track_artists (artist_id);

-- --- Плейлисти ---

create type public.playlist_source as enum ('curated', 'deezer', 'spotify');

create table public.playlists (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  description  text,
  source       public.playlist_source not null,
  -- ID в Deezer/Spotify; null за curated.
  external_id  text,
  -- Секция на началния екран, напр. 'pop-folk' за десетилетията в поп-фолка.
  category     text,
  sort_order   integer not null default 0,
  -- Брой песни в източника (за „42/50 песни са готови за игра“).
  source_total integer,
  -- Кой го е внесъл (null = общ/curated). Колоната е без FK, за да не зависи каталогът от профилите.
  owner_id     uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source, external_id)
);

create table public.playlist_tracks (
  playlist_id text not null references public.playlists (id) on delete cascade,
  track_id    text not null references public.tracks (id) on delete cascade,
  position    integer not null,
  primary key (playlist_id, track_id)
);
create index playlist_tracks_order_idx on public.playlist_tracks (playlist_id, position);
create index playlist_tracks_track_idx on public.playlist_tracks (track_id);

create trigger artists_updated_at before update on public.artists for each row execute function public.set_updated_at();
create trigger albums_updated_at before update on public.albums for each row execute function public.set_updated_at();
create trigger tracks_updated_at before update on public.tracks for each row execute function public.set_updated_at();
create trigger playlists_updated_at before update on public.playlists for each row execute function public.set_updated_at();

-- --- RLS ---
-- Приложението пише само от сървъра (роля postgres, заобикаля RLS).
-- Каталогът е публичен за четене; записи през Data API няма.

alter table public.artists enable row level security;
alter table public.genres enable row level security;
alter table public.artist_genres enable row level security;
alter table public.albums enable row level security;
alter table public.tracks enable row level security;
alter table public.track_artists enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

create policy "Каталог: четене за всички" on public.artists for select to anon, authenticated using (is_active);
create policy "Каталог: четене за всички" on public.genres for select to anon, authenticated using (true);
create policy "Каталог: четене за всички" on public.artist_genres for select to anon, authenticated using (true);
create policy "Каталог: четене за всички" on public.albums for select to anon, authenticated using (true);
create policy "Каталог: четене за всички" on public.tracks for select to anon, authenticated using (is_active);
create policy "Каталог: четене за всички" on public.track_artists for select to anon, authenticated using (true);
create policy "Общи плейлисти: четене за всички" on public.playlists for select to anon, authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy "Песни в достъпни плейлисти" on public.playlist_tracks for select to anon, authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_id and (p.owner_id is null or p.owner_id = (select auth.uid()))
  ));
