import type { NextRequest } from "next/server";
import { notifyRoom } from "@/lib/room/realtime";
import { handleRoom, roomToken } from "@/lib/room/http";
import { rematch, RoomError } from "@/lib/room/server";

// Реванш: нова стая със същите настройки (или влизане в вече създадената) → { code, token }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/rematch">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    const next = await rematch(code, token);
    notifyRoom(code);
    return Response.json(next, { status: 201 });
  });
}
