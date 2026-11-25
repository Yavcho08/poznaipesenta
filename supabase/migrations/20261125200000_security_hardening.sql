-- Препоръки от Supabase Security Advisor.

-- Фиксиран search_path (иначе функцията може да се подведе с обект от друга схема).
alter function public.set_updated_at() set search_path = '';

-- Тригер-функцията (SECURITY DEFINER) не трябва да е достъпна през /rest/v1/rpc.
revoke execute on function public.handle_auth_user_deleted() from public, anon, authenticated;

-- Таблиците без политики (гости, дневни, стаи, синхронизация) са нарочно затворени за Data API —
-- достъпът е само през сървъра. Явно отнемаме и правата, за да е ясно намерението.
revoke all on table public.guests, public.daily_challenges, public.rooms, public.room_players, public.room_rounds,
  public.room_guesses, public.room_reactions, public.sync_runs, public.sync_filters from anon, authenticated;
