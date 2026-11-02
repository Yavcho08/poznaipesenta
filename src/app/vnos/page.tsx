import type { Metadata } from "next";
import { Suspense } from "react";
import { spotifyConfigured, spotifyConnected } from "@/lib/import/spotify-api";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Внос на плейлист · Познай песента" };

export default function ImportPage({ searchParams }: PageProps<"/vnos">) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Внос на плейлист</h1>
      <Suspense fallback={<p className="text-muted">Зареждане…</p>}>
        <ImportWithState searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ImportWithState({ searchParams }: { searchParams: PageProps<"/vnos">["searchParams"] }) {
  const params = await searchParams;
  const error = typeof params.spotifyError === "string" ? params.spotifyError : null;
  return (
    <ImportClient
      spotifyConfigured={spotifyConfigured()}
      spotifyConnected={await spotifyConnected()}
      spotifyError={error}
    />
  );
}
