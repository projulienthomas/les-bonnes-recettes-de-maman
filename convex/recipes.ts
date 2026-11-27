import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { materializeRecipeCatalog } from "./recipeCatalog/materialization";
import { deleteRecipeRecord } from "./recipeDeletion";
import {
  assertRecipeDraftBytes,
  assertRecipeDraftBounds,
  assertRecipeDraftLimits,
  assertRecipeImageLimits,
  getPublicationState,
  getRecipeReadiness,
  type RecipeDraftContentLike,
} from "../lib/recipe-admin-domain";
import { resolveYieldLabel } from "../lib/recipe-yield";
import {
  publicLocaleValidator,
  publishedTranslation,
  type PublicLocale,
} from "./recipeLocales";
import { resolveReferenceServings } from "../lib/recipe-servings";
import {
  RECIPE_CATEGORIES,
  resolveRecipeCategories,
  toLegacyTags,
  type RecipeCategory,
} from "../lib/recipe-categories";
import { legacyIngredientId, legacyStepId } from "../lib/recipe-item-ids";
import {
  completeLinkedIdea,
  linkIdeaToRecipe,
  reopenLinkedIdea,
} from "./recipeIdeas";

declare const process: {
  env: {
    RECIPE_ADMIN_PASSWORD?: string;
  };
};

const localeValidator = v.union(v.literal("fr"), v.literal("en"));
const recipeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const recipeCategoryValidator = v.union(
  v.literal("dessert"),
  v.literal("plat"),
  v.literal("sucre"),
  v.literal("sale"),
);

type Locale = "fr" | "en";
type RecipeDoc = Doc<"recipes">;
type RecipeDraftDoc = Doc<"recipeDrafts">;

const ingredientValidator = v.object({
  id: v.string(),
  name: v.string(),
  quantity: v.string(),
  unit: v.string(),
  notes: v.string(),
});

const stepIngredientUseValidator = v.object({
  ingredientId: v.string(),
  amount: v.optional(v.object({ quantity: v.string(), unit: v.string() })),
});

const recipeStepValidator = v.object({
  id: v.string(),
  text: v.string(),
  ingredientUses: v.array(stepIngredientUseValidator),
});

const sectionValidator = v.object({
  title: v.string(),
  steps: v.array(recipeStepValidator),
});

const subRecipeValidator = v.object({
  title: v.string(),
  ingredients: v.array(ingredientValidator),
});

const localizedRecipeValidator = v.object({
  title: v.string(),
  author: v.string(),
  description: v.string(),
  servings: v.union(
    v.object({
      quantity: v.number(),
      unit: v.string(),
    }),
    v.null(),
  ),
  yieldLabel: v.optional(v.string()),
  prepTime: v.string(),
  cookTime: v.string(),
  restTime: v.optional(v.string()),
  totalTime: v.string(),
  timeLabel: v.string(),
  temperature: v.string(),
  equipment: v.optional(v.array(v.string())),
  ingredients: v.array(ingredientValidator),
  sections: v.array(sectionValidator),
  subRecipes: v.array(subRecipeValidator),
  notes: v.array(v.string()),
});

const editableLocalizedRecipeValidator = v.object({
  title: v.string(),
  author: v.string(),
  description: v.string(),
  yieldLabel: v.string(),
  prepTime: v.string(),
  cookTime: v.string(),
  restTime: v.optional(v.string()),
  totalTime: v.string(),
  timeLabel: v.string(),
  temperature: v.string(),
  equipment: v.optional(v.array(v.string())),
  ingredients: v.array(ingredientValidator),
  sections: v.array(sectionValidator),
  subRecipes: v.array(subRecipeValidator),
  notes: v.array(v.string()),
});

const canonicalDraftContentValidator = v.object({
  defaultLocale: localeValidator,
  referenceServings: v.optional(v.number()),
  relatedRecipeSlugs: v.optional(v.array(v.string())),
  translations: v.object({
    fr: editableLocalizedRecipeValidator,
    en: editableLocalizedRecipeValidator,
  }),
  categories: v.array(recipeCategoryValidator),
  legacyCategoryLabels: v.optional(v.array(v.string())),
});

const legacyDraftContentValidator = v.object({
  defaultLocale: localeValidator,
  referenceServings: v.optional(v.number()),
  relatedRecipeSlugs: v.optional(v.array(v.string())),
  translations: v.object({
    fr: editableLocalizedRecipeValidator,
    en: editableLocalizedRecipeValidator,
  }),
  tags: v.array(v.string()),
});

const draftContentValidator = v.union(
  canonicalDraftContentValidator,
  legacyDraftContentValidator,
);

const openverseImageCreditValidator = v.object({
  title: v.string(),
  creator: v.string(),
  creatorUrl: v.string(),
  imageUrl: v.string(),
  landingUrl: v.string(),
  license: v.string(),
  licenseVersion: v.string(),
  licenseUrl: v.string(),
  source: v.string(),
  attribution: v.string(),
  alt: v.string(),
});

export const list = query({
  args: {
    locale: publicLocaleValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const publishedRecipes = await ctx.db
      .query("recipes")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .paginate(args.paginationOpts);

    const localizedRecipes = await Promise.all(
      publishedRecipes.page.map((recipe) =>
        localizeSummary(ctx, recipe, args.locale),
      ),
    );

    return { ...publishedRecipes, page: localizedRecipes };
  },
});

export const listSlugs = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("recipes")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((recipe) => ({ slug: recipe.slug })),
    };
  },
});

export const getBySlug = query({
  args: {
    locale: publicLocaleValidator,
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!recipe || recipe.status !== "published") {
      return null;
    }

    return localize(ctx, recipe, args.locale);
  },
});

