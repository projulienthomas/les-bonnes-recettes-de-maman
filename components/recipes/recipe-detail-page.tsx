"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import {
  formatScaledIngredient,
  getServingsFactor,
  resolveSelectedServings,
} from "@/lib/recipe-servings";
import { formatRecipeByline } from "@/lib/recipe-author";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EditRecipeAccess } from "./edit-recipe-access";
import { RecipeShare } from "./recipe-share";
import { CookModeEntry } from "./cook-mode-entry";
import { EquipmentIcon } from "./equipment-icon";
import { RecipeIngredientsPanel } from "./recipe-ingredients-panel";
import { RecipeComments } from "./recipe-comments";
import type { Recipe } from "./types";
import { RecipeBackLink } from "./recipe-back-link";
import { getRecipePageTimes, recipeTimeIcons } from "./recipe-times";
import { StepIngredients } from "./step-ingredients";
import { RecipeStepText } from "./recipe-step-text";
import { ServingsFromSearchParams } from "./servings-from-search-params";

const defaultRecipeImageUrl =
  "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1400&q=85";

type RecipeDetailPageProps = {
  locale: Locale;
  dict: Dictionary;
  recipe: Recipe;
  mode?: "public" | "preview";
  initialServings?: number;
};

export function RecipeDetailPage({
  locale,
  dict,
  recipe,
  mode = "public",
  initialServings,
}: RecipeDetailPageProps) {
  return (
    <RecipePresentation
      key={`${recipe.slug}:${recipe.referenceServings ?? "none"}:${initialServings ?? "default"}`}
      locale={locale}
      dict={dict}
      recipe={recipe}
      mode={mode}
      initialServings={initialServings}
    />
  );
}

