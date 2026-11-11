/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { RecipeCategory } from "../lib/recipe-categories";

const modules = import.meta.glob("./**/*.ts");
const password = "test-password";

function recipe(title = "Tarte mobile") {
  const localized = {
    title,
    author: "Maman",
    description: "Une recette prête à publier.",
    yieldLabel: "6 personnes",
    prepTime: "20 min",
    cookTime: "30 min",
    totalTime: "50 min",
    timeLabel: "50 min",
    temperature: "180 °C",
    ingredients: [
      {
        id: "ingredient-flour",
        name: "Farine",
        quantity: "200",
        unit: "g",
        notes: "",
      },
    ],
    sections: [
      {
        title: "Préparation",
        steps: [
          {
            id: "step-mix",
            text: "Mélanger puis cuire.",
            ingredientUses: [] as Array<{
              ingredientId: string;
              amount?: { quantity: string; unit: string };
            }>,
          },
        ],
      },
    ],
    subRecipes: [] as Array<{
      title: string;
      ingredients: Array<{
        id: string;
        name: string;
        quantity: string;
        unit: string;
        notes: string;
      }>;
    }>,
    notes: [],
  };

  return {
    defaultLocale: "fr" as const,
    referenceServings: 6,
    translations: { fr: localized, en: { ...localized, title: "Mobile tart" } },
    categories: ["dessert"] as RecipeCategory[],
  };
}

function draft(value = recipe()) {
  return value;
}

function storedLocalized(
  localized: ReturnType<typeof recipe>["translations"]["fr"],
  servings: { quantity: number; unit: string } | null = null,
) {
  return {
    ...localized,
    sections: localized.sections.map((section) => ({
      title: section.title,
      steps: section.steps.map((step) => step.text),
      stepDetails: section.steps,
    })),
    servings,
  };
}

async function uploadRecipeImage(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) =>
    ctx.storage.store(new Blob(["recipe-image"], { type: "image/jpeg" })),
  );
}

// Publication scenarios need an image. Preserve their revision assertions and
// existing image fixtures; upload/version behavior is exercised separately.
async function ensurePosterFixture(t: TestConvex<typeof schema>, slug: string) {
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("recipes").withIndex("by_slug", q => q.eq("slug", slug)).unique();
    if (!stored) throw new Error("Missing recipe fixture");
    const working = await ctx.db.query("recipeDrafts").withIndex("by_recipeId", q => q.eq("recipeId", stored._id)).unique();
    if (working && !working.heroImageUrl && !working.heroImageStorageId) {
      await ctx.db.patch(working._id, { heroImageUrl: "/images/test-poster.webp" });
    }
  });
}

