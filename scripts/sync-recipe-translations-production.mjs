// Applies the pt-br and nl-be translation files to production, then refreshes
// the cached pages of the recipes they cover.
import { spawnSync } from "node:child_process";
import {
  recipeSlugsInFolder,
  revalidateSitePages,
} from "./lib/revalidate-site-pages.mjs";

const [recipeSlug, ...unexpectedArgs] = process.argv.slice(2);
if (unexpectedArgs.length > 0) {
  throw new Error("Pass at most one recipe slug.");
}
if (recipeSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipeSlug)) {
  throw new Error("The recipe slug is invalid.");
}

const convexArgs = ["convex", "run", "--prod", "recipeTranslations/sync:apply"];
if (recipeSlug) convexArgs.push(JSON.stringify({ slug: recipeSlug }));

const result = spawnSync("npx", convexArgs, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await revalidateSitePages(
  recipeSlug ? [recipeSlug] : recipeSlugsInFolder("convex", "recipeTranslations", "recipes"),
);
