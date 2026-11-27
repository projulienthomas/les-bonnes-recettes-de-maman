// Asks the deployed site to drop its cached copies of the given recipe pages.
// The sync scripts write to Convex directly, so without this call the
// prerendered pages would only refresh when their revalidate window ends.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const productionSiteUrl = "https://les-bonnes-recettes-de-maman.vercel.app";
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Must match maxRevalidatedRecipeSlugs in lib/recipe-admin-contracts.ts.
const batchSize = 100;
const requestTimeoutMs = 15_000;

/** Slugs of the JSON files in a recipe data folder, e.g. convex/recipeCatalog/recipes. */
export function recipeSlugsInFolder(...pathFromRoot) {
  return readdirSync(join(repositoryRoot, ...pathFromRoot))
    .filter((filename) => filename.endsWith(".json"))
    .map((filename) => filename.replace(/\.json$/, ""))
    .sort();
}

/**
 * Never throws: a failed refresh must not fail a sync that already succeeded.
 * Returns whether the refresh went through.
 * The site origin is NEXT_PUBLIC_SITE_URL (same variable as lib/site.ts) or
 * the production URL.
 */
export async function revalidateSitePages(slugs) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? productionSiteUrl).replace(/\/+$/, "");
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return true;

  try {
    const password = process.env.RECIPE_ADMIN_PASSWORD;
    if (!password) throw new Error("RECIPE_ADMIN_PASSWORD is not set");

    const cookie = await openAdminSession(origin, password);
    for (let start = 0; start < uniqueSlugs.length; start += batchSize) {
      const batch = uniqueSlugs.slice(start, start + batchSize);
      const response = await fetch(`${origin}/api/admin/recipes/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ slugs: batch }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`revalidate route answered HTTP ${response.status}`);
      }
    }
    console.log(`Refreshed cached pages on ${origin} for ${uniqueSlugs.length} recipe(s).`);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: the sync succeeded but the cached pages on ${origin} could not be refreshed (${reason}). ` +
        "Pages will refresh on their own within 5 minutes.",
    );
    return false;
  }
}

async function openAdminSession(origin, password) {
  const response = await fetch(`${origin}/api/admin/recipes/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: "fr", password }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`admin login answered HTTP ${response.status}`);
  }
  const sessionCookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .find((pair) => pair.startsWith("recipe-admin-access="));
  if (!sessionCookie) throw new Error("admin login returned no session cookie");
  return sessionCookie;
}