export const listForEditing = query({
  args: {
    locale: localeValidator,
    adminPassword: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const editableRecipes = await ctx.db
      .query("recipes")
      .order("desc")
      .paginate(args.paginationOpts);

    const localized = await Promise.all(
      editableRecipes.page.map(async (recipe) => {
        const draft = await getRecipeDraft(ctx, recipe._id);
        const source = draft ?? recipe;
        const storedHeroImageUrl = source.heroImageStorageId
          ? await ctx.storage.getUrl(source.heroImageStorageId)
          : null;
        const revision = draft?.revision ?? 0;
        const publishedRevision =
          draft?.publishedRevision ?? (recipe.status === "published" ? 0 : -1);
        const publication = getPublicationState(
          recipe.status,
          revision,
          publishedRevision,
        );
        const hasImage = Boolean(storedHeroImageUrl ?? source.heroImageUrl);

        return {
          _id: recipe._id,
          _creationTime: recipe._creationTime,
          slug: recipe.slug,
          title: source.translations[args.locale].title,
          heroImageUrl: storedHeroImageUrl ?? source.heroImageUrl,
          imageCredit: source.imageCredit,
          ...resolveRecipeCategories(source),
          status: recipe.status,
          revision,
          publishedRevision,
          updatedAt: draft?.updatedAt ?? recipe._creationTime,
          ...publication,
          readiness: getRecipeReadiness(
            toEditableRecipeContent(source, recipe.slug),
            hasImage,
          ),
        };
      }),
    );

    return { ...editableRecipes, page: localized };
  },
});

export const getForEditing = query({
  args: {
    slug: v.string(),
    locale: localeValidator,
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!recipe) return null;

    const draft = await getRecipeDraft(ctx, recipe._id);
    const source = draft ?? recipe;
    const storedHeroImageUrl = source.heroImageStorageId
      ? await ctx.storage.getUrl(source.heroImageStorageId)
      : null;
    const revision = draft?.revision ?? 0;
    const publishedRevision =
      draft?.publishedRevision ?? (recipe.status === "published" ? 0 : -1);
    const publication = getPublicationState(
      recipe.status,
      revision,
      publishedRevision,
    );

    return {
      _id: recipe._id,
      _creationTime: recipe._creationTime,
      slug: recipe.slug,
      title: source.translations[args.locale].title,
      heroImageUrl: storedHeroImageUrl ?? source.heroImageUrl,
      imageCredit: source.imageCredit,
      defaultLocale: source.defaultLocale,
      referenceServings: getReferenceServings(source),
      relatedRecipeSlugs: source.relatedRecipeSlugs ?? [],
      translations: toEditableTranslations(source.translations, recipe.slug),
      ...resolveRecipeCategories(source),
      status: recipe.status,
      revision,
      publishedRevision,
      updatedAt: draft?.updatedAt ?? recipe._creationTime,
      ...publication,
      readiness: getRecipeReadiness(
        toEditableRecipeContent(source, recipe.slug),
        Boolean(storedHeroImageUrl ?? source.heroImageUrl),
      ),
    };
  },
});

export const create = mutation({
  args: {
    recipe: draftContentValidator,
    sourceIdeaId: v.optional(v.id("recipeIdeas")),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const normalizedRecipe = normalizeCategoryPayload(args.recipe);
    assertRecipeBounds(normalizedRecipe);

    const title = normalizedRecipe.translations.fr.title.trim();
    const baseSlug = slugify(title || "nouvelle-recette");
    const slug = await getAvailableSlug(ctx, baseSlug);
    assertNoSelfRelatedRecipe(slug, normalizedRecipe.relatedRecipeSlugs);

    const storedTranslations = toStoredTranslations(
      normalizedRecipe.translations,
    );
    const initialRecipe = {
      slug,
      heroImageUrl: "",
      defaultLocale: normalizedRecipe.defaultLocale,
      referenceServings: normalizedRecipe.referenceServings,
      relatedRecipeSlugs: normalizedRecipe.relatedRecipeSlugs,
      translations: storedTranslations,
      ...toStoredCategoryFields(normalizedRecipe),
      status: "draft",
    } as const;
    assertStoredRecipeBytes(initialRecipe);
    const recipeId = await ctx.db.insert("recipes", initialRecipe);

    const now = Date.now();
    const initialDraft = {
      recipeId,
      heroImageUrl: "",
      defaultLocale: normalizedRecipe.defaultLocale,
      referenceServings: normalizedRecipe.referenceServings,
      relatedRecipeSlugs: normalizedRecipe.relatedRecipeSlugs,
      translations: storedTranslations,
      ...toStoredCategoryFields(normalizedRecipe),
      revision: 0,
      publishedRevision: -1,
      updatedAt: now,
    };
    assertProspectiveDraft(initialDraft, slug);
    await ctx.db.insert("recipeDrafts", initialDraft);
    if (args.sourceIdeaId) {
      await linkIdeaToRecipe(ctx, args.sourceIdeaId, recipeId);
    }

    return {
      recipeId,
      slug,
      title: title || "Nouvelle recette",
      revision: 0,
      publishedRevision: -1,
      savedAt: now,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);

    return await ctx.storage.generateUploadUrl();
  },
});

