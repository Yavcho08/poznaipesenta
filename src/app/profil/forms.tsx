"use client";

import { useActionState, useTransition } from "react";
import { Avatar, AVATAR_EMOJIS } from "@/components/avatar";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";
import { deleteAccountAction, saveAvatarAction, saveUsernameAction, type ProfileFormState } from "./actions";

const initial: ProfileFormState = { ok: false, message: null };

export function UsernameForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(saveUsernameAction, initial);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="username"
          defaultValue={current ?? ""}
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          required
          placeholder="напр. ПопФолкКралицата"
          aria-label="Име в играта"
          className="field"
        />
        <button type="submit" disabled={pending} className="btn-primary shrink-0 px-5">
          {pending ? "…" : "Запази"}
        </button>
      </div>
      {state.message && (
        <p role="status" className={`text-sm ${state.ok ? "text-emerald-300" : "text-red-200"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function AvatarPicker({ current }: { current: string | null }) {
  const [pending, start] = useTransition();
  const pick = (value: string) => start(() => saveAvatarAction(value));
  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => pick("provider")}
        className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
      >
        Снимката от Google
      </button>
      {AVATAR_EMOJIS.map((emoji) => {
        const value = `emoji:${emoji}`;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => pick(value)}
            aria-label={`Аватар ${emoji}`}
            aria-pressed={current === value}
            className={`rounded-full p-0.5 ${current === value ? "ring-2 ring-accent" : ""}`}
          >
            <Avatar value={value} name={null} size={40} />
          </button>
        );
      })}
    </div>
  );
}

export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteAccountAction, initial);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="confirm" placeholder="Напиши ИЗТРИЙ" aria-label="Потвърждение" autoComplete="off" className="field" />
        <button type="submit" disabled={pending} className="btn shrink-0 bg-red-500/80 px-5 text-white hover:bg-red-500">
          {pending ? "…" : "Изтрий"}
        </button>
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-red-200">
          {state.message}
        </p>
      )}
    </form>
  );
}
