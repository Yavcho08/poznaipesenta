import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Room } from "./room";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Стая · Познай песента" };

export default function RoomPage({ params }: PageProps<"/staya/[code]">) {
  return (
    <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
      <RoomWithCode params={params} />
    </Suspense>
  );
}

async function RoomWithCode({ params }: { params: PageProps<"/staya/[code]">["params"] }) {
  const { code } = await params;
  await connection();
  const viewer = await getViewer();
  return <Room code={code.toUpperCase()} defaultName={viewer?.profile.username ?? null} />;
}
