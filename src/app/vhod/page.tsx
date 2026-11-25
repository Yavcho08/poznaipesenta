import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { loginProviders, safeNext } from "@/lib/auth/providers";
import { LoginPanel } from "./login-panel";

export const metadata = { title: "Вход · Познай песента" };

async function Login({ searchParams }: PageProps<"/vhod">) {
  await connection();
  const params = await searchParams;
  const next = safeNext(params.next, "/profil");
  if (await getViewer()) redirect(next);
  const error = typeof params.error === "string" ? params.error : null;
  return <LoginPanel next={next} providers={await loginProviders()} initialError={error} />;
}

export default function LoginPage(props: PageProps<"/vhod">) {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-bold">Влез в играта</h1>
        <p className="text-sm text-muted">
          Пази резултатите, точките и постиженията си и влез в класацията. Играта си остава безплатна и без задължителна
          регистрация.
        </p>
      </header>
      <Suspense fallback={<div className="card h-72 animate-pulse" />}>
        <Login {...props} />
      </Suspense>
    </div>
  );
}
