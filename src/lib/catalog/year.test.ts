import { describe, expect, it } from "vitest";
import { dateYear, earliestYear, isrcYear, parseDeezerDate } from "./year";

const NOW = new Date("2026-11-25T12:00:00Z");

describe("isrcYear", () => {
  it("чете годината от позиции 6–7", () => {
    expect(isrcYear("BGA261585008", NOW)).toBe(2015);
    expect(isrcYear("GBDUW0000059", NOW)).toBe(2000);
    expect(isrcYear("USUM70312345", NOW)).toBe(2003);
  });

  it("90-те са 19xx", () => {
    expect(isrcYear("BGA009812345", NOW)).toBe(1998);
  });

  it("година след текущата се тълкува като 19xx; преди 1986 → null", () => {
    // 27 > 26 (текущата) → 1927 → преди ISRC → null
    expect(isrcYear("BGA002712345", NOW)).toBeNull();
    expect(isrcYear("BGA008512345", NOW)).toBeNull();
  });

  it("невалиден ISRC → null", () => {
    expect(isrcYear(null, NOW)).toBeNull();
    expect(isrcYear("", NOW)).toBeNull();
    expect(isrcYear("BG-A26-15-85008", NOW)).toBeNull();
  });
});

describe("dateYear", () => {
  it("от текст и от Date", () => {
    expect(dateYear("2003-05-01", NOW)).toBe(2003);
    expect(dateYear(new Date("2011-01-01T00:00:00Z"), NOW)).toBe(2011);
  });

  it("празна/нулева/бъдеща дата → null", () => {
    expect(dateYear("0000-00-00", NOW)).toBeNull();
    expect(dateYear(null, NOW)).toBeNull();
    expect(dateYear("2031-01-01", NOW)).toBeNull();
  });
});

describe("earliestYear", () => {
  it("най-ранната от валидните", () => {
    expect(earliestYear(2019, 2003, null, 2011)).toBe(2003);
    expect(earliestYear(null, undefined)).toBeNull();
    expect(earliestYear(0, 2005)).toBe(2005);
  });
});

describe("parseDeezerDate", () => {
  it("валидна дата → UTC полунощ", () => {
    expect(parseDeezerDate("2001-03-07")?.toISOString()).toBe("2001-03-07T00:00:00.000Z");
  });
  it("0000-00-00 и боклук → null", () => {
    expect(parseDeezerDate("0000-00-00")).toBeNull();
    expect(parseDeezerDate("вчера")).toBeNull();
    expect(parseDeezerDate(undefined)).toBeNull();
  });
});
