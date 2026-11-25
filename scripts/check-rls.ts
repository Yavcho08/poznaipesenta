// Проверка на RLS през публичния Data API (както би опитал браузър/нападател с публичния ключ).
//
//   npm run db:check-rls
//
// Очаквания: каталогът и профилите — само четене; игри/рундове/постижения — само свои
// (и рундовете само от приключили игри); гости, дневни, стаи, синхронизация — нищо.
// Записи през Data API — никакви. Създава временен потребител и го трие накрая.
import "./env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secret = process.env.SUPABASE_SECRET_KEY ?? "";
if (!url || !anonKey || !secret) {
  console.error("Липсват NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY");
  process.exit(1);
}

const PUBLIC_READ = ["artists", "genres", "artist_genres", "albums", "tracks", "track_artists", "playlists", "playlist_tracks", "achievements", "profiles"];
const HIDDEN = ["guests", "daily_challenges", "rooms", "room_players", "room_rounds", "room_guesses", "room_reactions", "sync_runs", "sync_filters"];
const OWN_ONLY = ["games", "game_rounds", "user_achievements"];

let failures = 0;
function check(ok: boolean, label: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}

async function count(client: SupabaseClient, table: string): Promise<{ rows: number; error: string | null }> {
  const { data, error } = await client.from(table).select("*").limit(5);
  return { rows: data?.length ?? 0, error: error?.message ?? null };
}

async function main(): Promise<void> {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  console.log("— Анонимен —");
  for (const t of PUBLIC_READ) {
    const r = await count(anon, t);
    // profiles може да е празна (няма регистрирани) — важно е четенето да е позволено.
    check(!r.error && (r.rows > 0 || t === "profiles"), `${t}: чете се (${r.rows})${r.error ? ` — ${r.error}` : ""}`);
  }
  for (const t of [...HIDDEN, ...OWN_ONLY]) {
    const r = await count(anon, t);
    check(r.rows === 0, `${t}: нищо не се вижда${r.rows ? ` — видими ${r.rows}!` : ""}`);
  }
  const insert = await anon.from("tracks").insert({ id: "rls-test", deezer_id: "rls-test", title: "x", artist_name: "x" });
  check(Boolean(insert.error), "tracks: запис отказан");
  const update = await anon.from("tracks").update({ title: "hacked" }).neq("id", "").select("id");
  check(!update.data?.length, "tracks: промяна отказана");
  const hiddenTrack = await admin.from("tracks").select("id").eq("is_active", false).limit(1).maybeSingle();
  if (hiddenTrack.data) {
    const r = await anon.from("tracks").select("id").eq("id", hiddenTrack.data.id);
    check(!r.data?.length, "tracks: скритите/неактивните не се виждат");
  }

  console.log("— Влязъл потребител —");
  const email = `rls.${Date.now()}@mailinator.com`;
  const password = "Rls-Check-12345";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const userId = created.data.user.id;
  try {
    // Профил и две игри: една приключила (своя) и една чужда (без собственик).
    await admin.from("profiles").insert({ id: userId, username: `rls${Date.now() % 100000}` });
    const own = await admin.from("games").insert({ id: `rls-own-${userId}`, user_id: userId, finished_at: new Date().toISOString(), total: 1 }).select("id").single();
    const open = await admin.from("games").insert({ id: `rls-open-${userId}`, user_id: userId, total: 0 }).select("id").single();
    await admin.from("game_rounds").insert([
      { id: `rls-r1-${userId}`, game_id: own.data?.id, index: 0, attempts: [] },
      { id: `rls-r2-${userId}`, game_id: open.data?.id, index: 0, attempts: [] },
    ]);

    const user = createClient(url, anonKey, { auth: { persistSession: false } });
    const login = await user.auth.signInWithPassword({ email, password });
    check(!login.error, "вход с парола");

    const games = await user.from("games").select("id, user_id");
    check((games.data ?? []).length === 2 && (games.data ?? []).every((g) => g.user_id === userId), `games: вижда само своите (${games.data?.length})`);
    const rounds = await user.from("game_rounds").select("id, game_id");
    check(
      (rounds.data ?? []).length === 1 && rounds.data?.[0]?.game_id === own.data?.id,
      "game_rounds: само от своя ПРИКЛЮЧИЛА игра (текущият рунд не издава отговора)",
    );
    for (const t of HIDDEN) {
      const r = await count(user, t);
      check(r.rows === 0, `${t}: нищо не се вижда`);
    }
    const promote = await user.from("profiles").update({ role: "admin" }).eq("id", userId).select("role");
    check(!promote.data?.length, "profiles: не може сам да си даде админ роля");
    const cheat = await user.from("games").update({ total: 99999 }).eq("user_id", userId).select("id");
    check(!cheat.data?.length, "games: не може да си промени точките");
    const fake = await user.from("games").insert({ id: `rls-fake-${userId}`, user_id: userId, total: 10000 });
    check(Boolean(fake.error), "games: не може да си добави игра");
  } finally {
    await admin.from("games").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }

  console.log(failures === 0 ? "\nRLS: всичко е наред." : `\nRLS: ${failures} проблема!`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
