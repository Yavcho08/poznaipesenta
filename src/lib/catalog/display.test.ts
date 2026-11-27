import { describe, expect, it } from "vitest";
import { computeDisplayNames, shownArtist, shownTitle } from "./display";

const base = { isrc: null, artistId: null, titleOverride: null, artists: [] };

describe("computeDisplayNames", () => {
  const byId = new Map([
    ["azis", "Азис"],
    ["galena", "Галена"],
    ["fiki", "Фики"],
  ]);
  const names = { byId, byKey: new Map([["kamelia", "Камелия"]]) };
  it("латинско заглавие → кирилското от друго издание, версията остава", () => {
    const r = computeDisplayNames(
      [
        { ...base, id: "a", title: "Obrechi me na liubov", artistName: "Azis", artistId: "azis" },
        { ...base, id: "b", title: "Обречи ме на любов", artistName: "Азис", artistId: "azis" },
        { ...base, id: "c", title: "Obrechi me na liubov (Remix)", artistName: "Azis", artistId: "azis" },
      ],
      names,
    );
    expect(r.get("a")).toEqual({ displayTitle: "Обречи ме на любов", displayArtist: "Азис" });
    expect(r.get("b")).toEqual({ displayTitle: null, displayArtist: null });
    expect(r.get("c")?.displayTitle).toBe("Обречи ме на любов (Remix)");
  });
  it("същото ISRC, но различно заглавие (превод) — не се сменя", () => {
    const r = computeDisplayNames(
      [
        { ...base, id: "a", title: "Hot", artistName: "Azis", isrc: "BGA001", artistId: "azis" },
        { ...base, id: "b", title: "Горещо", artistName: "Азис", isrc: "BGA001", artistId: "azis" },
      ],
      names,
    );
    expect(r.get("a")?.displayTitle).toBeNull();
  });
  it("дует: всички артисти на кирилица; override от админа има предимство", () => {
    const r = computeDisplayNames(
      [
        {
          ...base,
          id: "a",
          title: "Ti si mi",
          artistName: "Galena & Fiki",
          artistId: "galena",
          titleOverride: "Ти си ми",
          artists: [
            { artistId: "galena", name: "Galena", role: "main", position: 0 },
            { artistId: "fiki", name: "Fiki", role: "featured", position: 1 },
          ],
        },
      ],
      names,
    );
    expect(r.get("a")).toEqual({ displayTitle: "Ти си ми", displayArtist: "Галена & Фики" });
  });
  it("песен без връзка към артист — по името („Kamelia“ → „Камелия“)", () => {
    const r = computeDisplayNames([{ ...base, id: "a", title: "Prikazen san", artistName: "Kamelia" }], names);
    expect(r.get("a")?.displayArtist).toBe("Камелия");
  });
  it("shownTitle / shownArtist", () => {
    expect(shownTitle({ title: "X", displayTitle: "Х" })).toBe("Х");
    expect(shownTitle({ title: "X", displayTitle: null })).toBe("X");
    expect(shownArtist({ artistName: "Azis" })).toBe("Azis");
  });
});
