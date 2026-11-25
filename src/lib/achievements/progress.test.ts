import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, type PlayerStats } from "./definitions";
import { computeStreak, gameXp, levelFromXp, levelInfo, xpForLevel } from "./progress";

describe("нива", () => {
  it("прагове растат плавно", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(5)).toBe(919);
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(9));
  });
  it("нивото от XP е обратното на прага", () => {
    for (let level = 1; level < 60; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelFromXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(-5)).toBe(1);
  });
  it("levelInfo дава прогреса в нивото", () => {
    expect(levelInfo(150)).toEqual({ level: 2, xp: 150, into: 50, span: xpForLevel(3) - 100 });
  });
  it("XP за игра: точки + 50 + 100 за дневно", () => {
    expect(gameXp(400, false)).toBe(450);
    expect(gameXp(400, true)).toBe(550);
  });
});

describe("computeStreak", () => {
  it("дни поред до днес", () => {
    expect(computeStreak(["2026-11-23", "2026-11-24", "2026-11-25"], "2026-11-25")).toEqual({ current: 3, best: 3, playedToday: true });
  });
  it("до вчера още е жива (днешното може да се изиграе)", () => {
    expect(computeStreak(["2026-11-23", "2026-11-24"], "2026-11-25")).toEqual({ current: 2, best: 2, playedToday: false });
  });
  it("прекъсната серия → 0, но най-дългата се помни", () => {
    expect(computeStreak(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-20"], "2026-11-25")).toEqual({
      current: 0,
      best: 3,
      playedToday: false,
    });
  });
  it("през края на месеца и с повторения", () => {
    expect(computeStreak(["2026-10-31", "2026-11-01", "2026-11-01"], "2026-11-01").current).toBe(2);
  });
  it("празно", () => {
    expect(computeStreak([], "2026-11-25")).toEqual({ current: 0, best: 0, playedToday: false });
  });
});

const empty: PlayerStats = {
  songsSolved: 0, flash: 0, retroSolved: 0, newSolved: 0, gamesFinished: 0, gameTypes: [], perfectGames: 0, perfectDaily: 0,
  dailyGames: 0, streakBest: 0, nightGames: 0, earlyGames: 0, totalPoints: 0, expertAccuracy: 0, albumsCollected: 0,
  coverFirstStep: 0, yearExact: 0, orderPerfect: 0, pairStreakBest: 0, singerCorrect: 0, wordCorrect: 0, roomGames: 0, roomWins: 0,
};
const get = (code: string) => ACHIEVEMENTS.find((a) => a.code === code)!;
const unlocked = (code: string, s: Partial<PlayerStats>) => get(code).progress({ ...empty, ...s }) >= get(code).target;

describe("постижения", () => {
  it("поне 25, с уникални кодове", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.code)).size).toBe(ACHIEVEMENTS.length);
  });
  it("нищо не е отключено без игри", () => {
    expect(ACHIEVEMENTS.filter((a) => a.progress(empty) >= a.target)).toEqual([]);
  });
  it("условия", () => {
    expect(unlocked("flash", { flash: 1 })).toBe(true);
    expect(unlocked("flash_10", { flash: 9 })).toBe(false);
    expect(unlocked("flash_10", { flash: 10 })).toBe(true);
    expect(unlocked("streak_7", { streakBest: 7 })).toBe(true);
    expect(unlocked("artist_expert", { expertAccuracy: 0.89 })).toBe(false);
    expect(unlocked("artist_expert", { expertAccuracy: 0.9 })).toBe(true);
    expect(unlocked("all_modes", { gameTypes: ["listen", "cover", "newer", "higher", "year", "order", "album", "singer"] })).toBe(false);
    expect(unlocked("all_modes", { gameTypes: ["listen", "cover", "newer", "higher", "year", "order", "album", "singer", "word"] })).toBe(true);
    expect(unlocked("perfect_day", { perfectDaily: 1 })).toBe(true);
    expect(unlocked("room_winner", { roomWins: 1 })).toBe(true);
  });
});
