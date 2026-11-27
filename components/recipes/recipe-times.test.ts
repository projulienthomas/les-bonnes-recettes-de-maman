import { describe, expect, it } from "vitest";
import fr from "@/i18n/dictionaries/fr.json";
import { getRecipeCardTimes } from "./recipe-times";

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