export const saveDraft = mutation({
  args: {
    slug: v.string(),
    recipe: draftContentValidator,
    expectedRevision: v.number(),
    force: v.optional(v.boolean()),
    preserveStepIngredientUses: v.optional(v.union(
      v.boolean(),
      v.object({ fr: v.boolean(), en: v.boolean() }),
    )),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const normalizedRecipe = normalizeCategoryPayload(args.recipe);

    const existing = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!existing) {
      throw new Error("RECIPE_NOT_FOUND");
    }
    assertNoSelfRelatedRecipe(
      existing.slug,
      normalizedRecipe.relatedRecipeSlugs,
    );

    const currentDraft = await getRecipeDraft(ctx, existing._id);
    const currentRevision = currentDraft?.revision ?? 0;

    if (!args.force && args.expectedRevision !== currentRevision) {
      throw new Error(`RECIPE_DRAFT_CONFLICT:${currentRevision}`);
    }

    const revision = currentRevision + 1;
    const savedAt = Date.now();
    const legacyStepLocales = typeof args.preserveStepIngredientUses === "boolean"
      ? { fr: args.preserveStepIngredientUses, en: args.preserveStepIngredientUses }
      : args.preserveStepIngredientUses ?? { fr: false, en: false };
    const effectiveRecipe = legacyStepLocales.fr || legacyStepLocales.en
      ? {
          ...normalizedRecipe,
          translations: mergeLegacyStepMetadata(
            normalizedRecipe.translations,
            toEditableTranslations(
              (currentDraft ?? existing).translations,
              existing.slug,
            ),
            legacyStepLocales,
          ),
        }
      : normalizedRecipe;
    assertRecipeBounds(effectiveRecipe);

    const storedTranslations = toStoredTranslations(
      effectiveRecipe.translations,
      currentDraft?.translations ?? existing.translations,
    );
    const contentPatch = {
      defaultLocale: effectiveRecipe.defaultLocale,
      referenceServings: effectiveRecipe.referenceServings,
      relatedRecipeSlugs: effectiveRecipe.relatedRecipeSlugs,
      translations: storedTranslations,
      ...toStoredCategoryFields(effectiveRecipe),
      revision,
      updatedAt: savedAt,
    };
    let draftId: Id<"recipeDrafts">;
    if (currentDraft) {
      assertProspectiveDraft(
        { ...currentDraft, ...contentPatch },
        existing.slug,
      );
      await ctx.db.patch(currentDraft._id, contentPatch);
      draftId = currentDraft._id;
    } else {
      const initialDraft = {
        recipeId: existing._id,
        heroImageStorageId: existing.heroImageStorageId,
        heroImageUrl: existing.heroImageUrl,
        imageCredit: existing.imageCredit,
        defaultLocale: normalizedRecipe.defaultLocale,
        referenceServings: normalizedRecipe.referenceServings,
        relatedRecipeSlugs: normalizedRecipe.relatedRecipeSlugs,
        translations: storedTranslations,
        ...toStoredCategoryFields(normalizedRecipe),
        revision,
        publishedRevision: existing.status === "published" ? 0 : -1,
        updatedAt: savedAt,
      };
      assertProspectiveDraft(initialDraft, existing.slug);
      draftId = await ctx.db.insert("recipeDrafts", initialDraft);
    }

    const savedDraft = await ctx.db.get(draftId);
    if (!savedDraft) throw new Error("RECIPE_DRAFT_NOT_FOUND");
    return {
      recipeId: existing._id,
      slug: existing.slug,
      title: args.recipe.translations[args.recipe.defaultLocale].title,
      revision,
      publishedRevision: savedDraft.publishedRevision,
      isPublic: existing.status === "published",
      savedAt,
    };
  },
});

export const publishDraft = mutation({
  args: {
    slug: v.string(),
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await getRecipeBySlug(ctx, args.slug);
    const draft = await getRecipeDraft(ctx, recipe._id);

    if (!draft) throw new Error("RECIPE_DRAFT_NOT_FOUND");
    if (draft.revision !== args.expectedRevision) {
      throw new Error(`RECIPE_DRAFT_CONFLICT:${draft.revision}`);
    }
    const savedAt = Date.now();
    await publishDraftSnapshot(ctx, recipe, draft, savedAt);

    return {
      slug: recipe.slug,
      revision: draft.revision,
      publishedRevision: draft.revision,
      savedAt,
    };
  },
});

// Asset-only maintenance for already published legacy recipes. Their content
// may predate today's readiness rules, so verify it is unchanged instead.
export const publishImageOnly = internalMutation({
  args: { slug: v.string(), expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const recipe = await getRecipeBySlug(ctx, args.slug);
    const draft = await getRecipeDraft(ctx, recipe._id);
    if (recipe.status !== "published" || !draft) {
      throw new Error("RECIPE_NOT_PUBLISHED");
    }
    assertExpectedRevision(draft, args.expectedRevision);
    if (
      JSON.stringify(toEditableRecipeContent(recipe, recipe.slug)) !==
      JSON.stringify(toEditableRecipeContent(draft, recipe.slug))
    ) {
      throw new Error("RECIPE_CONTENT_CHANGED");
    }
    if (!draft.heroImageStorageId || !(await ctx.db.system.get(draft.heroImageStorageId))) {
      throw new Error("RECIPE_IMAGE_NOT_FOUND");
    }
    await ctx.db.patch(recipe._id, {
      heroImageStorageId: draft.heroImageStorageId,
      heroImageUrl: draft.heroImageUrl,
      imageCredit: draft.imageCredit,
    });
    await ctx.db.patch(draft._id, {
      publishedRevision: draft.revision,
      updatedAt: Date.now(),
    });
    // Retain the previous stored image so this catalog-wide change is reversible.
    return { slug: recipe.slug, publishedRevision: draft.revision };
  },
});

export const discardDraft = mutation({
  args: {
    slug: v.string(),
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await getRecipeBySlug(ctx, args.slug);
    const draft = await getRecipeDraft(ctx, recipe._id);

    if (!draft) throw new Error("RECIPE_DRAFT_NOT_FOUND");
    if (draft.revision !== args.expectedRevision) {
      throw new Error(`RECIPE_DRAFT_CONFLICT:${draft.revision}`);
    }
    if (draft.publishedRevision < 0)
      throw new Error("RECIPE_HAS_NO_PUBLISHED_VERSION");
    const revision = draft.revision + 1;
    const savedAt = Date.now();
    const restoredPatch = {
      heroImageStorageId: recipe.heroImageStorageId,
      heroImageUrl: recipe.heroImageUrl,
      imageCredit: recipe.imageCredit,
      defaultLocale: recipe.defaultLocale,
      referenceServings: recipe.referenceServings,
      relatedRecipeSlugs: recipe.relatedRecipeSlugs,
      translations: recipe.translations,
      ...toStoredCategoryFields(resolveRecipeCategories(recipe)),
      revision,
      publishedRevision: revision,
      updatedAt: savedAt,
    };
    assertProspectiveDraft({ ...draft, ...restoredPatch }, recipe.slug);
    await ctx.db.patch(draft._id, restoredPatch);
    await deleteStorageIfOrphaned(
      ctx,
      draft.heroImageStorageId,
      recipe.heroImageStorageId,
    );

    return {
      slug: recipe.slug,
      revision,
      publishedRevision: revision,
      savedAt,
      heroImageUrl: recipe.heroImageUrl,
      imageCredit: recipe.imageCredit,
      draft: {
        defaultLocale: recipe.defaultLocale,
        referenceServings: getReferenceServings(recipe),
        relatedRecipeSlugs: recipe.relatedRecipeSlugs ?? [],
        translations: toEditableTranslations(recipe.translations, recipe.slug),
        ...resolveRecipeCategories(recipe),
      },
    };
  },
});

