import type { NextRequest } from "next/server";
import { proxyAudio } from "@/lib/audio-proxy";
import { handle, parseRoundIndex } from "@/lib/game/http";
import { getRoundTrack } from "@/lib/game/server";

// Звукът на рунда по номер — без да издава deezerId на песента в мрежовите заявки.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/game/[id]/rounds/[index]/audio">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    const track = await getRoundTrack(id, parseRoundIndex(index));
    return proxyAudio(track);
  });
}
