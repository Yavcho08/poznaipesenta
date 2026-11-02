import type { NextRequest } from "next/server";
import { proxyAudio } from "@/lib/audio-proxy";
import { getTrack, isDeezerId } from "@/lib/deezer";
import { prisma } from "@/lib/prisma";

// Пълният preview на песен по deezerId (напр. след като рундът е приключил).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/audio/[deezerId]">) {
  const { deezerId } = await ctx.params;
  if (!isDeezerId(deezerId)) return Response.json({ error: "Невалиден ID" }, { status: 400 });

  const local = await prisma.track.findUnique({ where: { deezerId } });
  if (local) return proxyAudio(local);

  try {
    const remote = await getTrack(deezerId);
    return proxyAudio({ deezerId, title: remote.title, artistName: remote.artist.name });
  } catch {
    return Response.json({ error: "Песента не е намерена" }, { status: 404 });
  }
}
