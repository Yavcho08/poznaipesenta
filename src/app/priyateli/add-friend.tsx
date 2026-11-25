"use client";

import { useActionState } from "react";
import { addFriendAction, type FriendFormState } from "./actions";

const initial: FriendFormState = { ok: false, message: null };

export function AddFriendForm() {
  const [state, action, pending] = useActionState(addFriendAction, initial);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="username" required minLength={2} maxLength={20} placeholder="Име на приятеля" aria-label="Име на приятеля" className="field py-2" />
        <button type="submit" disabled={pending} className="btn-primary shrink-0 px-5 py-2">
          {pending ? "…" : "Добави"}
        </button>
      </div>
      {state.message && (
        <p role="status" className={`text-sm ${state.ok ? "text-emerald-300" : "text-red-300"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