export const setVisibility = mutation({
  args: {
    slug: v.string(),
    visible: v.boolean(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await getRecipeBySlug(ctx, args.slug);
    const draft = await ensureRecipeDraft(ctx, recipe);
    if (args.visible && draft.publishedRevision < 0) {
      throw new Error("RECIPE_HAS_NO_PUBLISHED_VERSION");
    }
    const status = args.visible ? "published" : "draft";
    assertStoredRecipeBytes({ ...recipe, status });
    await ctx.db.patch(recipe._id, { status });
    if (args.visible) {
      await completeLinkedIdea(ctx, recipe._id);
    } else {
      await reopenLinkedIdea(ctx, recipe._id);
    }
    return { slug: recipe.slug, isPublic: args.visible };
  },
});

export const deleteRecipe = mutation({
  args: {
    slug: v.string(),
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await getRecipeBySlug(ctx, args.slug);
    const draft = await getRecipeDraft(ctx, recipe._id);
    const currentRevision = draft?.revision ?? 0;
    if (args.expectedRevision !== currentRevision) {
      throw new Error(`RECIPE_DRAFT_CONFLICT:${currentRevision}`);
    }

    await deleteRecipeRecord(ctx, recipe.slug);

    return { slug: recipe.slug };
  },
});

export const setHeroImage = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);

    const [recipe, storedImage] = await Promise.all([
      getRecipeBySlug(ctx, args.slug),
      ctx.db.system.get(args.storageId),
    ]);

    if (!storedImage) {
      throw new Error("Image was not found in Convex Storage");
    }

    const saved = await updateDraftImage(ctx, recipe, args.expectedRevision, {
      heroImageStorageId: args.storageId,
      heroImageUrl: "",
      imageCredit: undefined,
    });

    return imageMutationSnapshot(
      ctx,
      recipe.slug,
      args.storageId,
      "",
      undefined,
      saved,
    );
  },
});

export const setUnsplashHeroImage = mutation({
  args: {
    slug: v.string(),
    imageUrl: v.string(),
    alt: v.string(),
    photographerName: v.string(),
    photographerUrl: v.string(),
    photoUrl: v.string(),
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);

    const recipe = await getRecipeBySlug(ctx, args.slug);
    const saved = await updateDraftImage(ctx, recipe, args.expectedRevision, {
      heroImageStorageId: undefined,
      heroImageUrl: args.imageUrl,
      imageCredit: {
        provider: "unsplash",
        photographerName: args.photographerName,
        photographerUrl: args.photographerUrl,
        photoUrl: args.photoUrl,
        alt: args.alt,
      },
    });

    return imageMutationSnapshot(
      ctx,
      recipe.slug,
      undefined,
      args.imageUrl,
      {
        provider: "unsplash" as const,
        photographerName: args.photographerName,
        photographerUrl: args.photographerUrl,
        photoUrl: args.photoUrl,
        alt: args.alt,
      },
      saved,
    );
  },
});

export const setOpenverseHeroImage = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    imageCredit: openverseImageCreditValidator,
    expectedRevision: v.number(),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);

    const [recipe, storedImage] = await Promise.all([
      getRecipeBySlug(ctx, args.slug),
      ctx.db.system.get(args.storageId),
    ]);

    if (!storedImage) {
      throw new Error("Image was not found in Convex Storage");
    }

    const saved = await updateDraftImage(ctx, recipe, args.expectedRevision, {
      heroImageStorageId: args.storageId,
      heroImageUrl: "",
      imageCredit: {
        provider: "openverse",
        ...args.imageCredit,
      },
    });

    return imageMutationSnapshot(
      ctx,
      recipe.slug,
      args.storageId,
      "",
      {
        provider: "openverse" as const,
        ...args.imageCredit,
      },
      saved,
    );
  },
});

export const cleanupHeroImageUpload = mutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    adminPassword: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const draft = recipe ? await getRecipeDraft(ctx, recipe._id) : null;
    const source =
      draft?.heroImageStorageId === args.storageId
        ? draft
        : recipe?.heroImageStorageId === args.storageId
          ? recipe
          : null;
    if (source) {
      const heroImageUrl = await ctx.storage.getUrl(args.storageId);
      return {
        referenced: true,
        slug: recipe?.slug ?? args.slug,
        revision: draft?.revision ?? 0,
        savedAt: draft?.updatedAt ?? recipe?._creationTime ?? Date.now(),
        heroImageUrl: heroImageUrl ?? source.heroImageUrl,
        imageCredit: source.imageCredit,
      };
    }
    const [referencingRecipe, referencingDraft] = await Promise.all([
      ctx.db
        .query("recipes")
        .withIndex("by_heroImageStorageId", (q) =>
          q.eq("heroImageStorageId", args.storageId),
        )
        .first(),
      ctx.db
        .query("recipeDrafts")
        .withIndex("by_heroImageStorageId", (q) =>
          q.eq("heroImageStorageId", args.storageId),
        )
        .first(),
    ]);
    const globalSource = referencingDraft ?? referencingRecipe;
    if (globalSource) {
      const ownerRecipe = referencingDraft
        ? await ctx.db.get(referencingDraft.recipeId)
        : referencingRecipe;
      const ownerDraft = referencingDraft
        ? referencingDraft
        : ownerRecipe
          ? await getRecipeDraft(ctx, ownerRecipe._id)
          : null;
      const heroImageUrl = await ctx.storage.getUrl(args.storageId);
      return {
        referenced: true,
        slug: ownerRecipe?.slug ?? args.slug,
        revision: ownerDraft?.revision ?? 0,
        savedAt:
          ownerDraft?.updatedAt ?? ownerRecipe?._creationTime ?? Date.now(),
        heroImageUrl: heroImageUrl ?? globalSource.heroImageUrl,
        imageCredit: globalSource.imageCredit,
      };
    }
    await deleteStorageIfOrphaned(ctx, args.storageId);
    return { referenced: false, slug: args.slug };
  },
});

