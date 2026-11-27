import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  recipeSlugsInFolder,
  revalidateSitePages,
} from "./lib/revalidate-site-pages.mjs";

const adminPassword = process.env.RECIPE_ADMIN_PASSWORD;
if (!adminPassword) {
  throw new Error("RECIPE_ADMIN_PASSWORD is required to synchronize recipes.");
}

const productionUrl =
  process.env.CONVEX_PRODUCTION_URL ??
  (process.env.VERCEL_ENV === "production"
    ? process.env.NEXT_PUBLIC_CONVEX_URL
    : undefined);
if (!productionUrl) {
  throw new Error(
    "CONVEX_PRODUCTION_URL is required to synchronize production recipes.",
  );
}

const client = new ConvexHttpClient(productionUrl);
const [recipeSlug, ...unexpectedArgs] = process.argv.slice(2);
if (unexpectedArgs.length > 0) {
  throw new Error("Pass at most one recipe slug.");
}
if (process.env.RECIPE_SYNC_MODE === "single" && !recipeSlug) {
  throw new Error("A recipe slug is required for targeted production sync.");
}
if (recipeSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipeSlug)) {
  throw new Error("The recipe slug is invalid.");
}

const syncProduction = makeFunctionReference(
  recipeSlug ? "recipes:syncProductionRecipe" : "recipes:syncProduction",
);
const result = await client.mutation(
  syncProduction,
  recipeSlug ? { adminPassword, slug: recipeSlug } : { adminPassword },
);
console.log(JSON.stringify(result, null, 2));

await revalidateSitePages(
  recipeSlug ? [recipeSlug] : recipeSlugsInFolder("convex", "recipeCatalog", "recipes"),
);
