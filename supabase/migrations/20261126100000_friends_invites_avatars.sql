-- Приятели, покани за стая и снимки за аватар.
-- Всичко се пише само от сървъра; през Data API потребителят може да чете само своите редове.

create table public.friendships (
  id           text primary key default gen_random_uuid()::text,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  -- pending | accepted (отказаната покана се трие)
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id, status);

create table public.room_invites (
  id           text primary key default gen_random_uuid()::text,
  room_id      text not null references public.rooms (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  seen_at      timestamptz,
  unique (room_id, to_user_id)
);
create index room_invites_to_idx on public.room_invites (to_user_id, created_at desc);

alter table public.friendships enable row level security;
alter table public.room_invites enable row level security;

create policy "Приятелства: само свои" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Покани: само свои" on public.room_invites for select to authenticated
  using ((select auth.uid()) in (from_user_id, to_user_id));

-- Публично хранилище за снимки на аватари (качва само сървърът; ≤ 2 MB, само изображения).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
