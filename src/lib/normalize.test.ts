import { describe, expect, it } from "vitest";
import {
  artistKey,
  cleanTitle,
  featuredInTitle,
  isSameSong,
  looseKey,
  mainArtist,
  queryVariants,
  songKey,
  splitArtists,
  titleKey,
  toCyrillic,
  transliterate,
} from "@/lib/normalize";

describe("transliterate (официален стандарт)", () => {
  it.each([
    ["Цветелина Янева", "tsvetelina yaneva"],
    ["Деси Слава", "desi slava"],
    ["Щастие", "shtastie"],
    ["Жълта звезда", "zhalta zvezda"],
    ["София", "sofia"],
    ["Юлия", "yulia"],
    ["Хубавица", "hubavitsa"],
    ["Чуй ме", "chuy me"],
  ])("%s → %s", (input, expected) => {
    expect(transliterate(input)).toBe(expected);
  });
});

describe("toCyrillic", () => {
  it.each([
    ["Azis", "азис"],
    ["Preslava", "преслава"],
    ["Tsvetelina Yaneva", "цветелина янева"],
    ["Sofi Marinova", "софи маринова"],
    ["shtastie", "щастие"],
    ["Djena", "джена"],
  ])("%s → %s", (input, expected) => {
    expect(toCyrillic(input)).toBe(expected);
  });
});

describe("looseKey: кирилица и различни латински изписвания дават един ключ", () => {
  it.each([
    ["Цветелина Янева", "Tsvetelina Yaneva"],
    ["Цветелина Янева", "Cvetelina Yaneva"],
    ["Няма накъде", "Nyama Nakade"],
    ["Няма накъде", "Niama nakade"],
    ["Никой не може", "Nikoy ne moje"],
    ["Напипай го", "Napipay go"],
    ["Обичам те", "Obicham te"],
    ["Казах НЕ", 'Kazah "NE"'],
    ["Джена", "Djena"],
    ["Деси Слава", "Desi Slava"],
    ["Като тебе втори няма", "Kato Tebe Vtori Nyama"],
    ["Жива рана", "Jiva rana"],
  ])("%s ≡ %s", (a, b) => {
    expect(looseKey(a)).toBe(looseKey(b));
  });

  it("различни заглавия остават различни", () => {
    expect(looseKey("Мразиш ли ме")).not.toBe(looseKey("Обичаш ли ме"));
    expect(looseKey("Хоп")).not.toBe(looseKey("Хубавица"));
  });

  it("игнорира пунктуация, главни букви и диакритика", () => {
    expect(looseKey("Ти, за мен си само СЕКС!")).toBe(looseKey("ти за мен си само секс"));
    expect(looseKey("Café")).toBe(looseKey("cafe"));
  });
});

