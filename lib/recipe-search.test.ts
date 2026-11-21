import { describe, expect, it } from "vitest";
import { matchesSearchQuery, normalizeSearchText } from "./recipe-search";

const matches = (text: string, query: string) =>
  matchesSearchQuery(normalizeSearchText(text), normalizeSearchText(query));

describe("matchesSearchQuery", () => {
  it("matches exact words, accents and partial words", () => {
    expect(matches("Gâteau au chocolat", "gateau")).toBe(true);
    expect(matches("Gâteau au chocolat", "choco")).toBe(true);
    expect(matches("Gâteau au chocolat", "")).toBe(true);
  });

  it("tolerates a typo", () => {
    expect(matches("Gâteau au chocolat", "choclat")).toBe(true);
    expect(matches("Gâteau au chocolat", "gataeu")).toBe(true);
    expect(matches("Cookies aux pépites de chocolat", "cokies")).toBe(true);
    expect(matches("Osso buco", "osso bucco")).toBe(true);
  });

  it("tolerates a typo in a word that is still being typed", () => {
    expect(matches("Gâteau au chocolat", "chocl")).toBe(true);
  });

  it("tolerates two typos in long words only", () => {
    expect(matches("Blanquette de veau", "blanqete")).toBe(true);
    expect(matches("Blanquette de veau", "blaqete")).toBe(false);
  });

  it("requires every word of the query", () => {
    expect(matches("Gâteau au chocolat", "gateau pommes")).toBe(false);
    expect(matches("Tarte aux pommes", "tarte pomme")).toBe(true);
  });

  it("does not match unrelated or very short words", () => {
    expect(matches("Tarte aux pommes", "flan")).toBe(false);
    expect(matches("Riz au lait", "ail")).toBe(false);
  });
});
