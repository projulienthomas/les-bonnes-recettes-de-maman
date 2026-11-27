import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { GuidedCookModeFromSearchParams } from "@/components/recipes/guided-cook-mode-from-search-params";
import { api } from "@/convex/_generated/api";
import { getDictionary } from "@/i18n/get-dictionary";
import { hasLocale, type Locale } from "@/i18n/config";
import { getPublicRecipeE2EFixture } from "@/components/recipes/admin-recipe-e2e-fixtures";
import { listPublishedRecipeSlugs } from "@/lib/recipe-static-params";
import {
  normalizeRecipeForDisplay,
  type PublicRecipeWire,
} from "@/lib/recipe-public";

// Static like the recipe page: same data, same refresh window and admin
// revalidation (`revalidateRecipePaths`). `?personnes=` is read in the browser.
export const dynamic = "force-static";
export const revalidate = 300;

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return hasLocale(params.locale) ? listPublishedRecipeSlugs(params.locale) : [];
}

const getRecipe = cache((locale: Locale, slug: string) => {
  const fixture = getPublicRecipeE2EFixture(locale, slug);
  const result = fixture
    ? Promise.resolve(fixture)
    : fetchQuery(api.recipes.getBySlug, { locale, slug });
  return result.then((recipe) =>
    recipe ? normalizeRecipeForDisplay(recipe as PublicRecipeWire) : null,
  );
});

export default async function CookPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!hasLocale(locale)) notFound();

  const [dict, recipe] = await Promise.all([
    getDictionary(locale),
    getRecipe(locale, slug),
  ]);
  if (!recipe) notFound();

  return (
    <GuidedCookModeFromSearchParams locale={locale} dict={dict} recipe={recipe} />
  );
}
