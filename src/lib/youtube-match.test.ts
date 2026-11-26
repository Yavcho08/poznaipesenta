import { describe, expect, it } from "vitest";
import { bestVideo, formatViews, parseIsoDuration, videoMatches, type VideoCandidate } from "./youtube-match";

const track = { title: "Обречи ме на любов", artistName: "Азис", duration: 248 };
const v = (title: string, views: number, extra: Partial<VideoCandidate> = {}): VideoCandidate => ({
  id: title,
  title,
  channel: "Payner",
  views,
  duration: 260,
  ...extra,
});

describe("videoMatches", () => {
  it("приема официалния клип и на латиница", () => {
    expect(videoMatches(track, v("AZIS - OBRECHI ME NA LIUBOV / Азис - Обречи ме на любов, 2005", 1))).toBe(true);
    expect(videoMatches(track, v("Азис - Обречи ме на любов (Official Video)", 1))).toBe(true);
  });
  it("отхвърля кавър, live, караоке, текст, микс", () => {
    for (const t of ["Азис - Обречи ме на любов (cover)", "Азис - Обречи ме на любов LIVE", "Обречи ме на любов - Азис КАРАОКЕ", "Азис - Обречи ме на любов (Lyrics)", "Азис - Обречи ме на любов remix"]) {
      expect(videoMatches(track, v(t, 1))).toBe(false);
    }
  });
  it("иска и артиста (в заглавието или канала)", () => {
    expect(videoMatches(track, v("Обречи ме на любов", 1, { channel: "Друг" }))).toBe(false);
    expect(videoMatches(track, v("Обречи ме на любов", 1, { channel: "Azis Official" }))).toBe(true);
  });
  it("отхвърля часови миксове и откъси", () => {
    expect(videoMatches(track, v("Азис - Обречи ме на любов", 1, { duration: 3600 }))).toBe(false);
    expect(videoMatches(track, v("Азис - Обречи ме на любов", 1, { duration: 30 }))).toBe(false);
  });
  it("избира най-гледания подходящ", () => {
    const best = bestVideo(track, [v("Азис - Обречи ме на любов", 100), v("Азис - Обречи ме на любов cover", 900), v("AZIS - Obrechi me na liubov (Official)", 500)]);
    expect(best?.views).toBe(500);
  });
});

describe("помощни", () => {
  it("parseIsoDuration", () => {
    expect(parseIsoDuration("PT3M42S")).toBe(222);
    expect(parseIsoDuration("PT1H2M")).toBe(3720);
    expect(parseIsoDuration(undefined)).toBeNull();
  });
  it("formatViews", () => {
    expect(formatViews(1_234_567)).toBe("1,2 млн.");
    expect(formatViews(845_300)).toBe("845 хил.");
    expect(formatViews(2_100_000_000)).toBe("2,1 млрд.");
  });
});
