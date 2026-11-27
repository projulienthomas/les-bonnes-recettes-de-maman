import { Clock3, Flame, Hourglass, Slice, Thermometer, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/utils";
import type { Recipe, RecipeSummary } from "./types";

/** The pictograms shared by the recipe cards and the recipe page. */
export const recipeTimeIcons = {
  prepTime: Slice,
  cookTime: Flame,
  restTime: Hourglass,
  totalTime: Clock3,
  temperature: Thermometer,
} satisfies Record<string, LucideIcon>;

type RecipeTimeKey = keyof typeof recipeTimeIcons;

export type RecipeTimeEntry = {
  key: RecipeTimeKey;
  label: string;
  value: string;
};

/** Prep, cook and total times of a card, leaving out the ones that are empty. */
export function getRecipeCardTimes(
  dict: Dictionary,
  recipe: Pick<RecipeSummary, "prepTime" | "cookTime" | "timeLabel" | "totalTime">,
): RecipeTimeEntry[] {
  const entries: RecipeTimeEntry[] = [
    { key: "prepTime", label: dict.recipeDetail.prepTime, value: recipe.prepTime },
    { key: "cookTime", label: dict.recipeDetail.cookTime, value: recipe.cookTime },
    {
      key: "totalTime",
      label: dict.recipeDetail.totalTime,
      // `totalTime` is absent until the backend exposing it is deployed.
      value: recipe.totalTime || recipe.timeLabel,
    },
  ];
  return entries.filter((entry) => entry.value?.trim());
}

/** Every timing value of the recipe page, leaving out the ones that are empty. */
export function getRecipePageTimes(dict: Dictionary, recipe: Recipe): RecipeTimeEntry[] {
  const entries: RecipeTimeEntry[] = [
    { key: "prepTime", label: dict.recipeDetail.prepTime, value: recipe.prepTime },
    { key: "cookTime", label: dict.recipeDetail.cookTime, value: recipe.cookTime },
    { key: "restTime", label: dict.recipeDetail.restTime, value: recipe.restTime },
    { key: "totalTime", label: dict.recipeDetail.totalTime, value: recipe.totalTime || recipe.timeLabel },
    { key: "temperature", label: dict.recipeDetail.temperature, value: recipe.temperature },
  ];
  return entries.filter((entry) => entry.value?.trim());
}

/** Icon + short value pairs for a recipe card. Labels are read by screen readers only. */
export function RecipeCardTimes({
  times,
  className,
  iconClassName,
}: {
  times: RecipeTimeEntry[];
  className?: string;
  iconClassName: string;
}) {
  if (times.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      {times.map(({ key, label, value }) => {
        const Icon = recipeTimeIcons[key];
        return (
          <span
            key={key}
            data-recipe-time={key}
            title={label}
            // A pair moves to the next row as a whole; only a free-text value
            // wider than the whole row wraps inside itself.
            className="inline-flex max-w-full items-start gap-1"
          >
            <Icon aria-hidden className={cn("mt-px", iconClassName)} />
            <span className="sr-only">{label} </span>
            {value}
          </span>
        );
      })}
    </span>
  );
}
