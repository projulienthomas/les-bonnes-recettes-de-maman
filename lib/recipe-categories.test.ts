import { describe, expect, it } from "vitest";
import {
  RECIPE_CATEGORIES,
  RECIPE_COURSE_CATEGORIES,
  RECIPE_TASTE_CATEGORIES,
  isRecipeCategory,
  resolveRecipeCategories,
  splitRecipeCategoryLabels,
  toLegacyTags,
} from "./recipe-categories";

describe("recipe categories", () => {
  it("lists the four courses in serving order, then the two tastes", () => {
    expect(RECIPE_COURSE_CATEGORIES).toEqual(["apero", "entree", "plat", "dessert"]);
    expect(RECIPE_TASTE_CATEGORIES).toEqual(["sucre", "sale"]);
    expect(RECIPE_CATEGORIES).toEqual(["apero", "entree", "plat", "dessert", "sucre", "sale"]);
  });

  it("recognises the new course categories instead of keeping them as legacy labels", () => {
    expect(isRecipeCategory("apero")).toBe(true);
    expect(isRecipeCategory("entree")).toBe(true);
    expect(isRecipeCategory("Apéro")).toBe(false);
    expect(resolveRecipeCategories({ categories: ["sale"], tags: ["apero", "entrée"] })).toEqual({
      categories: ["sale", "apero"],
      legacyCategoryLabels: ["entrée"],
    });
  });

  it("separates canonical categories from legacy labels", () => {
    expect(splitRecipeCategoryLabels(["dessert", " ancien ", "sale", "dessert"])).toEqual({
      categories: ["dessert", "sale"],
      legacyCategoryLabels: ["ancien"],
    });
  });

  it("merges migrated fields with legacy tags without losing labels", () => {
    expect(resolveRecipeCategories({
      categories: ["plat"],
      legacyCategoryLabels: ["famille"],
      tags: ["dessert"],
    })).toEqual({ categories: ["plat", "dessert"], legacyCategoryLabels: ["famille"] });
  });

  it("keeps a rollback-compatible tags representation", () => {
    expect(toLegacyTags(["sucre"], ["goûter"])).toEqual(["sucre", "goûter"]);
  });
});

describe("recipe category labels", () => {
  const expectedLabels = {
    fr: { apero: "Apéro", entree: "Entrée" },
    en: { apero: "Aperitif", entree: "Starter" },
    "pt-br": { apero: "Aperitivo", entree: "Entrada" },
    "nl-be": { apero: "Aperitief", entree: "Voorgerecht" },
  } as const;

  it.each(Object.entries(expectedLabels))(
    "labels every category in display order in %s",
    async (locale, labels) => {
      const dictionary = (await import(`../i18n/dictionaries/${locale}.json`)).default;
      const categories = dictionary.recipeList.categories as Record<string, string>;
      expect(Object.keys(categories)).toEqual([...RECIPE_CATEGORIES]);
      expect(categories).toMatchObject(labels);
      for (const label of Object.values(categories)) expect(label.trim()).not.toBe("");
    },
  );
});
