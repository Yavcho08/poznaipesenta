import type { Metadata } from "next";
import { Suspense } from "react";
import { Room } from "./room";

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
  return <Room code={code.toUpperCase()} />;
}
