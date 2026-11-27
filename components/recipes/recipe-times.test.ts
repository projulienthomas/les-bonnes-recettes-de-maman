import { describe, expect, it } from "vitest";
import fr from "@/i18n/dictionaries/fr.json";
import { getRecipeCardTimes, shortenRecipeTime } from "./recipe-times";

describe("getRecipeCardTimes", () => {
  it("lists prep, cook and total times with their labels", () => {
    expect(getRecipeCardTimes(fr, {
      prepTime: "40 min",
      cookTime: "30 min",
      totalTime: "1 h 10",
      timeLabel: "1 h 10",
    })).toEqual([
      { key: "prepTime", label: "Préparation", value: "40 min" },
      { key: "cookTime", label: "Cuisson", value: "30 min" },
      { key: "totalTime", label: "Temps total", value: "1 h 10" },
    ]);
  });

  it("leaves out an empty cook time", () => {
    expect(getRecipeCardTimes(fr, {
      prepTime: "5 min",
      cookTime: "",
      totalTime: "5 min",
      timeLabel: "5 min",
    }).map(({ key }) => key)).toEqual(["prepTime", "totalTime"]);
  });

  it("falls back to the time label until the backend sends the total time", () => {
    expect(getRecipeCardTimes(fr, {
      prepTime: "",
      cookTime: "",
      timeLabel: "50 min",
    })).toEqual([{ key: "totalTime", label: "Temps total", value: "50 min" }]);
  });
});

describe("shortenRecipeTime", () => {
  it.each([
    ["50 min", "50 min"],
    ["1 h 10 min", "1 h 10 min"],
    ["≈ 1 h 20", "≈ 1 h 20"],
    ["55–65 min", "55–65 min"],
    ["1 u à 1 u 05", "1 u à 1 u 05"],
    ["1 h 20 à 1 h 25, hors refroidissement", "1 h 20 à 1 h 25"],
    ["1 h 30 (45 min en cocotte-minute)", "1 h 30"],
    ["30 à 40 min selon le format", "30 à 40 min"],
    ["30 min + 10 à 12 h de repos", "30 min + 10 à 12 h"],
    ["35 min + 2 h 35 resting", "35 min + 2 h 35"],
    ["1 h 15 + 1 nuit de repos", "1 h 15 +"],
    ["1 h 15 + overnight rest", "1 h 15 +"],
    ["Une nuit", "Une nuit"],
  ])("shortens %s to %s", (value, expected) => {
    expect(shortenRecipeTime(value)).toBe(expected);
  });
});
