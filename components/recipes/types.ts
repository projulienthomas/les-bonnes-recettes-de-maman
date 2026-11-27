import type { Id } from "@/convex/_generated/dataModel";
import type { RecipeReadiness } from "@/lib/recipe-admin-domain";
import type { RecipeCategory } from "@/lib/recipe-categories";

export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
};

export type StepIngredientUse = {
  ingredientId: string;
  amount?: { quantity: string; unit: string };
};

export type RecipeStep = {
  id: string;
  text: string;
  ingredientUses: StepIngredientUse[];
};

export type RecipeSection = {
  title: string;
  steps: RecipeStep[];
};

export type SubRecipe = {
  title: string;
  ingredients: Ingredient[];
};

export type Recipe = {
  _id: Id<"recipes">;
  _creationTime: number;
  slug: string;
  heroImageUrl: string;
  imageCredit?:
    | {
        provider: "unsplash";
        photographerName: string;
        photographerUrl: string;
        photoUrl: string;
        alt: string;
      }
    | {
        provider: "openverse";
        title: string;
        creator: string;
        creatorUrl: string;
        imageUrl: string;
        landingUrl: string;
        license: string;
        licenseVersion: string;
        licenseUrl: string;
        source: string;
        attribution: string;
        alt: string;
      };
  defaultLocale: "fr" | "en";
  referenceServings?: number;
  categories: RecipeCategory[];
  legacyCategoryLabels?: string[];
  status: "draft" | "published";
  title: string;
  author: string;
  description: string;
  yieldLabel: string;
  prepTime: string;
  cookTime: string;
  restTime: string;
  totalTime: string;
  timeLabel: string;
  temperature: string;
  equipment: string[];
  relatedRecipes: Array<{ slug: string; title: string }>;
  ingredients: Ingredient[];
  sections: RecipeSection[];
  subRecipes: SubRecipe[];
  notes: string[];
};

export type RecipeSummary = Pick<
  Recipe,
  | "_id"
  | "_creationTime"
  | "slug"
  | "heroImageUrl"
  | "categories"
  | "legacyCategoryLabels"
  | "title"
  | "author"
  | "description"
  | "prepTime"
  | "cookTime"
  | "timeLabel"
> & {
  ingredients: Array<Pick<Ingredient, "name">>;
  commentCount: number;
  /** Absent until the backend exposing it is deployed. */
  yieldLabel?: string;
  stepCount?: number;
  totalTime?: string;
};

export type EditableRecipeContent = {
  defaultLocale: "fr" | "en";
  referenceServings?: number;
  relatedRecipeSlugs: string[];
  translations: {
    fr: Omit<
      Recipe,
      | "_id"
      | "_creationTime"
      | "slug"
      | "heroImageUrl"
      | "imageCredit"
      | "defaultLocale"
      | "referenceServings"
      | "categories"
      | "legacyCategoryLabels"
      | "status"
      | "relatedRecipes"
    >;
    en: Omit<
      Recipe,
      | "_id"
      | "_creationTime"
      | "slug"
      | "heroImageUrl"
      | "imageCredit"
      | "defaultLocale"
      | "referenceServings"
      | "categories"
      | "legacyCategoryLabels"
      | "status"
      | "relatedRecipes"
    >;
  };
  categories: RecipeCategory[];
  legacyCategoryLabels?: string[];
};

export type EditableRecipeSummary = {
  _id: Id<"recipes">;
  _creationTime: number;
  slug: string;
  title: string;
  heroImageUrl: string;
  imageCredit?: Recipe["imageCredit"];
  categories: RecipeCategory[];
  legacyCategoryLabels?: string[];
  status: "draft" | "published";
  revision: number;
  publishedRevision: number;
  updatedAt: number;
  isPublic: boolean;
  hasPublishedVersion: boolean;
  hasUnpublishedChanges: boolean;
  canDiscard: boolean;
  readiness: RecipeReadiness;
};

export type EditableRecipe = EditableRecipeSummary & EditableRecipeContent;

export type RecipeIdea = {
  _id: Id<"recipeIdeas">;
  _creationTime: number;
  text: string;
  authorName: string | null;
  state: "outstanding" | "completed";
  updatedAt: number;
  edited: boolean;
  creatorKind: "participant" | "admin";
  canEdit: boolean;
  canDelete: boolean;
  linkedRecipe: {
    slug: string;
    title: string;
    isPublic: boolean;
  } | null;
};