describe("cleanTitle", () => {
  it.each([
    ["Делник и празник (feat. Kali)", "Делник и празник"],
    ["Хоп (DJ Damyan Remix)", "Хоп"],
    ["Хубавица - Remix", "Хубавица"],
    ["Mangava Tu - Radio Edit", "Mangava Tu"],
    ["Обичам те (Live)", "Обичам те"],
    ["Сен Тропе [Original Mix]", "Сен Тропе"],
    ["Пистолет (Ремикс)", "Пистолет"],
    ["Като тебе втори няма (На живо)", "Като тебе втори няма"],
    ["Мразя те ft. Azis", "Мразя те"],
    ["Сен Тропе - Remastered 2024", "Сен Тропе"],
  ])("%s → %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });

  it("не пипа скоби, които са част от заглавието", () => {
    expect(cleanTitle("А+Г=ВНЛ (Азис и Галена)")).toBe("А+Г=ВНЛ (Азис и Галена)");
  });

  it("не реже тире без дума за версия", () => {
    expect(cleanTitle("Ало - ало")).toBe("Ало - ало");
  });
});

describe("артисти", () => {
  it.each([
    ["Галена feat. Фики", "Галена"],
    ["Galena & Fiki", "Galena"],
    ["DONIKA, Galena & Azis", "DONIKA"],
    ["Malina x Azis", "Malina"],
    ["Азис и Галена", "Азис"],
    ["Цветелина Янева", "Цветелина Янева"],
  ])("mainArtist(%s) = %s", (input, expected) => {
    expect(mainArtist(input)).toBe(expected);
  });

  it("splitArtists връща всички", () => {
    expect(splitArtists("DONIKA, Galena & Azis")).toEqual(["DONIKA", "Galena", "Azis"]);
  });

  it("featuredInTitle вади гостите от заглавието", () => {
    expect(featuredInTitle("Делник и празник (feat. Kali)")).toEqual(["Kali"]);
    expect(featuredInTitle("Хубавица")).toEqual([]);
    expect(featuredInTitle("Rein Me In (with Olivia Dean)")).toEqual(["Olivia Dean"]);
    expect(cleanTitle("Rein Me In (with Olivia Dean)")).toBe("Rein Me In");
  });

  it("artistKey сравнява кирилица и латиница", () => {
    expect(artistKey("Азис")).toBe(artistKey("Azis"));
    expect(artistKey("Софи Маринова")).toBe(artistKey("Sofi Marinova"));
    expect(artistKey("Анелия feat. Азис")).toBe(artistKey("Aneliya"));
  });
});

describe("isSameSong (проверка на отговора)", () => {
  const answer = { title: "Няма накъде", artist: "Азис" };

  it("приема същата песен на латиница", () => {
    expect(isSameSong(answer, { title: "Nyama Nakade", artist: "Azis" })).toBe(true);
  });

  it("приема ремикс, live и radio edit версии", () => {
    expect(isSameSong(answer, { title: "Няма накъде (Remix)", artist: "Azis" })).toBe(true);
    expect(isSameSong(answer, { title: "Nyama Nakade - Live", artist: "Азис" })).toBe(true);
    expect(isSameSong(answer, { title: "Няма накъде - Radio Edit", artist: "Azis" })).toBe(true);
  });

  it("приема дует, изписан с различен основен артист", () => {
    const duet = { title: "Тази дискотека", artist: "Galin" };
    expect(isSameSong(duet, { title: "Тази дискотека", artist: "Galin & Azis" })).toBe(true);
    expect(isSameSong(duet, { title: "Tazi diskoteka", artist: "Azis feat. Galin" })).toBe(true);
    expect(isSameSong(duet, { title: "Тази дискотека (feat. Galin)", artist: "Azis" })).toBe(true);
  });

  it("отхвърля друга песен на същия артист", () => {
    expect(isSameSong(answer, { title: "Хоп", artist: "Азис" })).toBe(false);
  });

  it("отхвърля същото заглавие от друг артист", () => {
    expect(isSameSong({ title: "Хубавица", artist: "Donika" }, { title: "Хубавица", artist: "Ork. Okey" })).toBe(
      false,
    );
  });

  it("реални поп-фолк хитове", () => {
    expect(isSameSong({ title: "Пистолет", artist: "Medi" }, { title: "Pistolet", artist: "Медина" })).toBe(false);
    expect(isSameSong({ title: "Пистолет", artist: "Medi" }, { title: "Pistolet", artist: "Medi" })).toBe(true);
    expect(
      isSameSong({ title: "Kazah \"NE\"", artist: "Fiki" }, { title: "Казах НЕ", artist: "Фики" }),
    ).toBe(true);
    expect(
      isSameSong(
        { title: "Като тебе втори няма", artist: "Azis & Vanko 1" },
        { title: "Kato Tebe Vtori Nyama", artist: "Azis" },
      ),
    ).toBe(true);
  });
});

describe("songKey (премахване на дубликати)", () => {
  it("една песен от различни албуми/версии дава един ключ", () => {
    expect(songKey("Хоп", "Азис")).toBe(songKey("Hop (Remix)", "Azis feat. Malina"));
  });

  it("titleKey игнорира версията", () => {
    expect(titleKey("Сен Тропе - Remastered")).toBe(titleKey("Sen Trope"));
  });
});

describe("queryVariants", () => {
  it("кирилица → добавя латиница", () => {
    expect(queryVariants("  Преслава ")).toEqual(["Преслава", "preslava"]);
  });

  it("латиница → добавя кирилица", () => {
    expect(queryVariants("galena")).toEqual(["galena", "галена"]);
  });

  it("цифри без букви → само оригиналът", () => {
    expect(queryVariants("2000")).toEqual(["2000"]);
  });
});