export function RecipePresentation({
  locale,
  dict,
  recipe,
  mode = "public",
  initialServings,
}: RecipeDetailPageProps) {
  const [selectedServings, setSelectedServings] = useState(() =>
    resolveSelectedServings(recipe.referenceServings, initialServings),
  );
  const servingsFactor = getServingsFactor(
    recipe.referenceServings,
    selectedServings,
  );
  return (
    <main className="text-foreground">
      <header className="px-5 pt-4 pb-8 sm:pt-6 sm:pb-12 lg:px-10 lg:pt-8 lg:pb-20">
        {mode === "public" ? (
          <div className="mx-auto mb-4 max-w-7xl lg:mb-8">
            <RecipeBackLink
              locale={locale}
              slug={recipe.slug}
              label={dict.recipeDetail.backToList}
              className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-[scale,background-color,color] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.96] lg:min-h-10"
            />
          </div>
        ) : null}
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] lg:items-center lg:gap-14">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted shadow-card">
            <Image
              src={recipe.heroImageUrl || defaultRecipeImageUrl}
              alt={recipe.imageCredit?.alt ?? ""}
              fill
              preload={mode === "public"}
              sizes="(max-width: 1023px) calc(100vw - 40px), 55vw"
              className="image-outline object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col items-start">
            <h1 className="type-display max-w-[min(14ch,100%)] hyphens-auto [overflow-wrap:anywhere]">{recipe.title}</h1>
            <p className="type-byline mt-4 text-muted-foreground">
              {formatRecipeByline(
                locale,
                dict.recipeDetail.recipeBy,
                recipe.author,
              )}
            </p>
            <RecipeTimes dict={dict} recipe={recipe} />
            {recipe.description ? (
              <p className="type-editorial-lead mt-7 max-w-[52ch] text-foreground/75">
                {recipe.description}
              </p>
            ) : null}
            {mode === "public" ? (
              <div className="mt-8 grid gap-4">
                <CookModeEntry
                  locale={locale}
                  dict={dict}
                  recipe={recipe}
                  selectedServings={selectedServings}
                />
                <RecipeShare locale={locale} slug={recipe.slug} title={recipe.title} dict={dict} />
                <EditRecipeAccess locale={locale} slug={recipe.slug} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Body: equipment, ingredients, then instructions */}
      <section className="border-t border-border px-5 pb-16 lg:px-10 lg:pb-32">
        <div className="mx-auto max-w-7xl">
          <div className="mt-8 lg:mt-12 lg:grid lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start lg:gap-14 xl:gap-20">
            <div className="space-y-8 lg:sticky lg:top-24 lg:self-start lg:space-y-10">
              {recipe.equipment.length > 0 ? (
                <div>
                  <h2 className="type-content-title mb-4 text-foreground lg:mb-6">
                    {dict.recipeDetail.equipment}
                  </h2>
                  <ul
                    data-equipment-list
                    className="type-body-spacious space-y-2 text-foreground/90"
                  >
                    {recipe.equipment.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="grid grid-cols-[1.375rem_minmax(0,1fr)] items-start gap-3"
                      >
                        <EquipmentIcon label={item} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <RecipeIngredientsPanel
                locale={locale}
                dict={dict}
                recipe={recipe}
                selectedServings={selectedServings}
                onSelectedServingsChange={setSelectedServings}
              />
            </div>

            <div className="min-w-0 lg:max-w-3xl">
              <div className="mt-8 space-y-8 lg:mt-0 lg:space-y-12">
                {recipe.sections.map((section) => (
                  <div key={section.title}>
                    <h2 className="type-content-title mb-4 text-foreground lg:mb-6">
                      {section.title}
                    </h2>
                    <ol className="space-y-4 lg:space-y-6">
                      {section.steps.map((step, index) => (
                        <li
                          key={step.id}
                          className="type-body-spacious grid grid-cols-[2rem_1fr] gap-3 text-foreground/90 lg:grid-cols-[2.5rem_1fr] lg:gap-5"
                        >
                          <span className="type-meta mt-0.5 flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary lg:mt-1 lg:size-9">
                            {index + 1}
                          </span>
                          <div>
                            <span>
                              <RecipeStepText
                                locale={locale}
                                recipeSlug={recipe.slug}
                                text={step.text}
                              />
                            </span>
                            <StepIngredients
                              locale={locale}
                              label={dict.recipeDetail.forThisStep}
                              recipe={recipe}
                              step={step}
                              factor={servingsFactor}
                            />
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
                {recipe.relatedRecipes.length > 0 ? (
                  <div>
                    <h2 className="type-content-title mb-4 text-foreground lg:mb-6">
                      {dict.recipeDetail.relatedRecipes}
                    </h2>
                    <ul className="space-y-3">
                      {recipe.relatedRecipes.map((related) => (
                        <li key={related.slug}>
                          <Link
                            href={`/${locale}/recettes/${related.slug}`}
                            className="type-body-spacious font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
                          >
                            {related.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {recipe.subRecipes.length > 0 ? (
                <>
                  {/* Mobile: accordion */}
                  <div className="mt-8 lg:hidden">
                    <h2 className="type-content-title mb-3 text-foreground">
                      {dict.recipeDetail.subRecipes}
                    </h2>
                    <Accordion
                      className="border-t border-border"
                      defaultValue={recipe.subRecipes[0]?.title}
                    >
                      {recipe.subRecipes.map((subRecipe) => (
                        <AccordionItem
                          key={subRecipe.title}
                          value={subRecipe.title}
                        >
                          <AccordionTrigger className="type-subsection-title text-foreground">
                            {subRecipe.title}
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="divide-y divide-border">
                              {subRecipe.ingredients.map(
                                (ingredient, index) => (
                                  <li
                                    key={`${subRecipe.title}-${ingredient.name}-${ingredient.unit}-${index}`}
                                    className="type-body-sm flex items-baseline justify-between gap-4 py-2.5"
                                  >
                                    <span
                                      data-ingredient-name
                                      className="font-semibold text-foreground first-letter:uppercase"
                                    >
                                      {ingredient.name}
                                    </span>
                                    <span className="shrink-0 font-bold text-muted-foreground tabular-nums">
                                      {formatScaledIngredient(
                                        ingredient,
                                        servingsFactor,
                                        locale,
                                      )}
                                    </span>
                                  </li>
                                ),
                              )}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>

                  {/* Desktop: stacked */}
                  <div className="mt-14 hidden space-y-8 lg:block">
                    <h2 className="type-content-title text-foreground">
                      {dict.recipeDetail.subRecipes}
                    </h2>
                    {recipe.subRecipes.map((subRecipe) => (
                      <div key={subRecipe.title}>
                        <h3 className="type-subsection-title mb-3 text-foreground">
                          {subRecipe.title}
                        </h3>
                        <ul className="divide-y divide-border">
                          {subRecipe.ingredients.map((ingredient, index) => (
                            <li
                              key={`${subRecipe.title}-${ingredient.name}-${ingredient.unit}-${index}`}
                              className="type-body flex items-baseline justify-between gap-5 py-3"
                            >
                              <span
                                data-ingredient-name
                                className="font-semibold text-foreground first-letter:uppercase"
                              >
                                {ingredient.name}
                              </span>
                              <span className="shrink-0 font-bold text-muted-foreground tabular-nums">
                                {formatScaledIngredient(
                                  ingredient,
                                  servingsFactor,
                                  locale,
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {recipe.notes.length > 0 ? (
                <>
                  {/* Mobile: collapsed accordion */}
                  <div className="mt-8 lg:hidden">
                    <Accordion>
                      <AccordionItem
                        value="notes"
                        className="border-t border-border"
                      >
                        <AccordionTrigger className="type-content-title text-foreground">
                          {dict.recipeDetail.notes}
                        </AccordionTrigger>
                        <AccordionContent>
                          <ul className="type-body space-y-2 text-muted-foreground">
                            {recipe.notes.map((note) => (
                              <li
                                key={note}
                                className="border-l-2 border-primary/40 pl-4 italic"
                              >
                                {note}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  {/* Desktop */}
                  <div className="mt-14 hidden lg:block">
                    <h2 className="type-content-title mb-5 text-foreground">
                      {dict.recipeDetail.notes}
                    </h2>
                    <ul className="type-body-spacious space-y-3 text-muted-foreground">
                      {recipe.notes.map((note) => (
                        <li
                          key={note}
                          className="border-l-2 border-primary/40 pl-5 italic"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {mode === "public" ? (
        <RecipeComments locale={locale} dict={dict} slug={recipe.slug} />
      ) : null}
      {mode === "public" ? (
        <Suspense fallback={null}>
          <ServingsFromSearchParams
            referenceServings={recipe.referenceServings}
            onServingsChange={setSelectedServings}
          />
        </Suspense>
      ) : null}
    </main>
  );
}

/** Prep, cook, rest and total times and the oven temperature, at the top of the page. */
function RecipeTimes({ dict, recipe }: { dict: Dictionary; recipe: Recipe }) {
  const times = getRecipePageTimes(dict, recipe);

  if (times.length === 0) return null;

  return (
    <dl
      data-recipe-times
      className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-4 lg:gap-x-8"
    >
      {times.map(({ key, label, value }) => {
        const Icon = recipeTimeIcons[key];
        return (
          <div key={key} className="flex min-w-fit items-start gap-2">
            <Icon aria-hidden className="mt-0.5 size-5 shrink-0 stroke-[1.8] text-primary" />
            <div className="grid gap-1">
              <dt className="type-label text-primary">{label}</dt>
              <dd className="whitespace-nowrap text-base font-bold leading-tight text-foreground tabular-nums">
                {value}
              </dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}
