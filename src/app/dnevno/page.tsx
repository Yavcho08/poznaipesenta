import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { formatDate, todayInSofia } from "@/lib/game/daily-shared";
import { Game } from "../igra/game";

export const metadata: Metadata = { title: "Дневно предизвикателство · Познай песента" };

export default function DailyPage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Зареждане…</p>}>
      <Daily />
    </Suspense>
  );
}

async function Daily() {
  // Датата зависи от момента на заявката.
  await connection();
  const date = todayInSofia();
  return <Game key={date} label={formatDate(date)} daily={{ date }} />;
}
