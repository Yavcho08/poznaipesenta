import type { NextRequest } from "next/server";
import { handleRoom, roomToken } from "@/lib/room/http";
import { getRoomState } from "@/lib/room/server";

// Състояние на стаята (клиентите питат всяка секунда).
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    return Response.json(await getRoomState(code, roomToken(req)), { headers: { "Cache-Control": "no-store" } });
  });
}
