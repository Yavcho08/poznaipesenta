-- Година на излизане: най-ранната между всички издания (src/lib/catalog/years-recompute.ts).
-- year_reliable = поне едно издание има година от ISRC (датите в Deezer често са на преиздаване).
alter table public.tracks add column year_reliable boolean not null default false;
-- Година на албума = най-ранната година на песните в него (Deezer дава датата на преиздаването).
alter table public.albums add column release_year integer;
