import { describe, expect, it } from "vitest";
import { findHookStart } from "@/lib/audio/hook";

const RATE = 8000;

/** Синтетичен „откъс“: отсечки [секунди, сила], запълнени с шум с тази сила. */
function signal(parts: [number, number][]): Float32Array {
  const total = parts.reduce((s, [sec]) => s + sec, 0);
  const out = new Float32Array(Math.round(total * RATE));
  let i = 0;
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (const [sec, amp] of parts) {
    const end = i + Math.round(sec * RATE);
    for (; i < end; i++) out[i] = rand() * 2 * amp;
  }
  return out;
}

describe("findHookStart", () => {
  it("тих куплет, после силен припев → започва от припева", () => {
    // като „Пей, сърце“: припевът влиза около 18.5 сек.
    const start = findHookStart(signal([[18.5, 0.15], [11.5, 0.8]]), RATE);
    expect(start).toBeGreaterThan(18.2);
    expect(start).toBeLessThan(18.8);
  });

  it("силно начало, после тихо → остава в началото", () => {
    // като God's Plan: припевът е в началото на откъса
    expect(findHookStart(signal([[14, 0.8], [16, 0.15]]), RATE)).toBeLessThan(1);
  });

  it("припевът е късно (след 20 сек.) → започва възможно най-близо, но оставя 10 сек.", () => {
    const start = findHookStart(signal([[24, 0.15], [6, 0.9]]), RATE);
    expect(start).toBeLessThanOrEqual(20);
    expect(start).toBeGreaterThan(15);
  });

  it("равномерен откъс → не скача безсмислено, остава в първите секунди или на удар", () => {
    const start = findHookStart(signal([[30, 0.5]]), RATE);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThanOrEqual(20);
  });

  it("твърде къс откъс → 0", () => {
    expect(findHookStart(signal([[8, 0.5]]), RATE)).toBe(0);
  });

  it("тишина → 0", () => {
    expect(findHookStart(new Float32Array(30 * RATE), RATE)).toBe(0);
  });
});