export const seed = mutation({
  args: {
    adminPassword: v.string(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    return materializeRecipeCatalog(ctx, {
      slug: args.slug,
      publish: false,
    });
  },
});

export const syncProduction = mutation({
  args: { adminPassword: v.string() },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    return materializeRecipeCatalog(ctx, { publish: true });
  },
});

export const syncProductionRecipe = mutation({
  args: {
    adminPassword: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    assertRecipeAdminPassword(args.adminPassword);
    return materializeRecipeCatalog(ctx, {
      slug: args.slug,
      publish: true,
    });
  },
});

async function localize(ctx: QueryCtx, recipe: RecipeDoc, locale: PublicLocale) {
  if (!recipe.translations || !recipe.defaultLocale) {
    throw new Error(`Recipe ${recipe.slug} has not been migrated`);
  }

  const translation = publishedTranslation(recipe, locale);
  const { servings, yieldLabel, ...content } = translation;
  const publicContent = toEditableLocalizedRecipe(
    translation,
    locale,
    recipe.slug,
  );
  const storedHeroImageUrl = recipe.heroImageStorageId
    ? await ctx.storage.getUrl(recipe.heroImageStorageId)
    : null;
  const relatedRecipes = (
    await Promise.all(
      [...new Set(recipe.relatedRecipeSlugs ?? [])]
        .filter((slug) => slug !== recipe.slug)
        .slice(0, 20)
        .map(async (slug) => {
          const related = await ctx.db
            .query("recipes")
            .withIndex("by_slug", (q) => q.eq("slug", slug))
            .unique();
          if (!related || related.status !== "published") return null;
          return {
            slug: related.slug,
            title: publishedTranslation(related, locale).title,
          };
        }),
    )
  ).filter((item): item is { slug: string; title: string } => item !== null);

  return {
    _id: recipe._id,
    _creationTime: recipe._creationTime,
    slug: recipe.slug,
    heroImageUrl: storedHeroImageUrl ?? recipe.heroImageUrl,
    ...((!storedHeroImageUrl || recipe.imageCredit?.provider === "openverse") &&
    recipe.imageCredit
      ? { imageCredit: recipe.imageCredit }
      : {}),
    defaultLocale: recipe.defaultLocale,
    referenceServings: getReferenceServings(recipe),
    relatedRecipes,
    ...resolveRecipeCategories(recipe),
    status: recipe.status,
    ...publicContent,
    // Rollout 1 remains additive: old clients keep reading string steps while
    // new clients prefer stepDetails. Rollout 2 can make stepDetails canonical.
    sections: content.sections.map((section, sectionIndex) => ({
      title: section.title,
      steps: section.steps,
      stepDetails: publicContent.sections[sectionIndex]?.steps ?? [],
    })),
    restTime: content.restTime ?? "",
    equipment: content.equipment ?? [],
    yieldLabel: resolveYieldLabel({
      locale,
      slug: recipe.slug,
      yieldLabel,
      servings,
    }),
  };
}

async function localizeSummary(
  ctx: QueryCtx,
  recipe: RecipeDoc,
  locale: PublicLocale,
) {
  const translation = publishedTranslation(recipe, locale);
  const [storedHeroImageUrl, commentSummary] = await Promise.all([
    recipe.heroImageStorageId
      ? ctx.storage.getUrl(recipe.heroImageStorageId)
      : Promise.resolve(null),
    ctx.db
      .query("recipeCommentSummaries")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
      .unique(),
    ctx.db
      .query("recipeMakeSummaries")
      .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
      .unique(),
  ]);
  const recipeMakeSummary = await ctx.db
    .query("recipeMakeSummaries")
    .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
    .unique();
  return {
    _id: recipe._id,
    _creationTime: recipe._creationTime,
    slug: recipe.slug,
    heroImageUrl: storedHeroImageUrl ?? recipe.heroImageUrl,
    ...resolveRecipeCategories(recipe),
    title: translation.title,
    author: translation.author,
    description: translation.description,
    prepTime: translation.prepTime,
    cookTime: translation.cookTime,
    totalTime: translation.totalTime,
    timeLabel: translation.timeLabel,
    commentCount: (recipeMakeSummary?.makeCount ?? commentSummary?.commentCount ?? 0),
    ingredients: translation.ingredients.map(({ name }) => ({ name })),
    yieldLabel: resolveYieldLabel({
      locale,
      slug: recipe.slug,
      yieldLabel: translation.yieldLabel,
      servings: translation.servings,
    }),
    stepCount: translation.sections.reduce(
      (count, section) => count + section.steps.length,
      0,
    ),
  };
}

function getReferenceServings(
  source: Pick<
    RecipeDoc | RecipeDraftDoc,
    "referenceServings" | "translations"
  >,
) {
  return resolveReferenceServings(
    source.referenceServings,
    source.translations.fr.servings,
  );
}

type StoredLocalizedRecipe = RecipeDoc["translations"][Locale];
type EditableLocalizedRecipe = Omit<
  StoredLocalizedRecipe,
  | "servings"
  | "yieldLabel"
  | "restTime"
  | "equipment"
  | "ingredients"
  | "sections"
  | "subRecipes"
> & {
  yieldLabel: string;
  restTime: string;
  equipment: string[];
  ingredients: Array<
    StoredLocalizedRecipe["ingredients"][number] & { id: string }
  >;
  sections: Array<{
    title: string;
    steps: Array<{
      id: string;
      text: string;
      ingredientUses: Array<{
        ingredientId: string;
        amount?: { quantity: string; unit: string };
      }>;
    }>;
  }>;
  subRecipes: Array<{
    title: string;
    ingredients: Array<
      StoredLocalizedRecipe["ingredients"][number] & { id: string }
    >;
  }>;
};
type EditableTranslations = Record<Locale, EditableLocalizedRecipe>;

