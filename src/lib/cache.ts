// Прост кеш в паметта с TTL за всеки запис. Живее в globalThis, за да оцелява при HMR.
// За един сървърен процес е достатъчен; при много инстанции всяка има собствен кеш.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 5000;

const globalForCache = globalThis as unknown as { __ttlCache?: Map<string, Entry<unknown>> };
const store: Map<string, Entry<unknown>> = (globalForCache.__ttlCache ??= new Map());

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Map пази реда на вмъкване — изхвърляме най-стария запис.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  cacheSet(key, value, ttlMs);
  return value;
}
