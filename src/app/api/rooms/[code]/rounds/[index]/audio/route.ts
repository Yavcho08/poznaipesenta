import type { NextRequest } from "next/server";
import { proxyAudio } from "@/lib/audio-proxy";
import { handleRoom } from "@/lib/room/http";
import { RoomError, roomRoundTrack } from "@/lib/room/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/rounds/[index]/audio">) {
  return handleRoom(async () => {
    const { code, index } = await ctx.params;
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0) throw new RoomError("Невалиден рунд");
    return proxyAudio(await roomRoundTrack(code, i));
  });
}