describe("recipe working drafts", () => {
  test("a complete new recipe stays private until its poster is imported", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, { recipe: recipe(), adminPassword: password });
    await expect(t.mutation(api.recipes.publishDraft, {
      slug: created.slug, expectedRevision: 0, adminPassword: password,
    })).rejects.toThrow("RECIPE_NOT_READY");
    expect(await t.query(api.recipes.getBySlug, { slug: created.slug, locale: "fr" })).toBeNull();
    const storageId = await uploadRecipeImage(t);
    const image = await t.mutation(api.recipes.setHeroImage, {
      slug: created.slug, expectedRevision: 0, storageId, adminPassword: password,
    });
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug, expectedRevision: image.revision, adminPassword: password,
    });
    const published = await t.query(api.recipes.getBySlug, { slug: created.slug, locale: "fr" });
    expect(published?.heroImageUrl).toBeTruthy();
  });

  test("image-only maintenance preserves legacy content and rejects concurrent content edits", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Legacy recipe");
    content.translations.fr.yieldLabel = "";
    content.translations.en.yieldLabel = "";
    const recipeId = await t.run((ctx) => ctx.db.insert("recipes", {
      slug: "legacy-poster",
      heroImageUrl: "/old-photo.png",
      defaultLocale: "fr",
      translations: {
        fr: storedLocalized(content.translations.fr),
        en: storedLocalized(content.translations.en),
      },
      categories: ["dessert"],
      status: "published",
    }));
    const before = await t.run((ctx) => ctx.db.get(recipeId));
    const storageId = await uploadRecipeImage(t);
    const saved = await t.mutation(api.recipes.setHeroImage, {
      slug: "legacy-poster", storageId, expectedRevision: 0, adminPassword: password,
    });
    await expect(t.mutation(internal.recipes.publishImageOnly, {
      slug: "legacy-poster", expectedRevision: saved.revision - 1,
    })).rejects.toThrow("RECIPE_DRAFT_CONFLICT");
    await t.mutation(internal.recipes.publishImageOnly, {
      slug: "legacy-poster", expectedRevision: saved.revision,
    });
    const after = await t.run((ctx) => ctx.db.get(recipeId));
    expect(after).toEqual({ ...before, heroImageStorageId: storageId, heroImageUrl: "" });
    await t.run(async (ctx) => {
      const working = await ctx.db.query("recipeDrafts").withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId)).unique();
      await ctx.db.patch(working!._id, {
        translations: { ...working!.translations, fr: { ...working!.translations.fr, title: "Unpublished edit" } },
        revision: saved.revision + 1,
      });
    });
    await expect(t.mutation(internal.recipes.publishImageOnly, {
      slug: "legacy-poster", expectedRevision: saved.revision + 1,
    })).rejects.toThrow("RECIPE_CONTENT_CHANGED");
    expect(await t.run((ctx) => ctx.db.get(recipeId))).toEqual(after);
  });

  test("catalog mutation return contracts remain stable", () => {
    type CatalogSyncResult = {
      inserted: number;
      updated: number;
      total: number;
    };

    expectTypeOf<FunctionReturnType<typeof api.recipes.seed>>().toEqualTypeOf<
      CatalogSyncResult
    >();
    expectTypeOf<
      FunctionReturnType<typeof api.recipes.syncProductionRecipe>
    >().toEqualTypeOf<CatalogSyncResult>();
    expectTypeOf<
      FunctionReturnType<typeof api.recipes.syncProduction>
    >().toEqualTypeOf<CatalogSyncResult & { removed: number }>();
  });

  test("legacy saves preserve existing step ingredient metadata", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Associations préservées");
    content.translations.fr.sections[0].steps[0].ingredientUses = [
      { ingredientId: "ingredient-flour" },
    ];
    const created = await t.mutation(api.recipes.create, {
      recipe: content,
      adminPassword: password,
    });
    const legacyNormalized = recipe("Titre modifié par un ancien onglet");
    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: legacyNormalized,
      expectedRevision: created.revision,
      preserveStepIngredientUses: true,
      adminPassword: password,
    });

    const editing = await t.query(api.recipes.getForEditing, {
      slug: created.slug,
      locale: "fr",
      adminPassword: password,
    });
    expect(
      editing?.translations.fr.sections[0].steps[0].ingredientUses,
    ).toEqual([{ ingredientId: "ingredient-flour" }]);
  });

  test("legacy saves reconcile duplicate ingredients and steps one-to-one", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Doublons préservés");
    content.translations.fr.ingredients.push({
      id: "ingredient-flour-2",
      name: "Farine",
      quantity: "200",
      unit: "g",
      notes: "",
    });
    content.translations.fr.sections[0].steps.push({
      id: "step-mix-2",
      text: "Mélanger puis cuire.",
      ingredientUses: [{ ingredientId: "ingredient-flour-2" }],
    });
    const created = await t.mutation(api.recipes.create, {
      recipe: content,
      adminPassword: password,
    });
    const legacyNormalized = structuredClone(content);
    legacyNormalized.translations.fr.ingredients[0].id = "legacy-main-0";
    legacyNormalized.translations.fr.ingredients[1].id = "legacy-main-1";
    legacyNormalized.translations.fr.sections[0].steps[0].id = "legacy-step-0";
    legacyNormalized.translations.fr.sections[0].steps[1].id = "legacy-step-1";
    legacyNormalized.translations.fr.sections[0].steps.forEach((step) => {
      step.ingredientUses = [];
    });

    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: legacyNormalized,
      expectedRevision: created.revision,
      preserveStepIngredientUses: true,
      adminPassword: password,
    });

    const editing = await t.query(api.recipes.getForEditing, {
      slug: created.slug,
      locale: "fr",
      adminPassword: password,
    });
    expect(
      editing?.translations.fr.ingredients.map((ingredient) => ingredient.id),
    ).toEqual(["ingredient-flour", "ingredient-flour-2"]);
    expect(
      editing?.translations.fr.sections[0].steps.map((step) => step.id),
    ).toEqual(["step-mix", "step-mix-2"]);
    expect(
      editing?.translations.fr.sections[0].steps[1].ingredientUses,
    ).toEqual([{ ingredientId: "ingredient-flour-2" }]);
  });

  test("legacy reconciliation does not move metadata when rows or outer collections are inserted", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Insertions préservées");
    content.translations.fr.subRecipes.push({
      title: "Crème",
      ingredients: [{
        id: "ingredient-cream",
        name: "Crème",
        quantity: "20",
        unit: "cl",
        notes: "",
      }],
    });
    content.translations.fr.sections[0].steps[0].ingredientUses = [
      { ingredientId: "ingredient-cream" },
    ];
    const created = await t.mutation(api.recipes.create, {
      recipe: content,
      adminPassword: password,
    });
    const legacyNormalized = structuredClone(content);
    legacyNormalized.translations.fr.ingredients.unshift({
      id: "legacy-new-ingredient",
      name: "Sucre",
      quantity: "50",
      unit: "g",
      notes: "",
    });
    legacyNormalized.translations.fr.subRecipes.unshift({
      title: "Coulis",
      ingredients: [{
        id: "legacy-new-sub-ingredient",
        name: "Fraises",
        quantity: "100",
        unit: "g",
        notes: "",
      }],
    });
    legacyNormalized.translations.fr.sections.unshift({
      title: "Décor",
      steps: [{
        id: "legacy-new-section-step",
        text: "Décorer le gâteau.",
        ingredientUses: [],
      }],
    });
    legacyNormalized.translations.fr.sections[1].steps.unshift({
      id: "legacy-new-step",
      text: "Peser le sucre.",
      ingredientUses: [],
    });
    legacyNormalized.translations.fr.sections[1].steps[1].ingredientUses = [];

    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: legacyNormalized,
      expectedRevision: created.revision,
      preserveStepIngredientUses: { fr: true, en: false },
      adminPassword: password,
    });

    const editing = await t.query(api.recipes.getForEditing, {
      slug: created.slug,
      locale: "fr",
      adminPassword: password,
    });
    expect(editing?.translations.fr.ingredients.map(({ id }) => id)).toEqual([
      "legacy-new-ingredient",
      "ingredient-flour",
    ]);
    expect(editing?.translations.fr.subRecipes.flatMap(({ ingredients }) =>
      ingredients.map(({ id }) => id),
    )).toEqual([
      "legacy-new-sub-ingredient",
      "ingredient-cream",
    ]);
    expect(editing?.translations.fr.sections.map(({ steps }) =>
      steps.map(({ id }) => id),
    )).toEqual([
      ["legacy-new-section-step"],
      ["legacy-new-step", "step-mix"],
    ]);
    expect(editing?.translations.fr.sections[1].steps[1].ingredientUses).toEqual([
      { ingredientId: "ingredient-cream" },
    ]);
  });

  test("legacy reconciliation is limited to the affected locale", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Locale ciblée");
    content.translations.fr.sections[0].steps[0].ingredientUses = [
      { ingredientId: "ingredient-flour" },
    ];
    content.translations.en = structuredClone(content.translations.fr);
    content.translations.en.title = "Targeted locale";
    content.translations.en.sections[0].steps[0].ingredientUses = [
      { ingredientId: "ingredient-flour" },
    ];
    const created = await t.mutation(api.recipes.create, {
      recipe: content,
      adminPassword: password,
    });
    const incoming = structuredClone(content);
    incoming.translations.fr.sections[0].steps[0].ingredientUses = [];
    incoming.translations.en.sections[0].steps[0].ingredientUses = [];

    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: incoming,
      expectedRevision: created.revision,
      preserveStepIngredientUses: { fr: true, en: false },
      adminPassword: password,
    });

    const editing = await t.query(api.recipes.getForEditing, {
      slug: created.slug,
      locale: "fr",
      adminPassword: password,
    });
    expect(editing?.translations.fr.sections[0].steps[0].ingredientUses).toEqual([
      { ingredientId: "ingredient-flour" },
    ]);
    expect(editing?.translations.en.sections[0].steps[0].ingredientUses).toEqual([]);
  });

  test("direct mutations reject invalid structured step references and oversized ids", async () => {
    const t = convexTest(schema, modules);
    const invalidReference = recipe("Référence invalide");
    invalidReference.translations.fr.sections[0].steps[0].ingredientUses = [
      { ingredientId: "missing" },
    ];
    await expect(t.mutation(api.recipes.create, {
      recipe: invalidReference,
      adminPassword: password,
    })).rejects.toThrow("RECIPE_INVALID_STEP_REFERENCES");

    const oversizedId = recipe("Identifiant trop long");
    oversizedId.translations.fr.ingredients[0].id = "x".repeat(101);
    await expect(t.mutation(api.recipes.create, {
      recipe: oversizedId,
      adminPassword: password,
    })).rejects.toThrow("RECIPE_LIMIT_EXCEEDED");

    const emptyIngredientId = recipe("Identifiant ingrédient vide");
    emptyIngredientId.translations.fr.ingredients[0].id = "";
    await expect(t.mutation(api.recipes.create, {
      recipe: emptyIngredientId,
      adminPassword: password,
    })).rejects.toThrow("RECIPE_INVALID_STEP_REFERENCES");

    const emptyStepId = recipe("Identifiant étape vide");
    emptyStepId.translations.fr.sections[0].steps[0].id = "";
    await expect(t.mutation(api.recipes.create, {
      recipe: emptyStepId,
      adminPassword: password,
    })).rejects.toThrow("RECIPE_INVALID_STEP_REFERENCES");
  });

  test("targeted seeding inserts only the requested recipe", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.recipes.seed, {
        adminPassword: password,
        slug: "mayonnaise",
      }),
    ).resolves.toEqual({ inserted: 1, updated: 0, total: 1 });
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "mayonnaise" }),
    ).resolves.toMatchObject({ title: "Mayonnaise", author: "Louis" });
    const stored = await t.run((ctx) =>
      ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "mayonnaise"))
        .unique(),
    );
    expect(stored).toMatchObject({
      status: "published",
      tags: ["sale"],
      translations: {
        fr: {
          servings: null,
          sections: [
            {
              steps: expect.any(Array),
              stepDetails: expect.any(Array),
            },
          ],
        },
      },
    });
    expect(stored?.translations.fr.sections[0]?.steps).toEqual(
      stored?.translations.fr.sections[0]?.stepDetails?.map(
        (step) => step.text,
      ),
    );
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.toBeNull();
  });

  test("targeted seeding leaves other recipes unchanged", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "amandin",
    });
    await t.run(async (ctx) => {
      const amandin = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "amandin"))
        .unique();
      if (!amandin) throw new Error("seed fixture missing");
      await ctx.db.patch(amandin._id, {
        translations: {
          ...amandin.translations,
          fr: { ...amandin.translations.fr, title: "Titre éditorial préservé" },
        },
      });
    });

    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "mayonnaise",
    });

    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.toMatchObject({ title: "Titre éditorial préservé" });
  });

  test("re-seeding validates preserved draft values before writing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "mayonnaise",
    });
    await t.run(async (ctx) => {
      const seeded = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "mayonnaise"))
        .unique();
      if (!seeded) throw new Error("seed fixture missing");
      await ctx.db.patch(seeded._id, { referenceServings: -1 });
    });

    await expect(
      t.mutation(api.recipes.seed, {
        adminPassword: password,
        slug: "mayonnaise",
      }),
    ).rejects.toThrow("RECIPE_LIMIT_EXCEEDED");
  });

  test("targeted production sync publishes only the requested recipe", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "banana-bread-du-kona-inn",
    });
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "amandin",
    });
    await t.run(async (ctx) => {
      const [bananaBread, amandin] = await Promise.all([
        ctx.db
          .query("recipes")
          .withIndex("by_slug", (q) =>
            q.eq("slug", "banana-bread-du-kona-inn"),
          )
          .unique(),
        ctx.db
          .query("recipes")
          .withIndex("by_slug", (q) => q.eq("slug", "amandin"))
          .unique(),
      ]);
      if (!bananaBread || !amandin) throw new Error("seed fixture missing");
      await Promise.all([
        ctx.db.patch(bananaBread._id, {
          translations: {
            ...bananaBread.translations,
            fr: {
              ...bananaBread.translations.fr,
              description: "Ancienne description",
            },
          },
        }),
        ctx.db.patch(amandin._id, {
          translations: {
            ...amandin.translations,
            fr: {
              ...amandin.translations.fr,
              title: "Amandin éditorial",
            },
          },
        }),
      ]);
    });

    await expect(
      t.mutation(api.recipes.syncProductionRecipe, {
        adminPassword: password,
        slug: "banana-bread-du-kona-inn",
      }),
    ).resolves.toEqual({ inserted: 0, updated: 1, total: 1 });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: "banana-bread-du-kona-inn",
      }),
    ).resolves.toMatchObject({
      description: "Banana bread moelleux aux bananes bien mûres.",
      notes: [expect.stringContaining("farine en une seule fois")],
      status: "published",
    });
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.toMatchObject({ title: "Amandin éditorial" });
  });

  test("production sync publishes canonical data and removes obsolete Moka", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "amandin",
    });
    const moka = await t.mutation(api.recipes.create, {
      recipe: recipe("Moka"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, moka.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: moka.slug,
      expectedRevision: moka.revision,
      adminPassword: password,
    });
    await t.run(async (ctx) => {
      const amandin = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "amandin"))
        .unique();
      if (!amandin) throw new Error("seed fixture missing");
      await ctx.db.patch(amandin._id, {
        referenceServings: 99,
        categories: ["sale"],
        legacyCategoryLabels: ["Obsolète"],
        tags: ["Salé", "Obsolète"],
        translations: {
          ...amandin.translations,
          fr: { ...amandin.translations.fr, title: "Ancien Amandin" },
        },
      });
    });

    await t.mutation(api.recipes.syncProduction, {
      adminPassword: password,
    });

    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "moka" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.toMatchObject({ title: "Amandin", status: "published" });
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: "amandin",
        adminPassword: password,
      }),
    ).resolves.toMatchObject({
      referenceServings: 6,
      categories: ["dessert", "sucre"],
      legacyCategoryLabels: [],
    });
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: "amandin",
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ hasUnpublishedChanges: false });

    const beforeSecondSync = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: "amandin",
      adminPassword: password,
    });
    await expect(
      t.mutation(api.recipes.syncProduction, { adminPassword: password }),
    ).resolves.toMatchObject({ inserted: 0, updated: 0, removed: 0 });
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: "amandin",
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ revision: beforeSecondSync?.revision });
  });

  test("normalizes valid related slugs and rejects broken relationships", async () => {
    const t = convexTest(schema, modules);
    const target = await t.mutation(api.recipes.create, {
      recipe: recipe("Mayonnaise liée"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, target.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: target.slug,
      expectedRevision: target.revision,
      adminPassword: password,
    });
    const parent = await t.mutation(api.recipes.create, {
      recipe: {
        ...recipe("Pain lié"),
        relatedRecipeSlugs: [" mayonnaise-liee ", "mayonnaise-liee"],
      },
      adminPassword: password,
    });
    await t.run(async (ctx) => {
      const parentRecipe = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", parent.slug))
        .unique();
      if (!parentRecipe) throw new Error("parent fixture missing");
      const parentDraft = await ctx.db
        .query("recipeDrafts")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", parentRecipe._id))
        .unique();
      if (!parentDraft) throw new Error("parent draft fixture missing");
      await ctx.db.patch(parentDraft._id, {
        relatedRecipeSlugs: ["mayonnaise-liee", "mayonnaise-liee"],
      });
    });
    await ensurePosterFixture(t, parent.slug);
    await expect(
      t.mutation(api.recipes.publishDraft, {
        slug: parent.slug,
        expectedRevision: parent.revision,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ slug: "pain-lie" });
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: parent.slug,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ relatedRecipeSlugs: ["mayonnaise-liee"] });

    const broken = await t.mutation(api.recipes.create, {
      recipe: {
        ...recipe("Lien cassé"),
        relatedRecipeSlugs: ["recette-inconnue"],
      },
      adminPassword: password,
    });
    await ensurePosterFixture(t, broken.slug);
    await expect(
      t.mutation(api.recipes.publishDraft, {
        slug: broken.slug,
        expectedRevision: broken.revision,
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_RELATED_RECIPE_NOT_FOUND:recette-inconnue");
    await expect(
      t.mutation(api.recipes.create, {
        recipe: {
          ...recipe("Auto relation"),
          relatedRecipeSlugs: ["auto-relation"],
        },
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_RELATED_RECIPE_SELF_REFERENCE");
    await expect(
      t.mutation(api.recipes.create, {
        recipe: {
          ...recipe("Lien invalide"),
          relatedRecipeSlugs: ["../mayonnaise"],
        },
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_RELATED_RECIPE_INVALID");
  });

  test("targeted seeding clears stale reference servings from a yield-only recipe", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "banana-bread-du-kona-inn",
    });
    await t.run(async (ctx) => {
      const bananaBread = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "banana-bread-du-kona-inn"))
        .unique();
      if (!bananaBread) throw new Error("seed fixture missing");
      await ctx.db.patch(bananaBread._id, { referenceServings: 6 });
    });

    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "banana-bread-du-kona-inn",
    });

    const localized = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: "banana-bread-du-kona-inn",
    });
    expect(localized).toMatchObject({ referenceServings: 6 });
    const editing = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: "banana-bread-du-kona-inn",
      adminPassword: password,
    });
    expect(editing).toMatchObject({ hasUnpublishedChanges: true });
    expect(editing).not.toHaveProperty("referenceServings");
  });

  test("re-seeding preserves the public snapshot and visibility", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "mayonnaise",
    });
    const before = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: "mayonnaise",
    });
    await t.mutation(api.recipes.setVisibility, {
      slug: "mayonnaise",
      visible: false,
      adminPassword: password,
    });

    await t.mutation(api.recipes.seed, {
      adminPassword: password,
      slug: "mayonnaise",
    });

    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "mayonnaise" }),
    ).resolves.toBeNull();
    const stored = await t.run((ctx) =>
      ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "mayonnaise"))
        .unique(),
    );
    expect(stored).toMatchObject({
      status: "draft",
      translations: { fr: { title: before?.title } },
    });
    const editing = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: "mayonnaise",
      adminPassword: password,
    });
    expect(editing).toMatchObject({
      status: "draft",
      hasUnpublishedChanges: true,
    });
  });

  test("seeding without a slug keeps the global behavior", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.recipes.seed, {
      adminPassword: password,
    });

    expect(result).toMatchObject({ inserted: result.total, updated: 0 });
    expect(result.total).toBeGreaterThan(1);
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.not.toBeNull();
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "mayonnaise" }),
    ).resolves.not.toBeNull();
  });

  test("paginates compact public recipe summaries", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, { adminPassword: password });

    const first = await t.query(api.recipes.list, {
      locale: "fr",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(first.page).toHaveLength(1);
    expect(first.isDone).toBe(false);
    expect(first.page[0]?.title).toEqual(expect.any(String));
    expect(first.page[0]?.ingredients[0]?.name).toEqual(expect.any(String));
    expect(first.page[0]).not.toHaveProperty("sections");

    const second = await t.query(api.recipes.list, {
      locale: "fr",
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(1);
    expect(second.page[0]?._id).not.toBe(first.page[0]?._id);
  });

  test("targeted seeding rejects an unknown slug", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.recipes.seed, {
        adminPassword: password,
        slug: "recette-inconnue",
      }),
    ).rejects.toThrow("RECIPE_NOT_FOUND");
  });

  test("re-seeding preserves editorial reference portions", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, { adminPassword: password });
    await t.run(async (ctx) => {
      const ambiguous = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "amandin"))
        .unique();
      const inferred = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "gateau-aux-pommes"))
        .unique();
      const yieldLabeled = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) =>
          q.eq("slug", "cookies-aux-pepites-de-chocolat-et-fleur-de-sel"),
        )
        .unique();
      if (!ambiguous || !inferred || !yieldLabeled) {
        throw new Error("seed fixture missing");
      }
      await ctx.db.patch(ambiguous._id, { referenceServings: 8 });
      await ctx.db.patch(inferred._id, { referenceServings: 7 });
      await ctx.db.patch(yieldLabeled._id, { referenceServings: 12 });
    });

    await t.mutation(api.recipes.seed, { adminPassword: password });

    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: "amandin" }),
    ).resolves.toMatchObject({ referenceServings: 8 });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: "gateau-aux-pommes",
      }),
    ).resolves.toMatchObject({ referenceServings: 7 });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: "cookies-aux-pepites-de-chocolat-et-fleur-de-sel",
      }),
    ).resolves.toMatchObject({ referenceServings: 12 });
  });

  test("re-seeding preserves unknown legacy category labels", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.recipes.seed, { adminPassword: password });
    await t.run(async (ctx) => {
      const seeded = await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", "amandin"))
        .unique();
      if (!seeded) throw new Error("seed fixture missing");
      await ctx.db.patch(seeded._id, {
        tags: [...(seeded.tags ?? []), "recette de famille"],
      });
    });

    await t.mutation(api.recipes.seed, { adminPassword: password });
    const editing = await t.query(api.recipes.getForEditing, {
      slug: "amandin",
      locale: "fr",
      adminPassword: password,
    });
    expect(editing?.legacyCategoryLabels).toContain("recette de famille");
  });

  test("category migration dry-runs, migrates recipes and drafts, and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Migration des catégories");
    const storedTranslations = {
      fr: storedLocalized(content.translations.fr),
      en: storedLocalized(content.translations.en),
    };
    await t.run(async (ctx) => {
      const recipeId = await ctx.db.insert("recipes", {
        slug: "migration-categories",
        heroImageUrl: "",
        defaultLocale: content.defaultLocale,
        translations: storedTranslations,
        tags: ["plat", "héritage"],
        status: "draft",
      });
      await ctx.db.insert("recipeDrafts", {
        recipeId,
        heroImageUrl: "",
        defaultLocale: content.defaultLocale,
        translations: storedTranslations,
        tags: ["sale", "cahier bleu"],
        revision: 0,
        publishedRevision: -1,
        updatedAt: Date.now(),
      });
    });

    const migrationArgs = {
      cursor: null,
      oneBatchOnly: true,
      batchSize: 100,
    } as const;
    const readMigratedCategoryFields = () =>
      t.run(async (ctx) => {
        const migratedRecipe = await ctx.db
          .query("recipes")
          .withIndex("by_slug", (q) => q.eq("slug", "migration-categories"))
          .unique();
        if (!migratedRecipe) throw new Error("migration recipe missing");
        const migratedDraft = await ctx.db
          .query("recipeDrafts")
          .withIndex("by_recipeId", (q) => q.eq("recipeId", migratedRecipe._id))
          .unique();
        if (!migratedDraft) throw new Error("migration draft missing");
        return {
          recipe: {
            categories: migratedRecipe.categories,
            legacyCategoryLabels: migratedRecipe.legacyCategoryLabels,
          },
          draft: {
            categories: migratedDraft.categories,
            legacyCategoryLabels: migratedDraft.legacyCategoryLabels,
          },
        };
      });
    await expect(
      t.mutation(internal.migrations.backfillRecipeCategories, {
        ...migrationArgs,
        dryRun: true,
      }),
    ).rejects.toThrow();

    await t.mutation(internal.migrations.backfillRecipeCategories, {
      ...migrationArgs,
      dryRun: false,
    });
    await t.mutation(internal.migrations.backfillDraftCategories, {
      ...migrationArgs,
      dryRun: false,
    });
    const first = await readMigratedCategoryFields();
    expect(first).toEqual({
      recipe: { categories: ["plat"], legacyCategoryLabels: ["héritage"] },
      draft: { categories: ["sale"], legacyCategoryLabels: ["cahier bleu"] },
    });

    await t.mutation(internal.migrations.backfillRecipeCategories, {
      ...migrationArgs,
      dryRun: false,
    });
    await t.mutation(internal.migrations.backfillDraftCategories, {
      ...migrationArgs,
      dryRun: false,
    });
    await expect(readMigratedCategoryFields()).resolves.toEqual(first);
  });

  test("falls back to the public snapshot for legacy recipes without a draft", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Recette historique");
    const { yieldLabel: _frYieldLabel, ...legacyFrench } =
      content.translations.fr;
    const { yieldLabel: _enYieldLabel, ...legacyEnglish } =
      content.translations.en;
    const legacyTranslations = {
      fr: storedLocalized(
        legacyFrench as ReturnType<typeof recipe>["translations"]["fr"],
        { quantity: 20, unit: "environ" },
      ),
      en: storedLocalized(
        legacyEnglish as ReturnType<typeof recipe>["translations"]["fr"],
        { quantity: 20, unit: "about" },
      ),
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("recipes", {
        slug: "gougeres",
        heroImageUrl: "",
        defaultLocale: content.defaultLocale,
        translations: legacyTranslations,
        categories: content.categories,
        status: "published",
      });
    });
    const editing = await t.query(api.recipes.getForEditing, {
      slug: "gougeres",
      locale: "fr",
      adminPassword: password,
    });
    expect(editing).toMatchObject({
      title: "Recette historique",
      revision: 0,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
    });
    expect(editing?.translations.fr.yieldLabel).toBe("Environ 20 gougères");
    const publicRecipe = await t.query(api.recipes.getBySlug, {
      locale: "en",
      slug: "gougeres",
    });
    expect(publicRecipe?.yieldLabel).toBe("About 20 gougères");
  });

  test("dual-reads legacy tags and dual-writes canonical categories without losing unknown labels", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Recette avec catégories historiques");
    await t.run(async (ctx) => {
      await ctx.db.insert("recipes", {
        slug: "categories-historiques",
        heroImageUrl: "",
        defaultLocale: content.defaultLocale,
        referenceServings: content.referenceServings,
        translations: {
          fr: storedLocalized(content.translations.fr),
          en: storedLocalized(content.translations.en),
        },
        tags: ["dessert", "famille"],
        status: "published",
      });
    });

    const editing = await t.query(api.recipes.getForEditing, {
      slug: "categories-historiques",
      locale: "fr",
      adminPassword: password,
    });
    expect(editing).toMatchObject({
      categories: ["dessert"],
      legacyCategoryLabels: ["famille"],
    });

    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: "categories-historiques",
      expectedRevision: 0,
      adminPassword: password,
      recipe: {
        defaultLocale: content.defaultLocale,
        referenceServings: content.referenceServings,
        translations: content.translations,
        tags: ["dessert", "famille"],
      },
    });

    await t.run(async (ctx) => {
      const draft = await ctx.db.query("recipeDrafts").unique();
      expect(draft).toMatchObject({
        categories: ["dessert"],
        legacyCategoryLabels: ["famille"],
        tags: ["dessert", "famille"],
      });
    });

    await ensurePosterFixture(t, "categories-historiques");
    await t.mutation(api.recipes.publishDraft, {
      slug: "categories-historiques",
      expectedRevision: saved.revision,
      adminPassword: password,
    });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: "categories-historiques",
      }),
    ).resolves.toMatchObject({ categories: ["dessert"] });
  });

  test("creates a private draft with an initial revision", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe(),
      adminPassword: password,
    });

    expect(created.revision).toBe(0);
    expect(created.publishedRevision).toBe(-1);
    expect(
      await t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: created.slug,
      }),
    ).toBeNull();

    const editing = await t.query(api.recipes.listForEditing, {
      locale: "fr",
      adminPassword: password,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(editing.page[0]).toMatchObject({
      slug: created.slug,
      hasUnpublishedChanges: true,
      revision: 0,
    });
  });

  test("keeps a ready save private until publication is explicitly confirmed", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Première version"),
      adminPassword: password,
    });
    const changed = recipe("Version enregistrée et publique");

    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: changed.defaultLocale,
        referenceServings: changed.referenceServings,
        translations: changed.translations,
        categories: changed.categories,
      },
      expectedRevision: created.revision,
      adminPassword: password,
    });

    expect(saved).toMatchObject({ revision: 1, publishedRevision: -1 });
    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: created.slug }),
    ).resolves.toBeNull();
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: saved.revision,
      adminPassword: password,
    });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: created.slug,
      }),
    ).resolves.toMatchObject({ title: "Version enregistrée et publique" });
  });

  test("keeps an incomplete simple-editor save private", async () => {
    const t = convexTest(schema, modules);
    const initial = recipe("Recette à compléter");
    initial.translations.fr.description = "";
    const created = await t.mutation(api.recipes.create, {
      recipe: initial,
      adminPassword: password,
    });

    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: initial.defaultLocale,
        referenceServings: initial.referenceServings,
        translations: initial.translations,
        categories: initial.categories,
      },
      expectedRevision: created.revision,
      adminPassword: password,
    });

    expect(saved).toMatchObject({ revision: 1, publishedRevision: -1 });
    await expect(
      t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: created.slug,
      }),
    ).resolves.toBeNull();
  });

  test("saves a ready draft privately when a related recipe is unavailable", async () => {
    const t = convexTest(schema, modules);
    const initial = recipe("Recette avec relation privée");
    const created = await t.mutation(api.recipes.create, {
      recipe: initial,
      adminPassword: password,
    });

    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: initial.defaultLocale,
        referenceServings: initial.referenceServings,
        relatedRecipeSlugs: ["recette-encore-privee"],
        translations: initial.translations,
        categories: initial.categories,
      },
      expectedRevision: created.revision,
      adminPassword: password,
    });

    expect(saved).toMatchObject({ revision: 1, publishedRevision: -1 });
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: created.slug,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({
      revision: 1,
      relatedRecipeSlugs: ["recette-encore-privee"],
    });
  });

  test("allows an incomplete draft but requires a yield or reference servings to publish", async () => {
    const t = convexTest(schema, modules);
    const incomplete = { ...recipe(), referenceServings: undefined };
    incomplete.translations.fr.yieldLabel = "";
    incomplete.translations.en.yieldLabel = "";
    const created = await t.mutation(api.recipes.create, {
      recipe: incomplete,
      adminPassword: password,
    });

    await expect(
      t.mutation(api.recipes.publishDraft, {
        slug: created.slug,
        expectedRevision: 0,
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_NOT_READY");
  });

  test("rejects reference servings outside the public selector bounds", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.recipes.create, {
        recipe: { ...recipe(), referenceServings: 51 },
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_LIMIT_EXCEEDED");
  });

  test("detects stale autosaves", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe(),
      adminPassword: password,
    });
    const next = recipe("Titre modifié");

    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: next.defaultLocale,
        referenceServings: next.referenceServings,
        translations: next.translations,
        categories: next.categories,
      },
      expectedRevision: 0,
      adminPassword: password,
    });

    await expect(
      t.mutation(api.recipes.saveDraft, {
        slug: created.slug,
        recipe: {
          defaultLocale: next.defaultLocale,
          referenceServings: next.referenceServings,
          translations: next.translations,
          categories: next.categories,
        },
        expectedRevision: 0,
        adminPassword: password,
      }),
    ).rejects.toThrow(/RECIPE_DRAFT_CONFLICT/);
  });

  test("allows an explicit device replacement to advance the latest revision", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe(),
      adminPassword: password,
    });
    const first = recipe("Premier appareil");
    await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: first.defaultLocale,
        referenceServings: first.referenceServings,
        translations: first.translations,
        categories: first.categories,
      },
      expectedRevision: 0,
      adminPassword: password,
    });
    const replacement = recipe("Téléphone prioritaire");
    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: replacement.defaultLocale,
        referenceServings: replacement.referenceServings,
        translations: replacement.translations,
        categories: replacement.categories,
      },
      expectedRevision: 0,
      force: true,
      adminPassword: password,
    });
    expect(saved.revision).toBe(2);
    const editing = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: created.slug,
      adminPassword: password,
    });
    expect(editing?.title).toBe("Téléphone prioritaire");
  });

  test("keeps published content stable until the new draft is published", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Version publiée"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });

    const changed = recipe("Brouillon de travail");
    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: changed.defaultLocale,
        referenceServings: changed.referenceServings,
        translations: changed.translations,
        categories: changed.categories,
      },
      expectedRevision: 0,
      adminPassword: password,
    });

    const beforePublish = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: created.slug,
    });
    expect(beforePublish?.title).toBe("Version publiée");

    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: saved.revision,
      adminPassword: password,
    });
    const afterPublish = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: created.slug,
    });
    expect(afterPublish?.title).toBe("Brouillon de travail");
  });

  test("rejects publication until required French content is ready", async () => {
    const t = convexTest(schema, modules);
    const incomplete = recipe("");
    const created = await t.mutation(api.recipes.create, {
      recipe: incomplete,
      adminPassword: password,
    });

    await expect(
      t.mutation(api.recipes.publishDraft, {
        slug: created.slug,
        expectedRevision: 0,
        adminPassword: password,
      }),
    ).rejects.toThrow(/RECIPE_NOT_READY/);
  });

  test("publishes a complete piece-based recipe without reference servings", async () => {
    const t = convexTest(schema, modules);
    const pieceBasedRecipe = recipe("Cookies aux pépites de chocolat");
    delete (pieceBasedRecipe as Partial<typeof pieceBasedRecipe>)
      .referenceServings;
    pieceBasedRecipe.translations.fr.yieldLabel = "Environ 20 gros cookies";
    pieceBasedRecipe.translations.en.yieldLabel = "About 20 large cookies";

    const created = await t.mutation(api.recipes.create, {
      recipe: pieceBasedRecipe,
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });

    const published = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: created.slug,
    });
    expect(published).toMatchObject({
      yieldLabel: "Environ 20 gros cookies",
      status: "published",
    });
    expect(published).not.toHaveProperty("referenceServings");
  });

  test("protects admin reads with the configured password", async () => {
    const t = convexTest(schema, modules);
    const reads = [
      t.query(api.recipes.listForEditing, {
        locale: "fr",
        adminPassword: "wrong-password",
        paginationOpts: { numItems: 20, cursor: null },
      }),
      t.query(api.recipes.getForEditing, {
        slug: "missing",
        locale: "fr",
        adminPassword: "wrong-password",
      }),
    ];
    const results = await Promise.allSettled(reads);
    expect(
      results.every(
        (result) =>
          result.status === "rejected" &&
          String(result.reason).includes("RECIPE_ADMIN_REQUIRED"),
      ),
    ).toBe(true);
  });

  test("protects every draft mutation with the configured password", async () => {
    const t = convexTest(schema, modules);
    const attempts = [
      () =>
        t.mutation(api.recipes.create, {
          recipe: recipe(),
          adminPassword: "wrong-password",
        }),
      () =>
        t.mutation(api.recipes.saveDraft, {
          slug: "missing",
          recipe: draft(),
          expectedRevision: 0,
          adminPassword: "wrong-password",
        }),
      () =>
        t.mutation(api.recipes.publishDraft, {
          slug: "missing",
          expectedRevision: 0,
          adminPassword: "wrong-password",
        }),
      () =>
        t.mutation(api.recipes.discardDraft, {
          slug: "missing",
          expectedRevision: 0,
          adminPassword: "wrong-password",
        }),
      () =>
        t.mutation(api.recipes.setVisibility, {
          slug: "missing",
          visible: false,
          adminPassword: "wrong-password",
        }),
      () =>
        t.mutation(api.recipes.generateUploadUrl, {
          adminPassword: "wrong-password",
        }),
      () => t.mutation(api.recipes.seed, { adminPassword: "wrong-password" }),
      () =>
        t.mutation(api.recipes.setUnsplashHeroImage, {
          slug: "missing",
          imageUrl: "https://example.com/image.jpg",
          alt: "",
          photographerName: "Maman",
          photographerUrl: "https://example.com",
          photoUrl: "https://example.com/photo",
          expectedRevision: 0,
          adminPassword: "wrong-password",
        }),
    ];
    const results = await Promise.allSettled(
      attempts.map((attempt) => attempt()),
    );
    expect(
      results.every(
        (result) =>
          result.status === "rejected" &&
          String(result.reason).includes("RECIPE_ADMIN_REQUIRED"),
      ),
    ).toBe(true);
  });

  test("keeps internet image changes private until publication", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Image privée"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });
    const image = await t.mutation(api.recipes.setUnsplashHeroImage, {
      slug: created.slug,
      imageUrl: "https://images.example/private.jpg",
      alt: "Tarte",
      photographerName: "Maman",
      photographerUrl: "https://example.com/maman",
      photoUrl: "https://example.com/photo",
      expectedRevision: 0,
      adminPassword: password,
    });
    const publicBefore = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: created.slug,
    });
    expect(publicBefore?.heroImageUrl).toBe("/images/test-poster.webp");
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: image.revision,
      adminPassword: password,
    });
    const publicAfter = await t.query(api.recipes.getBySlug, {
      locale: "fr",
      slug: created.slug,
    });
    expect(publicAfter?.heroImageUrl).toBe(
      "https://images.example/private.jpg",
    );
  });

  test("cleans replaced and discarded images without deleting the published image", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Images révisionnées"),
      adminPassword: password,
    });
    const temporaryStorageId = await uploadRecipeImage(t);
    const temporaryImage = await t.mutation(api.recipes.setHeroImage, {
      slug: created.slug,
      storageId: temporaryStorageId,
      expectedRevision: 0,
      adminPassword: password,
    });
    const firstStorageId = await uploadRecipeImage(t);
    const firstImage = await t.mutation(api.recipes.setHeroImage, {
      slug: created.slug,
      storageId: firstStorageId,
      expectedRevision: temporaryImage.revision,
      adminPassword: password,
    });
    expect(
      await t.run(async (ctx) =>
        ctx.db.system.get("_storage", temporaryStorageId),
      ),
    ).toBeNull();
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: firstImage.revision,
      adminPassword: password,
    });

    const secondStorageId = await uploadRecipeImage(t);
    const secondImage = await t.mutation(api.recipes.setHeroImage, {
      slug: created.slug,
      storageId: secondStorageId,
      expectedRevision: firstImage.revision,
      adminPassword: password,
    });
    expect(
      await t.run(async (ctx) => ctx.db.system.get("_storage", firstStorageId)),
    ).not.toBeNull();

    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: secondImage.revision,
      adminPassword: password,
    });
    expect(
      await t.run(async (ctx) => ctx.db.system.get("_storage", firstStorageId)),
    ).toBeNull();

    const thirdStorageId = await uploadRecipeImage(t);
    const thirdImage = await t.mutation(api.recipes.setHeroImage, {
      slug: created.slug,
      storageId: thirdStorageId,
      expectedRevision: secondImage.revision,
      adminPassword: password,
    });
    await t.mutation(api.recipes.discardDraft, {
      slug: created.slug,
      expectedRevision: thirdImage.revision,
      adminPassword: password,
    });
    expect(
      await t.run(async (ctx) => ctx.db.system.get("_storage", thirdStorageId)),
    ).toBeNull();
    expect(
      await t.run(async (ctx) =>
        ctx.db.system.get("_storage", secondStorageId),
      ),
    ).not.toBeNull();
  });

  test("cleanup works after recipe deletion and preserves cross-recipe references", async () => {
    const t = convexTest(schema, modules);
    const orphanStorageId = await uploadRecipeImage(t);
    await expect(
      t.mutation(api.recipes.cleanupHeroImageUpload, {
        slug: "already-deleted",
        storageId: orphanStorageId,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ referenced: false, slug: "already-deleted" });
    expect(
      await t.run(async (ctx) =>
        ctx.db.system.get("_storage", orphanStorageId),
      ),
    ).toBeNull();

    const sharedStorageId = await uploadRecipeImage(t);
    const first = await t.mutation(api.recipes.create, {
      recipe: recipe("Partage un"),
      adminPassword: password,
    });
    const second = await t.mutation(api.recipes.create, {
      recipe: recipe("Partage deux"),
      adminPassword: password,
    });
    await t.run(async (ctx) => {
      const recipes = await Promise.all(
        [first.slug, second.slug].map((slug) =>
          ctx.db
            .query("recipes")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .unique(),
        ),
      );
      for (const storedRecipe of recipes) {
        if (!storedRecipe) throw new Error("recipe fixture missing");
        await ctx.db.patch(storedRecipe._id, {
          heroImageStorageId: sharedStorageId,
        });
      }
    });
    await t.mutation(api.recipes.deleteRecipe, {
      slug: first.slug,
      expectedRevision: 0,
      adminPassword: password,
    });
    expect(
      await t.run(async (ctx) =>
        ctx.db.system.get("_storage", sharedStorageId),
      ),
    ).not.toBeNull();
    await expect(
      t.mutation(api.recipes.cleanupHeroImageUpload, {
        slug: first.slug,
        storageId: sharedStorageId,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({ referenced: true, slug: second.slug });
  });

  test("discards unpublished edits back to the public snapshot", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Version stable"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });
    const changed = recipe("À abandonner");
    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: {
        defaultLocale: changed.defaultLocale,
        referenceServings: changed.referenceServings,
        translations: changed.translations,
        categories: changed.categories,
      },
      expectedRevision: 0,
      adminPassword: password,
    });

    const discarded = await t.mutation(api.recipes.discardDraft, {
      slug: created.slug,
      expectedRevision: saved.revision,
      adminPassword: password,
    });
    expect(discarded).toMatchObject({
      publishedRevision: discarded.revision,
      draft: { translations: { fr: { title: "Version stable" } } },
    });
    const editing = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: created.slug,
      adminPassword: password,
    });
    expect(editing).toMatchObject({
      title: "Version stable",
      hasUnpublishedChanges: false,
    });
  });

  test("returns compact publication and readiness state in admin summaries", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe(),
      adminPassword: password,
    });

    const summaries = await t.query(api.recipes.listForEditing, {
      locale: "fr",
      adminPassword: password,
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(summaries.page[0]).toMatchObject({
      slug: created.slug,
      hasPublishedVersion: false,
      hasUnpublishedChanges: true,
      canDiscard: false,
      readiness: {
        sections: {
          info: false,
          details: true,
          ingredients: true,
          preparation: true,
        },
        translation: { fr: true, en: true },
      },
    });
  });

  test("rejects editorial fields and drafts beyond the bounded contract", async () => {
    const t = convexTest(schema, modules);
    const oversizedTitle = recipe("x".repeat(201));

    await expect(
      t.mutation(api.recipes.create, {
        recipe: oversizedTitle,
        adminPassword: password,
      }),
    ).rejects.toThrow(/RECIPE_LIMIT_EXCEEDED/);

    const huge = recipe("Within the field limit");
    huge.translations.fr.sections = Array.from(
      { length: 50 },
      (_, sectionIndex) => ({
        title: `Section ${sectionIndex}`,
        steps: Array.from({ length: 6 }, (_, stepIndex) => ({
          id: `step-${sectionIndex}-${stepIndex}`,
          text: "é".repeat(2_000),
          ingredientUses: [],
        })),
      }),
    );

    await expect(
      t.mutation(api.recipes.create, {
        recipe: huge,
        adminPassword: password,
      }),
    ).rejects.toThrow(/RECIPE_DRAFT_TOO_LARGE/);
  });

  test("rejects a create whose normalized payload fits but dual-written stored document exceeds 500 kB", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Dual write");
    const longLocalized = {
      ...content.translations.fr,
      notes: Array.from({ length: 100 }, () => "n".repeat(2_000)),
      sections: [
        {
          title: "Préparation",
          steps: Array.from({ length: 22 }, (_, stepIndex) => ({
            id: `step-long-${stepIndex}`,
            text: "x".repeat(2_000),
            ingredientUses: [],
          })),
        },
      ],
    };
    const legacyCategoryLabels = Array.from(
      { length: 50 },
      (_, index) => `${String(index).padStart(2, "0")}${"l".repeat(98)}`,
    );
    const boundedPayload = {
      ...draft(content),
      translations: { fr: longLocalized, en: longLocalized },
      legacyCategoryLabels,
    };
    expect(
      new TextEncoder().encode(JSON.stringify(boundedPayload)).byteLength,
    ).toBeLessThan(500_000);
    await expect(
      t.mutation(api.recipes.create, {
        recipe: boundedPayload,
        adminPassword: password,
      }),
    ).rejects.toThrow("RECIPE_DRAFT_TOO_LARGE");
  });

  test("unpublishes without losing the synchronized working draft", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("À retirer"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });
    await t.mutation(api.recipes.setVisibility, {
      slug: created.slug,
      visible: false,
      adminPassword: password,
    });

    expect(
      await t.query(api.recipes.getBySlug, {
        locale: "fr",
        slug: created.slug,
      }),
    ).toBeNull();
    const editing = await t.query(api.recipes.getForEditing, {
      locale: "fr",
      slug: created.slug,
      adminPassword: password,
    });
    expect(editing?.title).toBe("À retirer");
  });

  test("publishing edits preserves a deliberately hidden recipe", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Archive privée"),
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: 0,
      adminPassword: password,
    });
    await t.mutation(api.recipes.setVisibility, {
      slug: created.slug,
      visible: false,
      adminPassword: password,
    });
    const changed = recipe("Archive privée corrigée");
    const saved = await t.mutation(api.recipes.saveDraft, {
      slug: created.slug,
      recipe: changed,
      expectedRevision: 0,
      adminPassword: password,
    });
    await ensurePosterFixture(t, created.slug);
    await t.mutation(api.recipes.publishDraft, {
      slug: created.slug,
      expectedRevision: saved.revision,
      adminPassword: password,
    });

    await expect(
      t.query(api.recipes.getBySlug, { locale: "fr", slug: created.slug }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.recipes.getForEditing, {
        locale: "fr",
        slug: created.slug,
        adminPassword: password,
      }),
    ).resolves.toMatchObject({
      title: "Archive privée corrigée",
      publishedRevision: saved.revision,
      isPublic: false,
    });
  });

  test("retains an approved baseline when unpublishing a legacy recipe", async () => {
    const t = convexTest(schema, modules);
    const content = recipe("Archive approuvée");
    const { yieldLabel: _frYieldLabel, ...legacyFrench } =
      content.translations.fr;
    const { yieldLabel: _enYieldLabel, ...legacyEnglish } =
      content.translations.en;
    await t.run(async (ctx) => {
      await ctx.db.insert("recipes", {
        slug: "archive-approuvee",
        heroImageUrl: "",
        defaultLocale: content.defaultLocale,
        referenceServings: content.referenceServings,
        translations: {
          fr: storedLocalized(
            legacyFrench as ReturnType<typeof recipe>["translations"]["fr"],
            { quantity: 6, unit: "personnes" },
          ),
          en: storedLocalized(
            legacyEnglish as ReturnType<typeof recipe>["translations"]["fr"],
            { quantity: 6, unit: "people" },
          ),
        },
        categories: content.categories,
        status: "published",
      });
    });
    await t.mutation(api.recipes.setVisibility, {
      slug: "archive-approuvee",
      visible: false,
      adminPassword: password,
    });
    const editing = await t.query(api.recipes.getForEditing, {
      slug: "archive-approuvee",
      locale: "fr",
      adminPassword: password,
    });
    expect(editing).toMatchObject({
      hasPublishedVersion: true,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      isPublic: false,
    });
  });

  test("refuses to discard a recipe that has never been published", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(api.recipes.create, {
      recipe: recipe("Nouveau"),
      adminPassword: password,
    });
    await expect(
      t.mutation(api.recipes.discardDraft, {
        slug: created.slug,
        expectedRevision: 0,
        adminPassword: password,
      }),
    ).rejects.toThrow(/RECIPE_HAS_NO_PUBLISHED_VERSION/);
  });

  test("deletes a recipe at the expected revision and cleans related records", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const created = await t.mutation(api.recipes.create, {
        recipe: recipe("À supprimer"),
        adminPassword: password,
      });
      await t.run(async (ctx) => {
        const commentId = await ctx.db.insert("recipeComments", {
          recipeId: created.recipeId,
          ownerDigest: "owner",
          text: "Commentaire lié",
        });
        await ctx.db.insert("commentReactionSummaries", {
          commentId,
          thumbsUpCount: 1,
          thumbsDownCount: 0,
        });
        await ctx.db.insert("commentReactions", {
          commentId,
          participantDigest: "visitor",
          direction: "up",
          updatedAt: Date.now(),
        });
      });

      await expect(
        t.mutation(api.recipes.deleteRecipe, {
          slug: created.slug,
          expectedRevision: 4,
          adminPassword: password,
        }),
      ).rejects.toThrow(/RECIPE_DRAFT_CONFLICT:0/);

      await t.mutation(api.recipes.deleteRecipe, {
        slug: created.slug,
        expectedRevision: 0,
        adminPassword: password,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await t.run(async (ctx) => {
        expect(await ctx.db.get(created.recipeId)).toBeNull();
        expect(await ctx.db.query("recipeDrafts").collect()).toHaveLength(0);
        expect(await ctx.db.query("recipeComments").collect()).toHaveLength(0);
        expect(
          await ctx.db.query("commentReactionSummaries").collect(),
        ).toHaveLength(0);
        expect(await ctx.db.query("commentReactions").collect()).toHaveLength(
          0,
        );
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
