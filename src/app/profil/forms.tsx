"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Avatar, AVATAR_EMOJIS } from "@/components/avatar";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";
import { deleteAccountAction, saveAvatarAction, saveUsernameAction, uploadAvatarAction, type ProfileFormState } from "./actions";

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

/** Изрязва квадрат от средата и смалява до 256×256 JPEG (в браузъра — бързо и малко за качване). */
async function squareJpeg(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Браузърът не може да обработи снимката");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Грешка"))), "image/jpeg", 0.86));
}

function UploadAvatar() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<ProfileFormState | null>(null);
  const onFile = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      try {
        const blob = await squareJpeg(file);
        const form = new FormData();
        form.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
        setMessage(await uploadAvatarAction(form));
      } catch {
        setMessage({ ok: false, message: "Тази снимка не може да се използва" });
      }
      if (input.current) input.current.value = "";
    });
  };
  return (
    <div className="w-full space-y-1">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button type="button" onClick={() => input.current?.click()} disabled={pending} className="btn-ghost px-4 py-2 text-sm">
        {pending ? "Качвам…" : "📷 Качи своя снимка"}
      </button>
      {message?.message && <p className={`text-xs ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.message}</p>}
    </div>
  );
}

export function AvatarPicker({ current }: { current: string | null }) {
  const [pending, start] = useTransition();
  const pick = (value: string) => start(() => saveAvatarAction(value));
  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`}>
      <UploadAvatar />
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