function toEditableTranslations(
  translations: RecipeDoc["translations"],
  slug: string,
): EditableTranslations {
  return {
    fr: toEditableLocalizedRecipe(translations.fr, "fr", slug),
    en: toEditableLocalizedRecipe(translations.en, "en", slug),
  };
}

function toEditableRecipeContent(
  source: Pick<
    RecipeDoc | RecipeDraftDoc,
    | "defaultLocale"
    | "referenceServings"
    | "relatedRecipeSlugs"
    | "translations"
    | "tags"
    | "categories"
    | "legacyCategoryLabels"
  >,
  slug: string,
): RecipeDraftContentLike {
  return {
    defaultLocale: source.defaultLocale,
    referenceServings: getReferenceServings(source),
    relatedRecipeSlugs: source.relatedRecipeSlugs ?? [],
    translations: toEditableTranslations(source.translations, slug),
    ...resolveRecipeCategories(source),
  };
}

function toEditableLocalizedRecipe(
  localized: StoredLocalizedRecipe,
  locale: PublicLocale,
  slug: string,
): EditableLocalizedRecipe {
  const { servings, yieldLabel, ...content } = localized;
  return {
    ...content,
    ingredients: content.ingredients.map((ingredient, index) => ({
      ...ingredient,
      id: ingredient.id ?? legacyIngredientId("main", index),
    })),
    sections: content.sections.map((section, sectionIndex) => ({
      title: section.title,
      steps:
        section.stepDetails ??
        section.steps.map((text, stepIndex) => ({
          id: legacyStepId(sectionIndex, stepIndex),
          text,
          ingredientUses: [],
        })),
    })),
    subRecipes: content.subRecipes.map((subRecipe, subRecipeIndex) => ({
      ...subRecipe,
      ingredients: subRecipe.ingredients.map((ingredient, index) => ({
        ...ingredient,
        id: ingredient.id ?? legacyIngredientId(`sub-${subRecipeIndex}`, index),
      })),
    })),
    restTime: content.restTime ?? "",
    equipment: content.equipment ?? [],
    yieldLabel: resolveYieldLabel({ locale, slug, yieldLabel, servings }),
  };
}

function toStoredTranslations(
  translations: EditableTranslations,
  legacyTranslations?: RecipeDoc["translations"],
): RecipeDoc["translations"] {
  return {
    fr: toStoredLocalizedRecipe(
      translations.fr,
      legacyTranslations?.fr.servings,
    ),
    en: toStoredLocalizedRecipe(
      translations.en,
      legacyTranslations?.en.servings,
    ),
  };
}

function toStoredLocalizedRecipe(
  localized: EditableLocalizedRecipe,
  servings: StoredLocalizedRecipe["servings"] | undefined,
): StoredLocalizedRecipe {
  return {
    ...localized,
    sections: localized.sections.map((section) => ({
      title: section.title,
      steps: section.steps.map((step) => step.text),
      stepDetails: section.steps,
    })),
    restTime: localized.restTime ?? "",
    equipment: localized.equipment ?? [],
    servings: servings ?? null,
  };
}

function mergeLegacyStepMetadata(
  incoming: EditableTranslations,
  current: EditableTranslations,
  locales: { fr: boolean; en: boolean },
): EditableTranslations {
  return {
    fr: locales.fr
      ? mergeLegacyLocalizedStepMetadata(incoming.fr, current.fr)
      : incoming.fr,
    en: locales.en
      ? mergeLegacyLocalizedStepMetadata(incoming.en, current.en)
      : incoming.en,
  };
}

function mergeLegacyLocalizedStepMetadata(
  incoming: EditableLocalizedRecipe,
  current: EditableLocalizedRecipe,
): EditableLocalizedRecipe {
  const mainIngredients = reconcileIngredientIds(
    incoming.ingredients,
    current.ingredients,
  );
  const subRecipeMatches = matchCurrentIndices(
    incoming.subRecipes,
    current.subRecipes,
    (subRecipe, candidate) => candidate.title === subRecipe.title,
  );
  const subRecipes = incoming.subRecipes.map((subRecipe, subRecipeIndex) => {
    const currentIndex = subRecipeMatches[subRecipeIndex];
    return {
      ...subRecipe,
      ingredients: reconcileIngredientIds(
        subRecipe.ingredients,
        currentIndex !== undefined
          ? current.subRecipes[currentIndex].ingredients
          : [],
      ),
    };
  });
  const validIngredientIds = new Set([
    ...mainIngredients.map((ingredient) => ingredient.id),
    ...subRecipes.flatMap((subRecipe) =>
      subRecipe.ingredients.map((ingredient) => ingredient.id),
    ),
  ]);
  const sectionMatches = matchCurrentIndices(
    incoming.sections,
    current.sections,
    (section, candidate) => candidate.title === section.title,
  );
  return {
    ...incoming,
    ingredients: mainIngredients,
    subRecipes,
    sections: incoming.sections.map((section, sectionIndex) => ({
      ...section,
      steps: (() => {
        const currentIndex = sectionMatches[sectionIndex];
        const currentSteps = currentIndex !== undefined
          ? current.sections[currentIndex].steps
          : [];
        const matches = matchCurrentIndices(
          section.steps,
          currentSteps,
          (step, candidate) => candidate.text === step.text,
        );
        return section.steps.map((step, stepIndex) => {
          const previousIndex = matches[stepIndex];
          const previous =
            previousIndex !== undefined ? currentSteps[previousIndex] : undefined;
          return previous
            ? {
                ...step,
                id: previous.id,
                ingredientUses: previous.ingredientUses.filter((use) =>
                  validIngredientIds.has(use.ingredientId),
                ),
              }
            : step;
        });
      })(),
    })),
  };
}

function reconcileIngredientIds(
  incoming: EditableLocalizedRecipe["ingredients"],
  current: EditableLocalizedRecipe["ingredients"],
) {
  const matches = matchCurrentIndices(
    incoming,
    current,
    (ingredient, candidate) =>
      candidate.name === ingredient.name &&
      candidate.quantity === ingredient.quantity &&
      candidate.unit === ingredient.unit,
  );
  return incoming.map((ingredient, index) => {
    const currentIndex = matches[index];
    return {
      ...ingredient,
      id: currentIndex !== undefined ? current[currentIndex].id : ingredient.id,
    };
  });
}

