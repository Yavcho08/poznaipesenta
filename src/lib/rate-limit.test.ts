import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("пуска до лимита в прозореца, после отказва", () => {
    const key = `t:${Math.random()}`;
    const t0 = 1_000_000;
    expect(rateLimit(key, 3, 1000, t0)).toBe(true);
    expect(rateLimit(key, 3, 1000, t0 + 1)).toBe(true);
    expect(rateLimit(key, 3, 1000, t0 + 2)).toBe(true);
    expect(rateLimit(key, 3, 1000, t0 + 3)).toBe(false);
  });

  it("прозорецът се плъзга", () => {
    const key = `t:${Math.random()}`;
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 1000, t0 + i);
    expect(rateLimit(key, 3, 1000, t0 + 500)).toBe(false);
    expect(rateLimit(key, 3, 1000, t0 + 1001)).toBe(true);
  });

  it("ключовете са независими", () => {
    const t0 = 3_000_000;
    expect(rateLimit(`a:${t0}`, 1, 1000, t0)).toBe(true);
    expect(rateLimit(`b:${t0}`, 1, 1000, t0)).toBe(true);
    expect(rateLimit(`a:${t0}`, 1, 1000, t0)).toBe(false);
  });
});
