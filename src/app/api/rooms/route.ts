import type { NextRequest } from "next/server";
import { DEFAULT_SOURCE, parseSource } from "@/lib/game/source";
import { handleRoom, jsonBody, str } from "@/lib/room/http";
import { createRoom } from "@/lib/room/server";

// Нова стая: { source, name, rounds? (5/10/15) } → { code, token }
export async function POST(req: NextRequest) {
  return handleRoom(async () => {
    const body = await jsonBody(req);
    const rounds = typeof body.rounds === "number" ? body.rounds : undefined;
    const room = await createRoom(parseSource(body.source) ?? DEFAULT_SOURCE, str(body.name), rounds);
    return Response.json(room, { status: 201 });
  });
}
