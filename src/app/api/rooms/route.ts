import type { NextRequest } from "next/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { DEFAULT_SOURCE, parseSource } from "@/lib/game/source";
import { handleRoom, jsonBody, str } from "@/lib/room/http";
import { canUseSource, PRIVATE_PLAYLIST_MESSAGE } from "@/lib/game/playlists";
import { createRoom, RoomError } from "@/lib/room/server";
import { getViewer } from "@/lib/auth/viewer";

// Нова стая: { source, name, rounds? (5/10/15) } → { code, token }
export async function POST(req: NextRequest) {
  if (!rateLimit(`room-create:${clientIp(req)}`, 10, 60_000)) return tooManyRequests();
  return handleRoom(async () => {
    const body = await jsonBody(req);
    const rounds = typeof body.rounds === "number" ? body.rounds : undefined;
    const viewer = await getViewer();
    const source = parseSource(body.source) ?? DEFAULT_SOURCE;
    // Личен плейлист — само собственикът може да направи стая с него (другите играят в нея).
    if (!(await canUseSource(source, viewer?.userId ?? null))) throw new RoomError(PRIVATE_PLAYLIST_MESSAGE, 403);
    const room = await createRoom(source, str(body.name), rounds, viewer?.userId ?? null);
    return Response.json(room, { status: 201 });
  });
}
