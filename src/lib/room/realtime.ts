import "server-only";
import { supabaseUrl } from "@/lib/supabase/env";

// Supabase Realtime (Broadcast) за стаите: след всяка промяна сървърът праща „changed“ в канал
// room:<КОД>, а клиентите веднага теглят новото състояние (GET /api/rooms/<код>).
// В съобщението няма данни (каналът е публичен) — само сигнал. Ако Realtime липсва/падне,
// клиентите пак питат сървъра периодично, така че нищо не зависи само от него.

export function roomTopic(code: string): string {
  return `room:${code.toUpperCase()}`;
}

export function notifyRoom(code: string): void {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  void fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: roomTopic(code), event: "changed", payload: { at: Date.now() }, private: false }] }),
    cache: "no-store",
  }).catch(() => undefined);
}
