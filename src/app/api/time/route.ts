import { connection } from "next/server";

// Часовник на сървъра — клиентите изчисляват отместването си, за да пускат откъсите едновременно.
export async function GET() {
  await connection();
  return Response.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
