import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md space-y-4 p-6 text-center">
      <p className="font-display text-5xl font-bold text-gradient">404</p>
      <h1 className="font-display text-xl font-bold">Тази страница я няма</h1>
      <p className="text-sm text-muted">Може линкът да е стар. Песните обаче са си тук.</p>
      <div className="flex justify-center gap-2">
        <Link href="/" className="btn-primary">
          Начало
        </Link>
        <Link href="/igri" className="btn-ghost">
          Игри
        </Link>
      </div>
    </div>
  );
}
