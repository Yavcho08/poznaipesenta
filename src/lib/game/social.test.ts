import { describe, expect, it } from "vitest";
import { computeStats, type DailyHistory } from "@/lib/game/daily-stats";
import { cleanPlayerName, rankBest, rankOf } from "@/lib/game/leaderboard";

const rec = (total: number, steps: (number | null)[] = []) => ({ total, solved: steps.filter((s) => s !== null).length, steps });

describe("дневна статистика", () => {
  it("серия от поредни дни до днес", () => {
    const h: DailyHistory = { "2026-10-22": rec(300), "2026-10-23": rec(500), "2026-10-24": rec(700) };
    expect(computeStats(h, "2026-10-24")).toMatchObject({ played: 3, currentStreak: 3, bestStreak: 3, best: 700, average: 500 });
  });

  it("днес още не е изиграно → серията брои до вчера, не се скъсва", () => {
    const h: DailyHistory = { "2026-10-23": rec(100), "2026-10-24": rec(100) };
    expect(computeStats(h, "2026-10-25").currentStreak).toBe(2);
  });

  it("пропуснат ден скъсва серията, но най-добрата се помни", () => {
    const h: DailyHistory = { "2026-10-01": rec(1), "2026-10-02": rec(1), "2026-10-03": rec(1), "2026-10-10": rec(1) };
    expect(computeStats(h, "2026-10-10")).toMatchObject({ currentStreak: 1, bestStreak: 3 });
  });

  it("серия през края на месеца", () => {
    const h: DailyHistory = { "2026-10-31": rec(1), "2026-11-01": rec(1) };
    expect(computeStats(h, "2026-11-01").currentStreak).toBe(2);
  });

  it("разпределение по стъпки + непознати", () => {
    const h: DailyHistory = { "2026-10-24": rec(0, [0, 0, 2, null, 4]) };
    expect(computeStats(h, "2026-10-24").distribution).toEqual([2, 0, 1, 0, 1, 1]);
  });

  it("празна история", () => {
    expect(computeStats({}, "2026-10-24")).toMatchObject({ played: 0, currentStreak: 0, bestStreak: 0, average: 0 });
  });
});

describe("класация", () => {
  const e = (name: string, total: number, at = 0) => ({ name, total, at });

  it("всеки веднъж, с най-добрия резултат (без значение от главни букви)", () => {
    const r = rankBest([e("Мария", 300), e("мария", 700), e("Иван", 500)]);
    expect(r.map((x) => `${x.name}:${x.total}`)).toEqual(["мария:700", "Иван:500"]);
  });

  it("равни точки делят място, по-ранният е отпред", () => {
    const r = rankBest([e("А", 500, 2), e("Б", 500, 1), e("В", 300)]);
    expect(r.map((x) => `${x.name}#${x.rank}`)).toEqual(["Б#1", "А#1", "В#3"]);
  });

  it("място на играч", () => {
    const all = [e("А", 900), e("Б", 500), e("В", 700)];
    expect(rankOf(all, "в")).toBe(2);
    expect(rankOf(all, "Г")).toBeNull();
  });

  it("име: изчистване и ограничение", () => {
    expect(cleanPlayerName("  Мария   Петрова  ")).toBe("Мария Петрова");
    expect(cleanPlayerName("   ")).toBeNull();
    expect(cleanPlayerName("x".repeat(40))).toHaveLength(20);
  });
});
