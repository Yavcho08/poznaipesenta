import type { NextRequest } from "next/server";
import { handleRoom, roomToken } from "@/lib/room/http";
import { rematch, RoomError } from "@/lib/room/server";

// Реванш: нова стая със същите настройки (или влизане в вече създадената) → { code, token }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/rematch">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const token = roomToken(req);
    if (!token) throw new RoomError("Не си в тази стая", 403);
    return Response.json(await rematch(code, token), { status: 201 });
  });
}
