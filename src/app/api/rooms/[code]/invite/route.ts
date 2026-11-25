import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { handle } from "@/lib/game/http";
import { GameError } from "@/lib/game/server";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { inviteToRoom } from "@/lib/social/friends";

// Покана за стаята: { friendIds: string[] } → { sent }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/invite">) {
  if (!rateLimit(`invite:${clientIp(req)}`, 20, 60_000)) return tooManyRequests();
  return handle(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new GameError("Влез, за да каниш приятели", 401);
    const { code } = await ctx.params;
    const body: unknown = await req.json().catch(() => null);
    const ids =
      typeof body === "object" && body !== null && "friendIds" in body && Array.isArray(body.friendIds)
        ? body.friendIds.filter((x): x is string => typeof x === "string")
        : [];
    if (ids.length === 0) throw new GameError("Избери кого да поканиш");
    return Response.json({ sent: await inviteToRoom(viewer.userId, code, ids) });
  });
}
