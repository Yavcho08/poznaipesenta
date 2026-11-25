"use client";

import Link from "next/link";
import { useEffect } from "react";

// Обща страница при неочаквана грешка (напр. базата не отговаря).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="text-4xl" aria-hidden>
        🎧
      </p>
      <h1 className="font-display text-xl font-bold">Нещо се обърка</h1>
      <p className="text-sm text-muted">Може да е за момент — провери връзката си и опитай пак.</p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Опитай пак
        </button>
        <Link href="/" className="btn-ghost">
          Начало
        </Link>
      </div>
    </div>
  );
}
