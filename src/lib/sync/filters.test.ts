import { describe, expect, it } from "vitest";
import { songKey } from "@/lib/normalize";
import { nonBulgarianCyrillic, selectNewTracks, titlesLookBulgarian, unwantedMatch } from "./filters";

const PATTERNS = ["remix", "live", "instrumental", "karaoke", "speed up", "sped up", "ремикс", "караоке"];

describe("unwantedMatch", () => {
  it("хваща версиите в заглавието и в title_version", () => {
    expect(unwantedMatch("Тази дискотека", "(DJ Remix)", PATTERNS)).toBe("remix");
    expect(unwantedMatch("Обичам те - Live", null, PATTERNS)).toBe("live");
    expect(unwantedMatch("Хоп (Speed Up)", null, PATTERNS)).toBe("speed up");
    expect(unwantedMatch("Песен - караоке", null, PATTERNS)).toBe("караоке");
    expect(unwantedMatch("Песен", "Instrumental", PATTERNS)).toBe("instrumental");
  });

  it("само цели думи", () => {
    expect(unwantedMatch("Oliver", null, PATTERNS)).toBeNull();
    expect(unwantedMatch("Delivery", null, PATTERNS)).toBeNull();
    expect(unwantedMatch("Живея, няма време", null, PATTERNS)).toBeNull();
  });
});

describe("selectNewTracks", () => {
  const c = (id: string, title: string, extra: Partial<{ version: string; artist: string; hasPreview: boolean }> = {}) => ({
    id,
    title,
    artist: extra.artist ?? "Azis",
    version: extra.version ?? null,
    hasPreview: extra.hasPreview ?? true,
  });

  it("пропуска без откъс, филтрирани и дубликати (с базата и вътре в списъка)", () => {
    const existing = new Set([songKey("Sen Trope", "Azis")]);
    const { keep, skipped } = selectNewTracks(
      [
        c("1", "Нова песен"),
        c("2", "Нова песен", { version: "(Radio Edit)" }), // същата песен — cleanTitle маха версията
        c("3", "Sen Trope"), // вече е в базата
        c("4", "Хоп", { version: "(Remix)" }),
        c("5", "Тиха", { hasPreview: false }),
        c("6", "Друга"),
      ],
      existing,
      PATTERNS,
    );
    expect(keep.map((k) => k.id)).toEqual(["1", "6"]);
    expect(Object.fromEntries(skipped.map((s) => [s.id, s.reason]))).toEqual({ "2": "duplicate", "3": "duplicate", "4": "filtered", "5": "no_preview" });
  });
});

describe("titlesLookBulgarian", () => {
  it("български заглавия минават", () => {
    expect(titlesLookBulgarian(["Ще откача", "Бебето ми", "Маракеш"])).toBe(true);
    expect(titlesLookBulgarian(["Шофьорът", "Кафе"])).toBe(true);
  });
  it("руски/украински — не", () => {
    expect(titlesLookBulgarian(["АРКАИМ", "Счастье просто быть вдвоем"])).toBe(false);
    expect(titlesLookBulgarian(["Літній роман", "Скажи"])).toBe(false);
    // Ограничение: руско заглавие без руски букви минава — тогава решава ISRC/правилото за артиста.
    expect(nonBulgarianCyrillic("Разноцветная душа")).toBe(false);
  });
  it("без кирилица — не (решава ISRC)", () => {
    expect(titlesLookBulgarian(["Podvodnitsa"])).toBe(false);
  });
});
