import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vercel Cron праща „Authorization: Bearer <CRON_SECRET>“. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
