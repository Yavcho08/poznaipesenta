// Тайната на играча за всяка стая се пази в localStorage (само в този браузър).

const key = (code: string) => `poznai:room:${code.toUpperCase()}`;

export function loadToken(code: string): string | null {
  try {
    return localStorage.getItem(key(code));
  } catch {
    return null;
  }
}

export function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(key(code), token);
  } catch {
    // Частен режим — играчът ще трябва да влезе пак при презареждане.
  }
}

// Името е общо с класацията.
export { loadName, saveName } from "@/lib/player-name";
