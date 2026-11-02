// Името на играча (за класацията и стаите) — помни се в браузъра, без регистрация.

const KEY = "poznai:name";

export function loadName(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {
    // частен режим — няма да се запомни
  }
}
