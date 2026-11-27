-- Внесените плейлисти са лични: вижда ги само собственикът (и стаите, които той създава).
-- Официални = без собственик и куратирани (или с категория, зададена от админа).

-- Един и същ плейлист от Spotify/Deezer може да е внесен от няколко души — уникален е за собственика.
alter table public.playlists drop constraint playlists_source_external_id_key;
alter table public.playlists add constraint playlists_source_external_owner_key unique (source, external_id, owner_id);

drop policy "Общи плейлисти: четене за всички" on public.playlists;
create policy "Плейлисти: официалните и своите" on public.playlists for select to anon, authenticated
  using (owner_id = (select auth.uid()) or (owner_id is null and (source = 'curated' or category is not null)));

drop policy "Песни в достъпни плейлисти" on public.playlist_tracks;
create policy "Песни в достъпни плейлисти" on public.playlist_tracks for select to anon, authenticated
  using (exists (
    select 1 from public.playlists p
    where p.id = playlist_id
      and (p.owner_id = (select auth.uid()) or (p.owner_id is null and (p.source = 'curated' or p.category is not null)))
  ));
