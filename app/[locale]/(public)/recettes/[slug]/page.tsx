import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { RecipeDetailPage } from "@/components/recipes/recipe-detail-page";
import { api } from "@/convex/_generated/api";
import { getDictionary } from "@/i18n/get-dictionary";
import { hasLocale, localeAlternates, localeDetails, type Locale } from "@/i18n/config";
import { getPublicRecipeE2EFixture } from "@/components/recipes/admin-recipe-e2e-fixtures";
import { listPublishedRecipeSlugs } from "@/lib/recipe-static-params";
import {
  normalizeRecipeForDisplay,
  type PublicRecipeWire,
} from "@/lib/recipe-public";

type PageProps = {
  params: Promise<{
    locale: Locale;
    slug: string;
  }>;
};

// Prerendered and served from cache. `fetchQuery` asks for `no-store`, which
// would make the route dynamic: `force-static` keeps it static, and the page is
// regenerated at most every 5 minutes, or at once through
// `revalidateRecipePaths` when the admin saves. `?personnes=` is read in the
// browser (ServingsFromSearchParams), and comments stay live through Convex.
export const dynamic = "force-static";
export const revalidate = 300;

export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return hasLocale(params.locale) ? listPublishedRecipeSlugs(params.locale) : [];
}

// Deduped across generateMetadata + the page render within one request.
const getRecipe = cache((locale: Locale, slug: string) => {
  const fixture = getPublicRecipeE2EFixture(locale, slug);
  const result = fixture
    ? Promise.resolve(fixture)
    : fetchQuery(api.recipes.getBySlug, { locale, slug });
  return result.then((recipe) =>
    recipe ? normalizeRecipeForDisplay(recipe as PublicRecipeWire) : null,
  );
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const recipe = await getRecipe(locale, slug);

  if (!recipe) {
    return {};
  }

  const dict = await getDictionary(locale);
  const description = recipe.description?.trim() || `${recipe.title} · ${recipe.timeLabel} · ${dict.site.description}`;

  return {
    title: recipe.title,
    description,
    alternates: {
      canonical: `/${locale}/recettes/${slug}`,
      languages: localeAlternates(`/recettes/${slug}`),
    },
    openGraph: {
      type: "article",
      siteName: dict.site.wordmark,
      locale: localeDetails[locale].ogLocale,
      title: recipe.title,
      description,
      url: `/${locale}/recettes/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: recipe.title,
      description,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { locale, slug } = await params;
  const [dict, recipe] = await Promise.all([
    getDictionary(locale),
    getRecipe(locale, slug),
  ]);

  if (!recipe) {
    notFound();
  }

  return (
    <RecipeDetailPage
      locale={locale}
      dict={dict}
      recipe={recipe}
    />
  );
}
