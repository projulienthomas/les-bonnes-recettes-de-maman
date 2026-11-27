import { Clock3, Flame, Hourglass, Thermometer, createLucideIcon, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { cn } from "@/lib/utils";
import type { Recipe, RecipeSummary } from "./types";

// The whisk of Lucide Lab (ISC licence), drawn here to avoid a second icon package.
const Whisk = createLucideIcon("whisk", [
  ["path", { d: "M22 2 3.45 20.55", key: "piomnp" }],
  ["path", { d: "M3.5 13.5a5 5 0 1 0 7.1 7.1C12.6 18.6 15 9 15 9s-9.6 2.5-11.5 4.5", key: "1crn9o" }],
]);

/** The pictograms shared by the recipe cards and the recipe page. */
export const recipeTimeIcons = {
  prepTime: Whisk,
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

const durationEnd = /\b(?:min|h|u)\b(?:\s*\d{1,2}\b(?!\s*(?:min|h|u)\b))?/gi;

/**
 * Keeps the durations of a free-text time and drops the commentary around
 * them, so a card shows « 1 h 20 à 1 h 25 » and leaves « , hors
 * refroidissement » to the recipe page. A rest given without a duration
 * (« + 1 nuit de repos ») stays visible as a trailing « + ».
 */
export function shortenRecipeTime(value: string) {
  const text = value.replace(/\s*\([^)]*\)/g, "").split(",")[0].trim();
  const last = [...text.matchAll(durationEnd)].at(-1);
  if (!last) return text;
  const end = last.index + last[0].length;
  const dropped = text.slice(end).trim();
  return dropped.startsWith("+") ? `${text.slice(0, end)} +` : text.slice(0, end);
}

/** Prep, cook and total times of a card, shortened, leaving out the empty ones. */
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
  return entries
    .filter((entry) => entry.value?.trim())
    .map((entry) => ({ ...entry, value: shortenRecipeTime(entry.value) }));
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
