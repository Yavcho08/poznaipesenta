import { disconnect } from "@/lib/import/spotify-api";

export async function POST() {
  await disconnect();
  return Response.json({ ok: true });
}
