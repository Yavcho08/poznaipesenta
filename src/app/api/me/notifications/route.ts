import { connection } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getNotifications, markInvitesSeen } from "@/lib/social/friends";

// Известия: брой молби за приятелство + покани за стаи. POST = поканите са видени.
export async function GET() {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ requests: 0, invites: [] });
  return Response.json(await getNotifications(viewer.userId), { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  await connection();
  const viewer = await getViewer();
  if (viewer) await markInvitesSeen(viewer.userId);
  return Response.json({ ok: true });
}
