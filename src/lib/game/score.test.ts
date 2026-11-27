import { describe, expect, it } from "vitest";
import { normalizedScore } from "./score";

describe("normalizedScore", () => {
  it("10 въпроса по 100 → максимум 1000 във всеки режим", () => {
    expect(normalizedScore("listen", 1000, 10, 10)).toBe(1000);
    expect(normalizedScore("cover", 640, 10, 8)).toBe(640);
    expect(normalizedScore("year", 1000, 10, 10)).toBe(1000);
  });
  it("хронологията (5 рунда) се мащабира до 1000", () => {
    expect(normalizedScore("order", 500, 5, 5)).toBe(1000);
    expect(normalizedScore("order", 260, 5, 1)).toBe(520);
  });
  it("серия: 100 за верен отговор, таван 1000", () => {
    expect(normalizedScore("higher", 70, 8, 7)).toBe(700);
    expect(normalizedScore("newer", 300, 30, 30)).toBe(1000);
  });
});
