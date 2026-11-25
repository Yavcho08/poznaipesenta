"use client";

import { useActionState } from "react";
import { addFilterAction, runSyncAction, type SyncActionState } from "./actions";

const initial: SyncActionState = { ok: false, message: null };

export function RunSyncButton() {
  const [state, action, pending] = useActionState(async () => runSyncAction(), initial);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Синхронизирам… (до 45 сек.)" : "Пусни синхронизация сега"}
      </button>
      {state.message && <p className={`text-sm ${state.ok ? "text-emerald-300" : "text-red-300"}`}>{state.message}</p>}
    </form>
  );
}

export function AddFilterForm() {
  const [state, action, pending] = useActionState(addFilterAction, initial);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="pattern" placeholder="дума, напр. remix" required minLength={2} maxLength={40} className="field max-w-48 py-2" />
      <input name="note" placeholder="бележка (по желание)" maxLength={80} className="field max-w-64 py-2" />
      <button type="submit" disabled={pending} className="btn-ghost px-4 py-2 text-sm">
        Добави
      </button>
      {state.message && <p className={`w-full text-sm ${state.ok ? "text-emerald-300" : "text-red-300"}`}>{state.message}</p>}
    </form>
  );
}
