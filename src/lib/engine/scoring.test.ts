import { describe, expect, it } from "vitest";
import { evaluate, inputFits, isQuizFinished, orderPoints, yearPoints } from "./scoring";
import type { StoredQuestion } from "./types";

describe("yearPoints", () => {
  it("точно = 100, по 20 по-малко за всяка година, от 5 нагоре = 0", () => {
    expect(yearPoints(2005, 2005)).toBe(100);
    expect(yearPoints(2004, 2005)).toBe(80);
    expect(yearPoints(2007, 2005)).toBe(60);
    expect(yearPoints(2001, 2005)).toBe(20);
    expect(yearPoints(2000, 2005)).toBe(0);
    expect(yearPoints(1980, 2005)).toBe(0);
  });
});

describe("orderPoints", () => {
  const years = { a: 1998, b: 2003, c: 2010, d: 2015, e: 2021 };
  it("правилен ред = 100, обратен = 0", () => {
    expect(orderPoints(["a", "b", "c", "d", "e"], years)).toBe(100);
    expect(orderPoints(["e", "d", "c", "b", "a"], years)).toBe(0);
  });
  it("една разменена съседна двойка = 90", () => {
    expect(orderPoints(["b", "a", "c", "d", "e"], years)).toBe(90);
  });
  it("песни от една година могат да са в произволен ред", () => {
    expect(orderPoints(["y", "x"], { x: 2000, y: 2000 })).toBe(100);
  });
});

const coverQ: StoredQuestion = {
  public: { kind: "cover", artist: null, steps: 5, options: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, label: id })) },
  answer: { kind: "option", id: "c", label: "c" },
  reveal: null,
};

describe("evaluate — корица", () => {
  it("точки по стъпка 100/80/60/40/20", () => {
    expect(evaluate("cover", coverQ, [], { kind: "option", id: "c" })).toEqual({ correct: true, points: 100, done: true });
    const two = [
      { input: { kind: "skip" as const }, correct: false },
      { input: { kind: "option" as const, id: "a" }, correct: false },
    ];
    expect(evaluate("cover", coverQ, two, { kind: "option", id: "c" }).points).toBe(60);
  });
  it("грешка на 5-ата стъпка приключва рунда с 0", () => {
    const four = Array.from({ length: 4 }, () => ({ input: { kind: "skip" as const }, correct: false }));
    expect(evaluate("cover", coverQ, four, { kind: "skip" })).toEqual({ correct: false, points: 0, done: true });
    expect(evaluate("cover", coverQ, four.slice(0, 2), { kind: "skip" }).done).toBe(false);
  });
});

describe("evaluate — серия и избор", () => {
  const pair: StoredQuestion = {
    public: { kind: "pair", prompt: "", left: { id: "left", title: "", artist: "", cover: null }, right: { id: "right", title: "", artist: "", cover: null } },
    answer: { kind: "pair", correct: "right", left: "2004", right: "2015" },
    reveal: null,
  };
  it("по-нова: 10 точки за верен отговор", () => {
    expect(evaluate("newer", pair, [], { kind: "pair", pick: "right" })).toEqual({ correct: true, points: 10, done: true });
    expect(evaluate("newer", pair, [], { kind: "pair", pick: "left" })).toEqual({ correct: false, points: 0, done: true });
  });
  it("серията свършва при първата грешка", () => {
    expect(isQuizFinished("newer", [{ done: true, correct: true }, { done: true, correct: false }, { done: false, correct: false }])).toBe(true);
    expect(isQuizFinished("newer", [{ done: true, correct: true }, { done: false, correct: false }])).toBe(false);
    expect(isQuizFinished("year", [{ done: true, correct: false }, { done: false, correct: false }])).toBe(false);
  });
});

describe("inputFits", () => {
  it("отказва ход, който не е за този въпрос", () => {
    expect(inputFits(coverQ, { kind: "skip" })).toBe(true);
    expect(inputFits(coverQ, { kind: "option", id: "zzz" })).toBe(false);
    expect(inputFits(coverQ, { kind: "year", year: 2000 })).toBe(false);
  });
  it("хронология: всички id-та точно по веднъж", () => {
    const q: StoredQuestion = {
      public: { kind: "order", items: ["a", "b"].map((id) => ({ id, title: id, artist: "", cover: null })) },
      answer: { kind: "order", ids: ["a", "b"], years: { a: 1, b: 2 } },
      reveal: null,
    };
    expect(inputFits(q, { kind: "order", ids: ["b", "a"] })).toBe(true);
    expect(inputFits(q, { kind: "order", ids: ["a", "a"] })).toBe(false);
    expect(inputFits(q, { kind: "order", ids: ["a"] })).toBe(false);
  });
});
