import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { getViewer } from "@/lib/auth/viewer";

/** Показва съдържанието само на админ (по роля в профила). */
export async function AdminGate({ children }: { children: () => Promise<ReactNode> }) {
  if (await isAdmin()) return <>{await children()}</>;
  const viewer = await getViewer();
  return (
    <div className="card mx-auto max-w-sm space-y-3 p-6 text-center">
      <h1 className="font-display text-xl font-bold">Админ</h1>
      {viewer ? (
        <p className="text-sm text-muted">Профилът ти няма админ права.</p>
      ) : (
        <>
          <p className="text-sm text-muted">Влез с администраторския си профил.</p>
          <Link href="/vhod?next=/admin" className="btn-primary w-full">
            Вход
          </Link>
        </>
      )}
    </div>
  );
}
