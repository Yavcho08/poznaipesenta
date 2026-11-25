// Потребителско име — чисти функции (общи за клиента, сървъра и тестовете).

import { looseKey } from "@/lib/normalize";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

// Корени на обидни думи (кирилица и латиница — сравнява се след транслитерация и без
// значение от главни/малки букви, интервали и пунктуация). Не е пълен списък — само първа преграда.
const BLOCKED_ROOTS = [
  "putka", "pytka", "puta", "pederas", "pedal", "eba", "ebi", "ebe", "ebal", "ebat", "duhach", "duhai", "kurva", "kurvi",
  "kur", "hui", "huy", "mamata", "maika ti", "mamka", "shiban", "kopele", "gaz", "gadna", "tupak", "debil", "idiot",
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "nigger", "nigga", "fag", "whore", "slut", "rape", "nazi", "hitler",
  "admin", "moderator",
];
// Къси корени, които са обидни само като цяла дума (иначе „kurabiya“, „ebay“, „gazela“ биха били забранени).
const WHOLE_WORD_ONLY = new Set(["kur", "hui", "huy", "eba", "ebi", "ebe", "gaz", "pedal", "puta", "debil", "idiot", "dick", "cock", "fag"]);

export type UsernameCheck = { ok: true; username: string } | { ok: false; error: string };

/** Проверява и почиства потребителско име (без проверка за уникалност — тя е в базата). */
export function checkUsername(raw: string): UsernameCheck {
  const username = raw.trim().replace(/\s+/g, " ");
  if (username.length < USERNAME_MIN) return { ok: false, error: `Името трябва да е поне ${USERNAME_MIN} знака` };
  if (username.length > USERNAME_MAX) return { ok: false, error: `Името трябва да е най-много ${USERNAME_MAX} знака` };
  if (!/^[\p{L}\d][\p{L}\d _.-]*$/u.test(username)) {
    return { ok: false, error: "Позволени са букви, цифри, интервал и _ . - (започва с буква или цифра)" };
  }
  if (isOffensive(username)) return { ok: false, error: "Избери друго име" };
  return { ok: true, username };
}

export function isOffensive(text: string): boolean {
  const words = text.split(/[\s_.-]+/).map(looseKey).filter(Boolean);
  const joined = words.join("");
  return BLOCKED_ROOTS.some((root) => {
    const key = looseKey(root).replace(/\s+/g, "");
    if (WHOLE_WORD_ONLY.has(root)) return words.includes(key);
    return joined.includes(key);
  });
}
