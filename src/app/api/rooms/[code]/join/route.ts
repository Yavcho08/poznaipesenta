import type { NextRequest } from "next/server";
import { handleRoom, jsonBody, str } from "@/lib/room/http";
import { joinRoom } from "@/lib/room/server";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const body = await jsonBody(req);
    return Response.json(await joinRoom(code, str(body.name)), { status: 201 });
  });
}
