import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeSource } from "@/lib/game/server";
import { getChallenge, isChallengeCode } from "@/lib/game/social";
import { sourceFromQuery } from "@/lib/game/source";
import { Game } from "./game";

export const metadata: Metadata = { title: "Игра · Познай песента" };

export default function GamePage({ searchParams }: PageProps<"/igra">) {
  return (
    <Suspense fallback={<p className="text-center text-muted">Зареждане…</p>}>
      <GameWithSource searchParams={searchParams} />
    </Suspense>
  );
}

async function GameWithSource({ searchParams }: { searchParams: PageProps<"/igra">["searchParams"] }) {
  const params = await searchParams;

  // „Предизвикай приятел“: /igra?vs=<код>
  const vs = typeof params.vs === "string" ? params.vs : null;
  if (vs) {
    const challenge = isChallengeCode(vs) ? await getChallenge(vs).catch(() => null) : null;
    if (!challenge) {
      return (
        <div className="card mx-auto max-w-md space-y-4 p-6 text-center">
          <p className="font-semibold">Линкът за предизвикателство не е валиден или е изтекъл.</p>
          <Link href="/" className="btn-primary">
            Към играта
          </Link>
        </div>
      );
    }
    return (
      <Game
        key={`vs-${vs}`}
        label={challenge.label || "Предизвикателство"}
        challenge={{ code: challenge.code, name: challenge.name, total: challenge.total }}
      />
    );
  }

  const source = sourceFromQuery(params);
  const label = await describeSource(source);
  // key: при смяна на източника играта започва отначало.
  return <Game key={JSON.stringify(source)} source={source} label={label} />;
}
