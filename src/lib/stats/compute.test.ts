import { describe, expect, it } from "vitest";
import {
  overallAccuracy,
  albumStats,
  artistStats,
  decadeStats,
  fastestSongs,
  modeStats,
  percentileBetter,
  stepToSeconds,
  strongWeak,
  trainSongs,
  weeklyStats,
  type RoundRow,
} from "./compute";

let n = 0;
function row(p: Partial<RoundRow>): RoundRow {
  n++;
  return {
    gameId: "g1",
    gameType: "listen",
    gameTotal: 0,
    finishedAt: new Date("2026-11-25T10:00:00Z"),
    trackId: `t${n}`,
    title: `Песен ${n}`,
    artistId: "azis",
    artistName: "Азис",
    albumId: null,
    albumTitle: null,
    releaseYear: 2010,
    solvedStep: null,
    points: 0,
    answerMs: null,
    ...p,
  };
}

describe("artistStats (% по артист)", () => {
  it("точност, средна стъпка и различни познати песни", () => {
    const rows = [
      row({ solvedStep: 0, trackId: "a" }),
      row({ solvedStep: 2, trackId: "b" }),
      row({ solvedStep: 1, trackId: "a" }),
      row({ solvedStep: null }),
      row({ artistId: "gloria", artistName: "Глория", solvedStep: 4 }),
    ];
    const [azis, gloria] = artistStats(rows);
    expect(azis).toMatchObject({ artistId: "azis", played: 4, solved: 3, accuracy: 75, avgStep: 1, avgSeconds: 1, distinctSolved: 2 });
    expect(gloria).toMatchObject({ played: 1, solved: 1, accuracy: 100, avgSeconds: 10 });
  });

  it("брои само „Познай песента“", () => {
    expect(artistStats([row({ gameType: "year", points: 100 })])).toEqual([]);
  });

  it("без познати — средната стъпка е null", () => {
    expect(artistStats([row({})])[0]).toMatchObject({ accuracy: 0, avgStep: null, avgSeconds: null });
  });
});

describe("stepToSeconds", () => {
  it("интерполира между стъпките 0.2/1/2/5/10", () => {
    expect(stepToSeconds(0)).toBe(0.2);
    expect(stepToSeconds(1)).toBe(1);
    expect(stepToSeconds(1.5)).toBe(1.5);
    expect(stepToSeconds(2.5)).toBe(3.5);
    expect(stepToSeconds(4)).toBe(10);
  });
});

describe("percentileBetter", () => {
  it("дял на другите с по-ниска точност", () => {
    expect(percentileBetter(80, [50, 60, 90, 70])).toBe(75);
    expect(percentileBetter(10, [50])).toBe(0);
    expect(percentileBetter(80, [])).toBeNull();
  });
});

describe("групи", () => {
  it("по албум за артист", () => {
    const rows = [row({ albumId: "x", albumTitle: "Х", solvedStep: 0 }), row({ albumId: "x", albumTitle: "Х" }), row({ albumId: "y", albumTitle: "У", solvedStep: 1 })];
    expect(albumStats(rows, "azis")).toEqual([
      { key: "x", label: "Х", played: 2, solved: 1, accuracy: 50 },
      { key: "y", label: "У", played: 1, solved: 1, accuracy: 100 },
    ]);
  });
  it("по десетилетие", () => {
    const rows = [row({ releaseYear: 1999, solvedStep: 0 }), row({ releaseYear: 2003 }), row({ releaseYear: 2008, solvedStep: 1 })];
    expect(decadeStats(rows).map((d) => [d.label, d.accuracy])).toEqual([
      ["90-те", 100],
      ["00-те", 50],
    ]);
  });
  it("по режим (по игра, не по рунд) + точност по игра", () => {
    const rows = [
      row({ gameId: "a", gameTotal: 300, solvedStep: 1 }),
      row({ gameId: "a", gameTotal: 300 }),
      row({ gameId: "b", gameTotal: 500, gameScore: 500, solvedStep: 0 }),
      row({ gameId: "c", gameType: "year", gameTotal: 200 }),
      // неизигран рунд в серия — не се брои
      row({ gameId: "c", gameType: "year", gameTotal: 200, roundDone: false }),
    ];
    expect(modeStats(rows)).toEqual([
      { gameType: "listen", games: 2, avgTotal: 400, best: 500, played: 3, correct: 2, accuracy: 67 },
      { gameType: "year", games: 1, avgTotal: 200, best: 200, played: 1, correct: 0, accuracy: 0 },
    ]);
    expect(overallAccuracy(rows)).toEqual({ played: 4, correct: 2, accuracy: 50 });
  });
});

describe("weeklyStats", () => {
  it("12 седмици, празните също, по понеделник", () => {
    const now = new Date("2026-11-25T12:00:00Z"); // сряда
    const weeks = weeklyStats([row({ gameTotal: 300, solvedStep: 0 }), row({ gameId: "old", finishedAt: new Date("2026-11-17T08:00:00Z"), gameTotal: 100 })], now);
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toEqual({ week: "2026-11-23", games: 1, points: 300, accuracy: 100 });
    expect(weeks.at(-2)).toEqual({ week: "2026-11-16", games: 1, points: 100, accuracy: 0 });
    expect(weeks[0].games).toBe(0);
  });
});

describe("песни", () => {
  it("най-бързи и „тренирай тези“", () => {
    const rows = [
      row({ trackId: "fast", title: "Бърза", solvedStep: 0, answerMs: 900 }),
      row({ trackId: "slow", title: "Бавна", solvedStep: 3, answerMs: 9000 }),
      row({ trackId: "miss", title: "Трудна" }),
      row({ trackId: "miss", title: "Трудна" }),
      row({ trackId: "half", title: "Понякога", solvedStep: 2 }),
      row({ trackId: "half", title: "Понякога" }),
    ];
    expect(fastestSongs(rows).map((s) => s.title)).toEqual(["Бърза", "Понякога", "Бавна"]);
    expect(trainSongs(rows).map((s) => s.title)).toEqual(["Трудна"]);
  });
});

describe("strongWeak", () => {
  it("само артисти с поне 5 изиграни", () => {
    const stats = [
      { artistId: "a", name: "A", played: 10, solved: 9, accuracy: 90, avgStep: 1, avgSeconds: 1, distinctSolved: 9 },
      { artistId: "b", name: "B", played: 4, solved: 4, accuracy: 100, avgStep: 1, avgSeconds: 1, distinctSolved: 4 },
      { artistId: "c", name: "C", played: 6, solved: 1, accuracy: 17, avgStep: 3, avgSeconds: 5, distinctSolved: 1 },
    ];
    const { strong, weak } = strongWeak(stats, 1);
    expect(strong.map((s) => s.name)).toEqual(["A"]);
    expect(weak.map((s) => s.name)).toEqual(["C"]);
  });
});
