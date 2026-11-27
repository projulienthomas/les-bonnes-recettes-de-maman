import Image from "next/image";
import { IntentPrefetchLink } from "./intent-prefetch-link";
import { Clock3 } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { formatRecipeByline } from "@/lib/recipe-author";
import type { RecipeSummary } from "./types";
import { RecipeCreationChooser } from "./recipe-creation-chooser";

const defaultRecipeImageUrl =
  "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1400&q=85";

type RecipeListRowsProps = {
  locale: Locale;
  dict: Dictionary;
  recipes: RecipeSummary[];
  showAddRecipeRow?: boolean;
};

export function RecipeListRows({
  locale,
  dict,
  recipes,
  showAddRecipeRow = false,
}: RecipeListRowsProps) {
  if (recipes.length === 0) return null;

  return (
    <ul className="grid gap-4">
      {recipes.map((recipe) => (
        <li key={recipe._id}>
          <IntentPrefetchLink
            href={`/${locale}/recettes/${recipe.slug}`}
            className="surface-elevated group grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-4 rounded-3xl bg-card p-3 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <span className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
              <Image
                src={recipe.heroImageUrl || defaultRecipeImageUrl}
                alt=""
                fill
                sizes="(max-width: 639px) 96px, 144px"
                className="image-outline object-cover"
              />
            </span>
            <span className="grid gap-3 px-1 py-1 sm:py-3">
              <span className="type-label inline-flex items-center gap-2 text-primary tabular-nums">
                <Clock3 className="size-4 stroke-[1.8]" />
                {recipe.timeLabel}
              </span>
              <span className="grid gap-2">
                <span className="type-card-title text-foreground">
                  {recipe.title}
                </span>
                <span className="type-byline text-muted-foreground">
                  {formatRecipeByline(
                    locale,
                    dict.recipeDetail.recipeBy,
                    recipe.author,
                  )}
                </span>
              </span>
              {recipe.description ? (
                <span className="type-body-sm line-clamp-2 font-semibold text-foreground/75">
                  {recipe.description}
                </span>
              ) : null}
            </span>
          </IntentPrefetchLink>
        </li>
      ))}
      {showAddRecipeRow ? (
        <li>
          <RecipeCreationChooser locale={locale} dict={dict} trigger="row" />
        </li>
      ) : null}
    </ul>
  );
}