function matchCurrentIndices<Incoming, Current>(
  incoming: Incoming[],
  current: Current[],
  isExactMatch: (incoming: Incoming, current: Current) => boolean,
) {
  const available = new Set(current.map((_, index) => index));
  const matches = incoming.map((): number | undefined => undefined);

  for (const [incomingIndex, item] of incoming.entries()) {
    const exactIndex = current.findIndex(
      (candidate, currentIndex) =>
        available.has(currentIndex) && isExactMatch(item, candidate),
    );
    if (exactIndex < 0) continue;
    matches[incomingIndex] = exactIndex;
    available.delete(exactIndex);
  }

  for (const incomingIndex of incoming.keys()) {
    if (matches[incomingIndex] !== undefined || !available.has(incomingIndex)) continue;
    matches[incomingIndex] = incomingIndex;
    available.delete(incomingIndex);
  }

  return matches;
}

async function getAvailableSlug(ctx: MutationCtx, baseSlug: string) {
  let candidate = baseSlug;
  let suffix = 2;

  while (
    await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique()
  ) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function getRecipeBySlug(ctx: MutationCtx, slug: string) {
  const recipe = await ctx.db
    .query("recipes")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!recipe) throw new Error("RECIPE_NOT_FOUND");
  return recipe;
}

async function getRecipeDraft(
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
) {
  return await ctx.db
    .query("recipeDrafts")
    .withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
    .unique();
}

async function ensureRecipeDraft(ctx: MutationCtx, recipe: RecipeDoc) {
  const existing = await getRecipeDraft(ctx, recipe._id);
  if (existing) return existing;

  const initialDraft = {
    recipeId: recipe._id,
    heroImageStorageId: recipe.heroImageStorageId,
    heroImageUrl: recipe.heroImageUrl,
    imageCredit: recipe.imageCredit,
    defaultLocale: recipe.defaultLocale,
    referenceServings: recipe.referenceServings,
    relatedRecipeSlugs: recipe.relatedRecipeSlugs,
    translations: recipe.translations,
    ...toStoredCategoryFields(resolveRecipeCategories(recipe)),
    revision: 0,
    publishedRevision: recipe.status === "published" ? 0 : -1,
    updatedAt: Date.now(),
  };
  assertProspectiveDraft(initialDraft, recipe.slug);
  const draftId = await ctx.db.insert("recipeDrafts", initialDraft);

  const created = await ctx.db.get(draftId);
  if (!created) throw new Error("RECIPE_DRAFT_NOT_FOUND");
  return created;
}

type DraftImagePatch = Pick<
  RecipeDraftDoc,
  "heroImageStorageId" | "heroImageUrl" | "imageCredit"
>;

async function updateDraftImage(
  ctx: MutationCtx,
  recipe: RecipeDoc,
  expectedRevision: number,
  patch: DraftImagePatch,
) {
  const draft = await ensureRecipeDraft(ctx, recipe);
  assertExpectedRevision(draft, expectedRevision);
  assertImagePatchLimits(patch);
  const revision = draft.revision + 1;
  const savedAt = Date.now();
  assertRecipeDraftBytes({ ...draft, ...patch, revision, updatedAt: savedAt });
  const previousStorageId = draft.heroImageStorageId;
  await ctx.db.patch(draft._id, { ...patch, revision, updatedAt: savedAt });
  await deleteStorageIfOrphaned(
    ctx,
    previousStorageId,
    patch.heroImageStorageId,
    recipe.heroImageStorageId,
  );
  return { revision, savedAt };
}

async function imageMutationSnapshot(
  ctx: MutationCtx,
  slug: string,
  storageId: Id<"_storage"> | undefined,
  fallbackUrl: string,
  imageCredit: RecipeDraftDoc["imageCredit"],
  saved: { revision: number; savedAt: number },
) {
  const storedUrl = storageId ? await ctx.storage.getUrl(storageId) : null;
  return {
    slug,
    ...saved,
    heroImageUrl: storedUrl ?? fallbackUrl,
    imageCredit,
  };
}

async function deleteStorageIfOrphaned(
  ctx: MutationCtx,
  candidate: Id<"_storage"> | undefined,
  ...references: Array<Id<"_storage"> | undefined>
) {
  if (!candidate || references.includes(candidate)) return;
  const [recipeReference, draftReference] = await Promise.all([
    ctx.db
      .query("recipes")
      .withIndex("by_heroImageStorageId", (q) =>
        q.eq("heroImageStorageId", candidate),
      )
      .first(),
    ctx.db
      .query("recipeDrafts")
      .withIndex("by_heroImageStorageId", (q) =>
        q.eq("heroImageStorageId", candidate),
      )
      .first(),
  ]);
  if (recipeReference || draftReference) return;
  if (await ctx.db.system.get("_storage", candidate))
    await ctx.storage.delete(candidate);
}

function assertImagePatchLimits(patch: DraftImagePatch) {
  assertRecipeImageLimits(patch.heroImageUrl, patch.imageCredit);
}

function assertProspectiveDraft(
  draft: {
    defaultLocale: Locale;
    tags?: string[];
    categories?: RecipeCategory[];
    legacyCategoryLabels?: string[];
    relatedRecipeSlugs?: string[];
    translations: RecipeDoc["translations"];
    heroImageUrl?: string;
    imageCredit?: RecipeDraftDoc["imageCredit"];
    [key: string]: unknown;
  },
  slug: string,
) {
  assertRecipeBounds({
    ...draft,
    relatedRecipeSlugs: draft.relatedRecipeSlugs ?? [],
    ...resolveRecipeCategories(draft),
    translations: toEditableTranslations(draft.translations, slug),
  });
  assertImagePatchLimits({
    heroImageStorageId: undefined,
    heroImageUrl: draft.heroImageUrl ?? "",
    imageCredit: draft.imageCredit,
  });
  assertRecipeDraftBytes(draft);
}

