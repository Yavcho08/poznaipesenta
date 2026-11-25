import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Supabase клиент за сървъра със сесията на потребителя (от бисквитките).
 * В server component записът на бисквитки не е позволен — тогава сесията я опреснява proxy.ts.
 */
export async function createSupabaseServer() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw new Error("Липсват NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // Извикано от server component — proxy.ts ще запише опреснената сесия.
        }
      },
    },
  });
}
