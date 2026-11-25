import type { NextRequest } from "next/server";
import { notifyRoom } from "@/lib/room/realtime";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { handleRoom, jsonBody, str } from "@/lib/room/http";
import { joinRoom } from "@/lib/room/server";
import { getViewer } from "@/lib/auth/viewer";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/join">) {
  if (!rateLimit(`room-join:${clientIp(req)}`, 30, 60_000)) return tooManyRequests();
  return handleRoom(async () => {
    const { code } = await ctx.params;
    const body = await jsonBody(req);
    const viewer = await getViewer();
    const joined = await joinRoom(code, str(body.name), viewer?.userId ?? null);
    notifyRoom(code);
    return Response.json(joined, { status: 201 });
  });
}
