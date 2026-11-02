import { describe, expect, it } from "vitest";
import { fullRoundEnd, REVEAL_S, ROUND_TIME_S, roundPhase } from "@/lib/room/timeline";

describe("времева линия на стая", () => {
  const start = 1_000_000;
  const end = fullRoundEnd(start);

  it("рундът е 45 сек.", () => {
    expect(ROUND_TIME_S).toBe(45);
    expect(end - start).toBe(45_000);
  });

  it("преди старта е отброяване", () => {
    expect(roundPhase(start - 1, start, end)).toEqual({ kind: "countdown", untilMs: start });
  });

  it("от старта до края се играе", () => {
    expect(roundPhase(start, start, end)).toEqual({ kind: "playing", endsMs: end });
    expect(roundPhase(end - 1, start, end)).toEqual({ kind: "playing", endsMs: end });
  });

  it("след края — показване на отговора", () => {
    expect(roundPhase(end, start, end)).toEqual({ kind: "reveal", nextRoundMs: end + REVEAL_S * 1000 });
  });

  it("ранен край (всички са готови) прекъсва рунда", () => {
    const early = start + 12_000;
    expect(roundPhase(start + 11_000, start, early)).toEqual({ kind: "playing", endsMs: early });
    expect(roundPhase(early, start, early).kind).toBe("reveal");
  });
});
