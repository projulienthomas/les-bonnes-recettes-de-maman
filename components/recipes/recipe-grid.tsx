import Image from "next/image";
import { IntentPrefetchLink } from "./intent-prefetch-link";
import { Clock3, MessageCircle } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { formatRecipeByline } from "@/lib/recipe-author";
import type { RecipeSummary } from "./types";
import { RecipeCreationChooser } from "./recipe-creation-chooser";

const defaultRecipeImageUrl =
  "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1400&q=85";

type RecipeGridProps = {
  locale: Locale;
  dict: Dictionary;
  recipes: RecipeSummary[];
  showAddRecipeCard?: boolean;
  priorityFirstImage?: boolean;
};

export function RecipeGrid({
  locale,
  dict,
  recipes,
  showAddRecipeCard = false,
  priorityFirstImage = true,
}: RecipeGridProps) {
  if (recipes.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 md:gap-6 xl:grid-cols-3">
      {recipes.map((recipe, index) => {
        const commentLabel = (
          recipe.commentCount === 1
            ? dict.recipeList.commentSingular
            : dict.recipeList.commentPlural
        ).replace("{count}", String(recipe.commentCount));

        return (
          <li key={recipe._id} className="h-full">
            <IntentPrefetchLink
              href={`/${locale}/recettes/${recipe.slug}`}
              className="surface-elevated group flex h-full flex-col overflow-hidden rounded-2xl bg-card text-start transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:rounded-3xl"
            >
              <span className="relative block aspect-square md:aspect-[4/3] shrink-0 overflow-hidden rounded-t-2xl bg-muted md:rounded-t-3xl">
                <Image
                  src={recipe.heroImageUrl || defaultRecipeImageUrl}
                  alt=""
                  fill
                  preload={priorityFirstImage && index === 0}
                  sizes="(max-width: 767px) 50vw, (max-width: 1279px) 50vw, 33vw"
                  className="image-outline object-cover"
                />
              </span>
              <span className="flex min-h-24 flex-1 flex-col p-3 md:block md:min-h-0 md:p-5">
                <span className="type-label mb-4 hidden items-center gap-4 text-primary tabular-nums md:flex">
                  <span className="inline-flex items-center gap-2">
                    <Clock3 aria-hidden className="size-4 stroke-[1.8]" />
                    {recipe.timeLabel}
                  </span>
                  <CommentCount
                    count={recipe.commentCount}
                    label={commentLabel}
                    className="text-muted-foreground"
                    iconClassName="size-4 stroke-[1.8]"
                  />
                </span>
                <span
                  className="type-card-title type-card-title-compact line-clamp-2 block min-h-[2.1em] max-w-[18ch] text-foreground md:min-h-0"
                  title={recipe.title}
                >
                  {recipe.title}
                </span>
                {recipe.timeLabel || recipe.commentCount > 0 ? (
                  <span
                    className="mt-auto inline-flex items-center gap-3 pt-3 text-xs font-bold text-muted-foreground tabular-nums md:hidden"
                  >
                    {recipe.timeLabel ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 aria-hidden className="size-3.5 stroke-[1.8]" />
                        {recipe.timeLabel}
                      </span>
                    ) : null}
                    <CommentCount
                      count={recipe.commentCount}
                      label={commentLabel}
                      iconClassName="size-3.5 stroke-[1.8]"
                    />
                  </span>
                ) : null}
                <span className="type-byline mt-3 hidden text-muted-foreground md:block">
                  {formatRecipeByline(
                    locale,
                    dict.recipeDetail.recipeBy,
                    recipe.author,
                  )}
                </span>
              </span>
            </IntentPrefetchLink>
          </li>
        );
      })}
      {showAddRecipeCard ? (
        <li className="h-full">
          <RecipeCreationChooser locale={locale} dict={dict} trigger="card" />
        </li>
      ) : null}
    </ul>
  );
}

function CommentCount({
  count,
  label,
  className = "",
  iconClassName,
}: {
  count: number;
  label: string;
  className?: string;
  iconClassName: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      aria-label={label}
    >
      <MessageCircle aria-hidden className={iconClassName} />
      {count}
    </span>
  );
}
