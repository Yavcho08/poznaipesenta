import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/env";

/**
 * Административен клиент с тайния ключ (SUPABASE_SECRET_KEY) — само за сървъра,
 * напр. изтриване на акаунт. Никога не го подавай към браузъра.
 */
export function createSupabaseAdmin() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Липсва SUPABASE_SECRET_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
