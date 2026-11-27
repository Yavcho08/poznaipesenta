-- Името на артиста се редактира направо (artists.name; съпоставянето е по deezer_id) — отделна колона не е нужна.
alter table public.artists drop column display_name;