function assertStoredRecipeBytes(recipe: unknown) {
  assertRecipeDraftBytes(recipe);
}

function assertExpectedRevision(
  draft: RecipeDraftDoc,
  expectedRevision: number,
) {
  if (expectedRevision !== draft.revision) {
    throw new Error(`RECIPE_DRAFT_CONFLICT:${draft.revision}`);
  }
}

function assertDraftReadyForPublication(draft: RecipeDraftDoc, slug: string) {
  if (!isDraftReadyForPublication(draft, slug)) {
    throw new Error("RECIPE_NOT_READY");
  }
}

function isDraftReadyForPublication(draft: RecipeDraftDoc, slug: string) {
  return getRecipeReadiness(
    toEditableRecipeContent(draft, slug),
    Boolean(draft.heroImageStorageId || draft.heroImageUrl),
  ).blockers.length === 0;
}

async function publishDraftSnapshot(
  ctx: MutationCtx,
  recipe: RecipeDoc,
  draft: RecipeDraftDoc,
  savedAt: number,
) {
  assertRecipeBounds(toEditableRecipeContent(draft, recipe.slug));
  assertDraftReadyForPublication(draft, recipe.slug);
  const relatedRecipeSlugs = normalizeRelatedRecipeSlugs(
    draft.relatedRecipeSlugs ?? [],
  );
  await assertRelatedRecipesPublishable(ctx, recipe.slug, relatedRecipeSlugs);

  const publishedPatch = {
    heroImageStorageId: draft.heroImageStorageId,
    heroImageUrl: draft.heroImageUrl,
    imageCredit: draft.imageCredit,
    defaultLocale: draft.defaultLocale,
    referenceServings: draft.referenceServings,
    relatedRecipeSlugs,
    translations: draft.translations,
    ...toStoredCategoryFields(resolveRecipeCategories(draft)),
    status: draft.publishedRevision < 0 ? "published" : recipe.status,
  } as const;
  assertStoredRecipeBytes({ ...recipe, ...publishedPatch });
  await ctx.db.patch(recipe._id, publishedPatch);
  assertProspectiveDraft(
    { ...draft, publishedRevision: draft.revision, updatedAt: savedAt },
    recipe.slug,
  );
  await ctx.db.patch(draft._id, {
    relatedRecipeSlugs,
    publishedRevision: draft.revision,
    updatedAt: savedAt,
  });
  await deleteStorageIfOrphaned(
    ctx,
    recipe.heroImageStorageId,
    draft.heroImageStorageId,
  );
  if (draft.publishedRevision < 0 || recipe.status === "published") {
    await completeLinkedIdea(ctx, recipe._id);
  }
}

function assertRecipeBounds(recipe: RecipeDraftContentLike) {
  assertRecipeDraftBounds(recipe);
}

function toStoredCategoryFields(source: {
  categories: readonly RecipeCategory[];
  legacyCategoryLabels?: readonly string[];
}) {
  const categories = [...source.categories];
  const legacyCategoryLabels = [...(source.legacyCategoryLabels ?? [])];
  return {
    categories,
    legacyCategoryLabels,
    tags: toLegacyTags(categories, legacyCategoryLabels),
  };
}

function normalizeCategoryPayload<
  T extends {
    tags?: readonly string[];
    categories?: readonly RecipeCategory[];
    legacyCategoryLabels?: readonly string[];
    relatedRecipeSlugs?: readonly string[];
    translations: Record<
      Locale,
      { restTime?: string; equipment?: readonly string[] }
    >;
  },
>(source: T) {
  return {
    ...source,
    relatedRecipeSlugs: normalizeRelatedRecipeSlugs(
      source.relatedRecipeSlugs ?? [],
    ),
    translations: {
      fr: {
        ...source.translations.fr,
        restTime: source.translations.fr.restTime ?? "",
        equipment: [...(source.translations.fr.equipment ?? [])],
      },
      en: {
        ...source.translations.en,
        restTime: source.translations.en.restTime ?? "",
        equipment: [...(source.translations.en.equipment ?? [])],
      },
    },
    ...resolveRecipeCategories(source),
  };
}

function normalizeRelatedRecipeSlugs(values: readonly string[]) {
  const slugs = [
    ...new Set(
      values.flatMap((value) => {
        const slug = value.trim();
        return slug ? [slug] : [];
      }),
    ),
  ];
  if (slugs.some((slug) => !recipeSlugPattern.test(slug))) {
    throw new Error("RECIPE_RELATED_RECIPE_INVALID");
  }
  return slugs;
}

function assertNoSelfRelatedRecipe(
  slug: string,
  relatedSlugs: readonly string[],
) {
  if (relatedSlugs.includes(slug)) {
    throw new Error("RECIPE_RELATED_RECIPE_SELF_REFERENCE");
  }
}

async function assertRelatedRecipesPublishable(
  ctx: MutationCtx,
  recipeSlug: string,
  relatedSlugs: readonly string[],
) {
  assertNoSelfRelatedRecipe(recipeSlug, relatedSlugs);
  const invalidSlug = await firstUnavailableRelatedRecipe(ctx, relatedSlugs);
  if (invalidSlug) {
    throw new Error(`RECIPE_RELATED_RECIPE_NOT_FOUND:${invalidSlug}`);
  }
}

async function firstUnavailableRelatedRecipe(
  ctx: MutationCtx,
  relatedSlugs: readonly string[],
) {
  const relations = await Promise.all(
    relatedSlugs.map(async (slug) => ({
      slug,
      recipe: await ctx.db
        .query("recipes")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique(),
    })),
  );
  const invalid = relations.find(
    ({ recipe }) => !recipe || recipe.status !== "published",
  );
  return invalid?.slug ?? null;
}

function assertRecipeAdminPassword(adminPassword: string) {
  const expectedPassword = process.env.RECIPE_ADMIN_PASSWORD;

  if (!expectedPassword || adminPassword !== expectedPassword) {
    throw new Error("RECIPE_ADMIN_REQUIRED");
  }
}

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "nouvelle-recette";
}
