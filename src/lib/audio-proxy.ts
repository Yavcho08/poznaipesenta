import "server-only";
import { decodeMp3Mono } from "@/lib/audio/decode-mp3";
import { findHookStart } from "@/lib/audio/hook";
import { cacheGet, cacheSet } from "@/lib/cache";
import { forgetTrack } from "@/lib/deezer";
import { resolveAudio } from "@/lib/game/server";
import { prisma } from "@/lib/prisma";
import type { Track } from "@/generated/prisma/client";

type TrackRef = Pick<Track, "deezerId" | "title" | "artistName">;

/** Хедър с началото на клиповете (секунди в откъса) — клиентът пуска оттам. */
export const HOOK_HEADER = "X-Hook-Start";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Откъде в Deezer откъса да започват клиповете. Изчислява се веднъж и се пази в базата
 * (откъсът на една песен в Deezer не се променя), а за песни извън базата — в паметта.
 * Така всички играчи в стая получават едно и също начало.
 */
async function hookStart(deezerId: string, bytes: Uint8Array): Promise<number> {
  const key = `hook:${deezerId}`;
  const memo = cacheGet<number>(key);
  if (memo !== undefined) return memo;

  const stored = await prisma.track.findUnique({ where: { deezerId }, select: { hookStart: true } });
  if (stored?.hookStart != null) {
    cacheSet(key, stored.hookStart, DAY);
    return stored.hookStart;
  }

  let start = 0;
  try {
    const { samples, sampleRate } = await decodeMp3Mono(bytes);
    start = findHookStart(samples, sampleRate);
  } catch (error) {
    // Без анализ клиповете просто започват от началото на откъса.
    console.error("hook analysis failed", deezerId, error);
  }
  cacheSet(key, start, DAY);
  if (stored) await prisma.track.update({ where: { deezerId }, data: { hookStart: start } });
  return start;
}

/**
 * Праща preview-то през нашия сървър (Deezer/iTunes нямат CORS). Не записваме нищо на диск.
 * Ако подписаният URL е изтекъл, взимаме нов веднъж.
 */
export async function proxyAudio(track: TrackRef): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const source = await resolveAudio(track);
    if (!source) return Response.json({ error: "Тази песен няма откъс за слушане" }, { status: 404 });

    const upstream = await fetch(source.url, { cache: "no-store" });
    if (upstream.ok) {
      // ~480 KB — държим го целия в паметта, за да го анализираме преди да го пратим.
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      // iTunes откъсите са AAC и Apple ги избира около припева — пускаме ги от началото.
      const start = source.origin === "deezer" ? await hookStart(track.deezerId, bytes) : 0;
      return new Response(bytes, {
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "private, max-age=3600",
          [HOOK_HEADER]: String(start),
        },
      });
    }
    if (source.origin === "deezer") forgetTrack(track.deezerId);
  }
  return Response.json({ error: "Звукът не можа да се зареди" }, { status: 502 });
}
