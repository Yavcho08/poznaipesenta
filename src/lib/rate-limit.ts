import "server-only";

// Rate limit в паметта на сървърния процес (плъзгащ прозорец). На Vercel всяка инстанция има свой
// брояч — достатъчно срещу скриптове, които бомбардират един endpoint, без външна услуга.

const globalForLimits = globalThis as unknown as { __rateLimits?: Map<string, number[]> };
const hits: Map<string, number[]> = (globalForLimits.__rateLimits ??= new Map());

let lastSweep = 0;

/** true = заявката е позволена; false = над лимита (`limit` заявки за `windowMs`). */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, list] of hits) if (list.length === 0 || now - list[list.length - 1] > 10 * 60_000) hits.delete(k);
  }
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

/** IP на клиента от заявката (Vercel подава x-forwarded-for). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function tooManyRequests(): Response {
  return Response.json({ error: "Твърде много заявки. Изчакай малко и опитай пак." }, { status: 429 });
}
