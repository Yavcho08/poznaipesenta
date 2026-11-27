import { describe, expect, it } from "vitest";
import { computeYears, dateYear, earliestYear, isrcYear, parseDeezerDate } from "./year";

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

describe("computeYears", () => {
  const key = (title: string, artist: string) => `${title.toLowerCase()}|${artist.toLowerCase()}`;
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const base = { albumId: null, albumDate: null, releaseDate: null, isrc: null };
  it("най-ранната година между изданията (по ISRC и по заглавие), албумът — най-ранната на песните", () => {
    const r = computeYears(
      [
        { ...base, id: "a", title: "Нещо горещо", artistName: "Камелия", isrc: "BGA410201116", albumId: "re", albumDate: d("2026-03-26") },
        { ...base, id: "b", title: "Друга", artistName: "Камелия", isrc: "BGA410201117", albumId: "re", albumDate: d("2026-03-26") },
        // Същото ISRC в компилация с друго изписване на заглавието
        { ...base, id: "c", title: "Neshto goreshto", artistName: "Kamelia", isrc: "BGA410201116", albumDate: d("2019-01-01") },
        // Същото заглавие без ISRC
        { ...base, id: "d", title: "Нещо горещо", artistName: "Камелия", albumDate: d("2010-05-05") },
      ],
      key,
      NOW,
    );
    expect(r.tracks.get("a")).toEqual({ year: 2002, reliable: true });
    expect(r.tracks.get("c")).toEqual({ year: 2002, reliable: true });
    expect(r.tracks.get("d")).toEqual({ year: 2002, reliable: true });
    expect(r.albums.get("re")).toBe(2002);
  });
  it("само дата от Deezer (без ISRC) не е надеждна", () => {
    const r = computeYears([{ ...base, id: "x", title: "X", artistName: "Y", albumDate: d("2026-01-01") }], key, NOW);
    expect(r.tracks.get("x")).toEqual({ year: 2026, reliable: false });
  });
});
