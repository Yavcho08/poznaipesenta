import "server-only";
import type { NextRequest } from "next/server";
import { RoomError } from "@/lib/room/server";

export async function handleRoom(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RoomError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Нещо се обърка. Опитай пак." }, { status: 500 });
  }
}

/** Тайната на играча идва в хедър, не в URL (за да не попада в логове). */
export function roomToken(req: NextRequest): string | null {
  const token = req.headers.get("x-room-token");
  return token && token.length < 100 ? token : null;
}

export async function jsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null);
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
