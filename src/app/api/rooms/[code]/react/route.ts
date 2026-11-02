import type { NextRequest } from "next/server";
import { handleRoom, jsonBody, roomToken, str } from "@/lib/room/http";
import { reactInRoom, RoomError } from "@/lib/room/server";

// Емоджи реакция: { emoji }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/react">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    await reactInRoom(code, token, str((await jsonBody(req)).emoji));
    return Response.json({ ok: true });
  });
}
