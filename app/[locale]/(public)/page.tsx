import { fetchQuery } from "convex/nextjs";
import { unstable_cache } from "next/cache";
import { HomePage } from "@/components/home/home-page";
import { api } from "@/convex/_generated/api";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { getPublicRecipeE2EFixture } from "@/components/recipes/admin-recipe-e2e-fixtures";
import type { RecipeSummary } from "@/components/recipes/types";
import { publishedRecipesTag } from "@/lib/recipe-admin-revalidate";
import { collectPaginated } from "@/lib/convex-pagination";

type PageProps = {
  params: Promise<{
    locale: Locale;
  }>;
};

// Prerendered and regenerated at most every 5 minutes (the cached recipe list
// below sets the window), or at once through `revalidateRecipePaths` when the
// admin saves. Convex's `fetchQuery` asks for `no-store`, which would make the
// page dynamic: `unstable_cache` keeps the read cacheable. Not `force-static`:
// the explorer reads `?q=`/`?cat=` with useSearchParams, which must bail out
// to the client under its Suspense boundary rather than read as empty.
export const revalidate = 300;

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  const fixture = getPublicRecipeE2EFixture(locale);
  const recipes = fixture
    ? [{ ...fixture, commentCount: 3 }]
    : await listPublishedRecipes(locale);

  return <HomePage locale={locale} dict={dict} recipes={recipes} />;
}

const listPublishedRecipes = unstable_cache(
  async (locale: Locale) => {
    const recipes = await collectPaginated<RecipeSummary>((cursor) =>
      fetchQuery(api.recipes.list, {
        locale,
        paginationOpts: { numItems: 50, cursor },
      }),
    );
    return recipes.sort((a, b) => a.title.localeCompare(b.title, locale));
  },
  ["home-published-recipes"],
  { revalidate: 300, tags: [publishedRecipesTag] },
);
