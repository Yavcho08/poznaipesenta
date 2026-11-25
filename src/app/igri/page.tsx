import type { Metadata } from "next";
import Link from "next/link";
import { QUIZZES, QUIZ_TYPES } from "@/lib/engine/types";

export const metadata: Metadata = { title: "Игри · Познай песента" };

export default function GamesPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Всички игри</h1>
        <p className="text-sm text-muted">Слушай, гледай корици, подреждай, сравнявай. Всяка игра има и дневен вариант — еднакъв за всички.</p>
      </header>

      <Link href="/igrai" className="card group flex items-center gap-4 border-accent/40 p-4 transition hover:-translate-y-0.5 hover:bg-surface-strong">
        <span className="text-4xl" aria-hidden>
          🎧
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold">Познай песента</span>
          <span className="block text-sm text-muted">Класиката: клипове 0.2 → 10 сек., пишеш и избираш песента</span>
        </span>
        <span className="text-muted transition group-hover:translate-x-1">→</span>
      </Link>

      <ul className="grid gap-3 sm:grid-cols-2">
        {QUIZ_TYPES.map((type) => {
          const q = QUIZZES[type];
          return (
            <li key={type} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden>
                  {q.icon}
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold leading-tight">{q.title}</h2>
                  <p className="text-xs text-muted">{q.short}</p>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <Link href={`/igri/${type}`} className="btn-primary flex-1 px-3 py-2 text-sm">
                  Играй
                </Link>
                <Link href={`/igri/${type}?daily=1`} className="btn-ghost px-3 py-2 text-sm">
                  📅 Дневно
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
