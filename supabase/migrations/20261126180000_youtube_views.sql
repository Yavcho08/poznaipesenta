-- Гледания в YouTube (официалното YouTube Data API) за „Коя е по-популярна?“.
-- Пазим само id на клипа и броя гледания; по правилата на YouTube броят се опреснява (до 30 дни).
alter table public.tracks
  add column youtube_video_id text,
  add column youtube_views bigint,
  -- кога е търсен клип (null = още не); при неуспешно търсене video_id остава null
  add column youtube_checked_at timestamptz,
  -- кога е обновен броят гледания
  add column youtube_views_at timestamptz;

create index tracks_youtube_pending_idx on public.tracks (rank desc) where youtube_checked_at is null and is_active;
