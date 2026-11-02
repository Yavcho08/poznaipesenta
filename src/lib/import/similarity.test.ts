import { describe, expect, it } from "vitest";
import { dice, MATCH_THRESHOLD, matchScore, searchQueryFor } from "@/lib/import/similarity";

describe("dice", () => {
  it("еднакви низове = 1", () => expect(dice("hubavica", "hubavica")).toBe(1));
  it("напълно различни = 0", () => expect(dice("abc", "xyz")).toBe(0));
  it("близки > 0.5", () => expect(dice("nyamanakade", "niamanakade")).toBeGreaterThan(0.5));
});

describe("matchScore", () => {
  it("същата песен, кирилица срещу латиница", () => {
    const s = matchScore(
      { title: "Няма накъде", artists: ["Азис"], durationMs: 215000 },
      { title: "Nyama Nakade", artist: "Azis", duration: 214 },
    );
    expect(s).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("ремикс версия от Spotify срещу оригинал в Deezer", () => {
    const s = matchScore(
      { title: "Хубавица - Remix", artists: ["Donika", "Galena", "Azis"] },
      { title: "Хубавица", artist: "Donika" },
    );
    expect(s).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("дует: вторият артист в Spotify е основен в Deezer", () => {
    const s = matchScore({ title: "Тази дискотека", artists: ["Galin", "Azis"] }, { title: "Тази дискотека", artist: "Azis" });
    expect(s).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("същото заглавие от друг артист не минава", () => {
    const s = matchScore({ title: "Хубавица", artists: ["Donika"] }, { title: "Хубавица", artist: "Ork. Okey" });
    expect(s).toBeLessThan(MATCH_THRESHOLD);
  });

  it("друга песен на същия артист не минава", () => {
    const s = matchScore({ title: "Сен Тропе", artists: ["Азис"] }, { title: "Хоп", artist: "Azis" });
    expect(s).toBeLessThan(MATCH_THRESHOLD);
  });

  it("много различна продължителност сваля резултата", () => {
    const close = matchScore({ title: "Хоп", artists: ["Azis"], durationMs: 200000 }, { title: "Хоп", artist: "Azis", duration: 201 });
    const far = matchScore({ title: "Хоп", artists: ["Azis"], durationMs: 200000 }, { title: "Хоп", artist: "Azis", duration: 400 });
    expect(far).toBeLessThan(close);
  });
});

describe("searchQueryFor", () => {
  it("маха feat. и кавички", () => {
    expect(searchQueryFor({ title: 'Делник и празник (feat. Kali)', artists: ['Azis "A"'] })).toEqual({
      strict: 'artist:"Azis A" track:"Делник и празник"',
      loose: 'Azis "A" Делник и празник',
    });
  });
});
