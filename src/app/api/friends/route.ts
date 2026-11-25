import { connection } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { listFriends } from "@/lib/social/friends";

// Приятелите на влезлия потребител (за „Покани приятели“ в стаята).
export async function GET() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Влез, за да виждаш приятелите си" }, { status: 401 });
  return Response.json({ friends: await listFriends(viewer.userId) }, { headers: { "Cache-Control": "no-store" } });
}
