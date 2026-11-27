import "server-only";

import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Locale } from "@/i18n/config";
import { getPublicRecipeE2EFixture } from "@/components/recipes/admin-recipe-e2e-fixtures";
import { collectPaginated } from "@/lib/convex-pagination";

// Recipes share one slug across locales: fetch the list once per build worker.
let publishedSlugs: Promise<{ slug: string }[]> | undefined;

/**
 * Params for prerendering recipe routes at build time. Slugs published later
 * are rendered on their first visit (dynamicParams defaults to true), so a
 * Convex outage at build time only costs the prerender, not the deploy.
 */
export async function listPublishedRecipeSlugs(locale: Locale) {
  const fixture = getPublicRecipeE2EFixture(locale);
  if (fixture) return [{ slug: fixture.slug }];

  publishedSlugs ??= collectPaginated<{ slug: string }>((cursor) =>
    fetchQuery(api.recipes.listSlugs, {
      paginationOpts: { numItems: 100, cursor },
    }),
  )
    .then((recipes) => recipes.map(({ slug }) => ({ slug })))
    .catch((error: unknown) => {
      console.warn("Recipe slugs unavailable, prerendering none:", error);
      publishedSlugs = undefined;
      return [];
    });

  return publishedSlugs;
}
