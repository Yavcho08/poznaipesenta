import { describe, expect, it } from "vitest";
import { formatDate, roundSquares, seededRandom, shareText, todayInSofia } from "@/lib/game/daily-shared";
import type { GameView, RoundView } from "@/lib/game/rules";

const round = (over: Partial<RoundView>): RoundView => ({
  index: 0,
  step: 0,
  done: true,
  solvedAtStep: null,
  points: 0,
  guesses: [],
  answer: null,
  ...over,
});

describe("todayInSofia", () => {
  it("сменя деня в полунощ българско време, не UTC", () => {
    // 23.10.2026 22:30 UTC = 24.10.2026 01:30 в София (UTC+3, лятно време)
    expect(todayInSofia(new Date("2026-10-23T22:30:00Z"))).toBe("2026-10-24");
    expect(todayInSofia(new Date("2026-10-23T20:30:00Z"))).toBe("2026-10-23");
    // зимно време (UTC+2)
    expect(todayInSofia(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
  });

  it("formatDate", () => expect(formatDate("2026-10-23")).toBe("23.10.2026"));
});

describe("seededRandom", () => {
  it("една дата → една и съща последователност", () => {
    const a = seededRandom("2026-10-23");
    const b = seededRandom("2026-10-23");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    seqA.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    seqA.forEach((x) => expect(x).toBeLessThan(1));
  });

  it("различни дати → различни последователности", () => {
    expect(seededRandom("2026-10-23")()).not.toBe(seededRandom("2026-10-24")());
  });
});

describe("квадратчета за споделяне", () => {
  it("познато от първия път", () => {
    expect(roundSquares(round({ solvedAtStep: 0, guesses: [{ step: 0, kind: "guess", deezerId: "1", title: "", artist: "", correct: true }] }))).toBe(
      "🟩⬛⬛⬛⬛",
    );
  });

  it("грешно, пропуснато, познато", () => {
    expect(
      roundSquares(
        round({
          solvedAtStep: 2,
          guesses: [
            { step: 0, kind: "guess", deezerId: "1", title: "", artist: "", correct: false },
            { step: 1, kind: "skip" },
            { step: 2, kind: "guess", deezerId: "2", title: "", artist: "", correct: true },
          ],
        }),
      ),
    ).toBe("🟥⬜🟩⬛⬛");
  });

  it("текстът съдържа датата, резултата и линка", () => {
    const game: GameView = {
      id: "x",
      label: "",
      rounds: [round({ solvedAtStep: 0, points: 100, guesses: [{ step: 0, kind: "guess", deezerId: "1", title: "", artist: "", correct: true }] })],
      currentRound: null,
      total: 100,
      finished: true,
    };
    const text = shareText(game, "2026-10-23", "https://example.bg/dnevno");
    expect(text).toContain("23.10.2026");
    expect(text).toContain("100/1000");
    expect(text).toContain("🟩⬛⬛⬛⬛");
    expect(text.endsWith("https://example.bg/dnevno")).toBe(true);
  });
});
