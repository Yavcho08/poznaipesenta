-- Имена за показване (кирилица, когато я имаме) — src/lib/catalog/display-names.ts.
-- Сравнението на отговорите не зависи от тях (нормализира и транслитерира).
alter table public.artists add column display_name text;          -- от админа; null = name
alter table public.tracks
  add column title_override text,                                 -- от админа; има предимство
  add column display_title text,                                  -- изчислено: override или кирилското заглавие на друго издание
  add column display_artist text;                                 -- изчислено: имената на артистите за показване
