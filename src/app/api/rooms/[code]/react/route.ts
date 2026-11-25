import type { NextRequest } from "next/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { handleRoom, jsonBody, roomToken, str } from "@/lib/room/http";
import { reactInRoom, RoomError } from "@/lib/room/server";

// Емоджи реакция: { emoji }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/react">) {
  if (!rateLimit(`room-react:${clientIp(req)}`, 60, 60_000)) return tooManyRequests();
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    await reactInRoom(code, token, str((await jsonBody(req)).emoji));
    return Response.json({ ok: true });
  });
}
