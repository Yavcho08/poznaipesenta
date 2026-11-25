import { describe, expect, it } from "vitest";
import { checkUsername, isOffensive } from "./username";

describe("checkUsername", () => {
  it("приема нормални имена на кирилица и латиница", () => {
    expect(checkUsername("  Мария  ")).toEqual({ ok: true, username: "Мария" });
    expect(checkUsername("pop_folk.fan-99")).toEqual({ ok: true, username: "pop_folk.fan-99" });
    expect(checkUsername("Иван   Петров")).toEqual({ ok: true, username: "Иван Петров" });
  });

  it("дължина 3–20", () => {
    expect(checkUsername("аб").ok).toBe(false);
    expect(checkUsername("а".repeat(21)).ok).toBe(false);
    expect(checkUsername("а".repeat(20)).ok).toBe(true);
  });

  it("само букви, цифри, интервал и _ . -; започва с буква или цифра", () => {
    expect(checkUsername("_skrit").ok).toBe(false);
    expect(checkUsername("име<script>").ok).toBe(false);
    expect(checkUsername("emoji🎤").ok).toBe(false);
  });

  it("отказва обидни думи и на кирилица, и на латиница", () => {
    expect(checkUsername("курва").ok).toBe(false);
    expect(checkUsername("KURVA_123").ok).toBe(false);
    expect(checkUsername("fuck.you").ok).toBe(false);
    expect(checkUsername("admin").ok).toBe(false);
  });
});

describe("isOffensive", () => {
  it("късите корени са забранени само като цяла дума", () => {
    expect(isOffensive("кур")).toBe(true);
    expect(isOffensive("Курабийка")).toBe(false);
    expect(isOffensive("Газела")).toBe(false);
    expect(isOffensive("ebay fan")).toBe(false);
  });
});
