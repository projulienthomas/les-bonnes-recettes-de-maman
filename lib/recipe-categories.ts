/** Courses, in the order a meal is served. */
export const RECIPE_COURSE_CATEGORIES = ["apero", "entree", "plat", "dessert"] as const;

/** Dominant taste, for recipes that are not a course on their own (sauces, doughs, drinks). */
export const RECIPE_TASTE_CATEGORIES = ["sucre", "sale"] as const;

/** Display order: the four courses first, then the two tastes. */
export const RECIPE_CATEGORIES = [
  ...RECIPE_COURSE_CATEGORIES,
  ...RECIPE_TASTE_CATEGORIES,
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];
export type RecipeCourseCategory = (typeof RECIPE_COURSE_CATEGORIES)[number];
export type RecipeTasteCategory = (typeof RECIPE_TASTE_CATEGORIES)[number];

export type RecipeCategorySource = {
  categories?: readonly RecipeCategory[];
  legacyCategoryLabels?: readonly string[];
  tags?: readonly string[];
};

const recipeCategorySet = new Set<string>(RECIPE_CATEGORIES);

export function isRecipeCategory(value: string): value is RecipeCategory {
  return recipeCategorySet.has(value);
}

export function splitRecipeCategoryLabels(values: readonly string[]) {
  const categories: RecipeCategory[] = [];
  const legacyCategoryLabels: string[] = [];

  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) continue;
    if (isRecipeCategory(value)) {
      if (!categories.includes(value)) categories.push(value);
    } else if (!legacyCategoryLabels.includes(value)) {
      legacyCategoryLabels.push(value);
    }
  }

  return { categories, legacyCategoryLabels };
}

export function resolveRecipeCategories(source: RecipeCategorySource) {
  const fromTags = splitRecipeCategoryLabels(source.tags ?? []);
  return {
    categories: [...new Set([...(source.categories ?? []), ...fromTags.categories])],
    legacyCategoryLabels: [
      ...new Set([...(source.legacyCategoryLabels ?? []), ...fromTags.legacyCategoryLabels]),
    ],
  };
}

export function toLegacyTags(
  categories: readonly RecipeCategory[],
  legacyCategoryLabels: readonly string[] = [],
) {
  return [...categories, ...legacyCategoryLabels];
}
