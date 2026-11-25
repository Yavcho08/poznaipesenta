import type { NextRequest } from "next/server";
import { notifyRoom } from "@/lib/room/realtime";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isDeezerId } from "@/lib/deezer";
import { handleRoom, jsonBody, roomToken, str } from "@/lib/room/http";
import { moveInRoom, RoomError } from "@/lib/room/server";

// Ход в стаята: { deezerId } (отговор) или { kind: "skip" } („Пропусни“ / „Предай се“).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/guess">) {
  if (!rateLimit(`room-move:${clientIp(req)}`, 120, 60_000)) return tooManyRequests();
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    const body = await jsonBody(req);
    if (body.kind === "skip") {
      const r = await moveInRoom(code, token, { kind: "skip" });
      notifyRoom(code);
      return Response.json(r);
    }
    const deezerId = str(body.deezerId);
    if (!isDeezerId(deezerId)) throw new RoomError("Избери песен от списъка");
    const r = await moveInRoom(code, token, { kind: "guess", deezerId });
    notifyRoom(code);
    return Response.json(r);
  });
}
