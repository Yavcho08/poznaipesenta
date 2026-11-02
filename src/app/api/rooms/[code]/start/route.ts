import type { NextRequest } from "next/server";
import { handleRoom, roomToken } from "@/lib/room/http";
import { RoomError, startRoom } from "@/lib/room/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/start">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    await startRoom(code, token);
    return Response.json({ ok: true });
  });
}
