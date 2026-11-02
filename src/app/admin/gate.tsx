import type { ReactNode } from "react";
import { adminConfigured, isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "./client";

/** Показва съдържанието само на влязъл админ; иначе — форма за вход. */
export async function AdminGate({ children }: { children: () => Promise<ReactNode> }) {
  if (!adminConfigured()) {
    return (
      <p className="rounded-lg bg-surface p-4 text-sm text-muted">
        Админ панелът е изключен. Задай <code>ADMIN_PASSWORD</code> в <code>.env</code> и рестартирай сървъра.
      </p>
    );
  }
  if (!(await isAdmin())) return <LoginForm />;
  return <>{await children()}</>;
}
