import type { NextRequest } from "next/server";
import { isDeezerId } from "@/lib/deezer";
import { handleRoom, jsonBody, roomToken, str } from "@/lib/room/http";
import { moveInRoom, RoomError } from "@/lib/room/server";

// Ход в стаята: { deezerId } (отговор) или { kind: "skip" } („Пропусни“ / „Предай се“).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/guess">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    const body = await jsonBody(req);
    if (body.kind === "skip") return Response.json(await moveInRoom(code, token, { kind: "skip" }));
    const deezerId = str(body.deezerId);
    if (!isDeezerId(deezerId)) throw new RoomError("Избери песен от списъка");
    return Response.json(await moveInRoom(code, token, { kind: "guess", deezerId }));
  });
}
