"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  LayoutGrid,
  LibraryBig,
  List,
  Search,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDebouncer } from "@tanstack/react-pacer";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import {
  RECIPE_CATEGORIES,
  RECIPE_COURSE_CATEGORIES,
  RECIPE_TASTE_CATEGORIES,
  type RecipeCategory,
} from "@/lib/recipe-categories";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/recipe-search";
import { markLeavingRecipeList, rememberRecipeListUrl } from "@/lib/recipe-list-return";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { RecipeSummary } from "./types";
import { RecipeGrid } from "./recipe-grid";
import { RecipeListRows } from "./recipe-list-rows";
import { RecipeShelf } from "./recipe-shelf";
import { RecipeCreationChooser } from "./recipe-creation-chooser";

const categoryValues = RECIPE_CATEGORIES;
const viewValues = ["cards", "list", "shelf"] as const;
const viewIcons = { cards: LayoutGrid, list: List, shelf: LibraryBig } as const;
const sortValues = ["alpha", "date"] as const;
const sortDirectionValues = ["asc", "desc"] as const;
const searchDebounceMs = 250;
const activeToggleClassName =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-sm aria-pressed:hover:bg-primary/90";

type RecipeView = (typeof viewValues)[number];
type RecipeSort = (typeof sortValues)[number];
type RecipeSortDirection = (typeof sortDirectionValues)[number];

type RecipeListExplorerProps = {
  locale: Locale;
  dict: Dictionary;
  recipes: RecipeSummary[];
};


const sortDirectionLabels: Record<Locale, Record<"asc" | "desc", string>> = {
  fr: { asc: "ordre croissant", desc: "ordre décroissant" },
  en: { asc: "ascending", desc: "descending" },
  "pt-br": { asc: "ordem crescente", desc: "ordem decrescente" },
  "nl-be": { asc: "oplopend", desc: "aflopend" },
};
export function RecipeListExplorer({
  locale,
  dict,
  recipes,
}: RecipeListExplorerProps) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const activeCategories = getActiveCategories(searchParams);
  const activeView = getActiveView(searchParams);
  const activeSort = getActiveSort(searchParams);
  const activeSortDirection = getActiveSortDirection(searchParams, activeSort);
  // The draft holds while the URL query is one it was typed against.
  const [draftState, setDraftState] = useState({ queries: [query], value: query });
  const draftQuery = draftState.queries.includes(query) ? draftState.value : query;

  // Once the URL has caught up with a commit, forget the query it replaced:
  // going back to it must show that query, not the text typed after it.
  if (draftState.queries.length > 1 && draftState.queries.at(-1) === query) {
    setDraftState({ queries: [query], value: draftState.value });
  }

  // Lets a recipe page opened from here return to the list as it was left.
  const listSearch = searchParams.toString();
  useEffect(() => {
    rememberRecipeListUrl(listSearch ? `/${locale}?${listSearch}` : `/${locale}`);
    return () => markLeavingRecipeList();
  }, [listSearch, locale]);

  const filteredRecipes = useMemo(
    () => sortRecipes(
      filterRecipes(recipes, query, activeCategories),
      activeSort,
      activeSortDirection,
      locale,
    ),
    [activeCategories, activeSort, activeSortDirection, locale, query, recipes],
  );
  const hasActiveFilters = query.length > 0 || activeCategories.length > 0;

  // The query this search box last wrote to the URL. One search is one history
  // entry: the first change pushes, later ones replace it, so Back returns to
  // the list as it was before typing.
  const typedQuery = useRef<string | null>(null);

  function commitQuery(value: string) {
    const nextQuery = value.trim();
    if (nextQuery === query) return;
    // Keep the typed value (trailing space included) once the URL catches up.
    setDraftState({ queries: [query, nextQuery], value });
    updateUrl({
      query: nextQuery,
      categories: activeCategories,
      view: activeView,
      sort: activeSort,
      direction: activeSortDirection,
      mode: typedQuery.current === query ? "replace" : "push",
    });
    typedQuery.current = nextQuery;
  }

  // Filter while typing.
  const searchDebouncer = useDebouncer(commitQuery, { wait: searchDebounceMs });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    searchDebouncer.cancel();
    commitQuery(draftQuery);
  }

  function resetFilters() {
    searchDebouncer.cancel();
    setDraftState({ queries: [""], value: "" });
    updateUrl({
      query: "",
      categories: [],
      view: activeView,
      sort: activeSort,
      direction: activeSortDirection,
      mode: "push",
    });
  }

  function setView(view: RecipeView) {
    updateUrl({
      query,
      categories: activeCategories,
      view,
      sort: activeSort,
      direction: activeSortDirection,
      mode: "push",
    });
  }

  function setSort(sort: RecipeSort) {
    const direction = sort === activeSort
      ? activeSortDirection === "asc" ? "desc" : "asc"
      : getDefaultSortDirection(sort);
    updateUrl({
      query,
      categories: activeCategories,
      view: activeView,
      sort,
      direction,
      mode: "push",
    });
  }

  return (
    <div className="grid gap-3 md:gap-5">
      <section
        aria-label={dict.recipeList.filtersLabel}
        className="grid gap-3 border-b border-border pb-3 md:pb-4"
      >
        <form role="search" onSubmit={submitSearch} className="w-full">
          <label className="sr-only" htmlFor="recipe-search">
            {dict.recipeList.searchLabel}
          </label>
          <InputGroup className="h-12 bg-card">
            <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
            <InputGroupInput
              id="recipe-search"
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              value={draftQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setDraftState({
                  queries: draftState.queries.includes(query)
                    ? draftState.queries
                    : [query],
                  value: event.target.value,
                });
                searchDebouncer.maybeExecute(event.target.value);
              }}
              className="h-12 md:h-12"
              placeholder={dict.recipeList.searchPlaceholder}
            />
          </InputGroup>
        </form>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ToggleGroup
            multiple
            value={activeCategories}
            onValueChange={(values: string[]) => updateUrl({
              query,
              categories: values as RecipeCategory[],
              view: activeView,
              sort: activeSort,
              direction: activeSortDirection,
              mode: "push",
            })}
            spacing={2}
            className="flex w-full flex-wrap xl:w-auto"
            aria-label={dict.recipeList.categoriesLabel}
          >
            {RECIPE_COURSE_CATEGORIES.map((category) => (
              <CategoryToggle key={category} category={category} dict={dict} />
            ))}
            {/* Courses, then tastes: a divider on wide screens, a row break (with a slightly larger gap) on phones. */}
            <span
              aria-hidden="true"
              className="h-0 basis-full sm:mx-1 sm:h-6 sm:w-px sm:basis-auto sm:self-center sm:bg-border"
            />
            {RECIPE_TASTE_CATEGORIES.map((category) => (
              <CategoryToggle key={category} category={category} dict={dict} />
            ))}
          </ToggleGroup>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 xl:justify-end">
            <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground">
              <span aria-live="polite" className="type-meta">
                {formatResultCount(dict, filteredRecipes.length, recipes.length)}
              </span>
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  <X data-icon="inline-start" />
                  {dict.recipeList.reset}
                </Button>
              ) : null}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="md:hidden">
                <RecipeCreationChooser locale={locale} dict={dict} trigger="icon" />
              </div>
              <span aria-hidden className="mx-1 hidden h-6 w-px bg-border md:block" />

              <ToggleGroup
                value={[activeView]}
                onValueChange={(values: string[]) =>
                  values[0] && setView(values[0] as RecipeView)}
                spacing={1}
                className="flex"
                aria-label={dict.recipeList.viewLabel}
              >
                {viewValues.map((view) => {
                  const Icon = viewIcons[view];
                  return (
                    <ToggleGroupItem
                      key={view}
                      value={view}
                      className={cn(
                        "size-10 rounded-full p-0",
                        view === "list" && "hidden md:inline-flex",
                        activeToggleClassName,
                      )}
                      aria-label={dict.recipeList.views[view]}
                    >
                      <Icon aria-hidden />
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>

              <ToggleGroup
                value={[activeSort]}
                onValueChange={(values: string[]) => setSort(
                  (values[0] as RecipeSort | undefined) ?? activeSort,
                )}
                spacing={1}
                className="flex"
                aria-label={dict.recipeList.sortLabel}
              >
                {sortValues.map((sort) => {
                  const direction = sort === activeSort
                    ? activeSortDirection
                    : getDefaultSortDirection(sort);
                  const Icon = sort === "alpha"
                    ? direction === "asc" ? ArrowDownAZ : ArrowUpAZ
                    : direction === "asc" ? CalendarArrowUp : CalendarArrowDown;
                  return (
                    <ToggleGroupItem
                      key={sort}
                      value={sort}
                      className={cn(
                        "min-h-10 rounded-full px-3 font-bold",
                        activeToggleClassName,
                      )}
                    >
                      <Icon data-icon="inline-start" />
                      <span className="hidden lg:inline">
                        {dict.recipeList.sorts[sort]}
                      </span>
                      <span className="sr-only lg:hidden">
                        {dict.recipeList.sorts[sort]}
                      </span>
                      {sort === activeSort ? (
                        <span className="sr-only">
                          {sortDirectionLabels[locale][direction]}
                        </span>
                      ) : null}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
          </div>
        </div>

      </section>

      {filteredRecipes.length > 0 ? (
        activeView === "shelf" ? (
          <RecipeShelf locale={locale} dict={dict} recipes={filteredRecipes} />
        ) : activeView === "list" ? (
          <>
            <div className="md:hidden">
              <RecipeGrid
                locale={locale}
                dict={dict}
                recipes={filteredRecipes}
                priorityFirstImage={false}
                showAddRecipeCard={!hasActiveFilters}
              />
            </div>
            <div className="hidden md:block">
              <RecipeListRows
                locale={locale}
                dict={dict}
                recipes={filteredRecipes}
                showAddRecipeRow={!hasActiveFilters}
              />
            </div>
          </>
        ) : (
          <RecipeGrid
            locale={locale}
            dict={dict}
            recipes={filteredRecipes}
            showAddRecipeCard={!hasActiveFilters}
          />
        )
      ) : (
        <Empty className="border border-border py-12">
          <EmptyHeader className="">
          <EmptyTitle className="type-content-title">{dict.recipeList.noResultsTitle}</EmptyTitle>
          <EmptyDescription className="type-body max-w-xl font-semibold">
            {recipes.length === 0
              ? dict.recipeList.emptyDescription
              : dict.recipeList.noResultsDescription}
          </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function filterRecipes(
  recipes: RecipeSummary[],
  query: string,
  categories: RecipeCategory[],
) {
  const normalizedQuery = normalizeSearchText(query);
  const selectedCategories = new Set<string>(categories);

  return recipes.filter((recipe) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      matchesSearchQuery(getRecipeSearchText(recipe), normalizedQuery);
    const matchesCategory =
      categories.length === 0 ||
      recipe.categories.some((category) => selectedCategories.has(category));

    return matchesQuery && matchesCategory;
  });
}

function sortRecipes(
  recipes: RecipeSummary[],
  sort: RecipeSort,
  direction: RecipeSortDirection,
  locale: Locale,
) {
  return [...recipes].sort((recipeA, recipeB) => {
    const comparison = sort === "date"
      ? recipeA._creationTime - recipeB._creationTime
      : recipeA.title.localeCompare(recipeB.title, locale);

    return direction === "asc" ? comparison : -comparison;
  });
}

function getRecipeSearchText(recipe: RecipeSummary) {
  return normalizeSearchText(
    [recipe.title, ...recipe.ingredients.map((ingredient) => ingredient.name)].join(
      " ",
    ),
  );
}

function getActiveCategories(searchParams: { getAll: (name: string) => string[] }) {
  return searchParams
    .getAll("cat")
    .filter((value): value is RecipeCategory =>
      categoryValues.includes(value as RecipeCategory),
    );
}

function getActiveView(searchParams: { get: (name: string) => string | null }) {
  const value = searchParams.get("view");
  return viewValues.includes(value as RecipeView) ? (value as RecipeView) : "cards";
}

function getActiveSort(searchParams: { get: (name: string) => string | null }) {
  const value = searchParams.get("sort");
  return sortValues.includes(value as RecipeSort) ? (value as RecipeSort) : "date";
}

function getActiveSortDirection(
  searchParams: { get: (name: string) => string | null },
  sort: RecipeSort,
) {
  const value = searchParams.get("order");
  return sortDirectionValues.includes(value as RecipeSortDirection)
    ? value as RecipeSortDirection
    : getDefaultSortDirection(sort);
}

function getDefaultSortDirection(sort: RecipeSort): RecipeSortDirection {
  return sort === "date" ? "desc" : "asc";
}

function updateUrl({
  query,
  categories,
  view,
  sort,
  direction,
  mode,
}: {
  query: string;
  categories: RecipeCategory[];
  view: RecipeView;
  sort: RecipeSort;
  direction: RecipeSortDirection;
  mode: "push" | "replace";
}) {
  const params = new URLSearchParams(window.location.search);
  params.delete("q");
  params.delete("cat");
  params.delete("view");
  params.delete("sort");
  params.delete("order");

  if (query) {
    params.set("q", query);
  }

  for (const category of categories) {
    params.append("cat", category);
  }

  params.set("view", view);
  if (view !== "shelf") {
    params.delete("livre");
  }
  params.set("sort", sort);
  params.set("order", direction);

  const nextUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;

  if (mode === "replace") {
    window.history.replaceState(null, "", nextUrl);
  } else {
    window.history.pushState(null, "", nextUrl);
  }
}

function formatResultCount(dict: Dictionary, count: number, total: number) {
  const label =
    count > 1 ? dict.recipeList.resultsPlural : dict.recipeList.resultsSingular;
  return dict.recipeList.resultCount
    .replace("{count}", String(count))
    .replace("{total}", String(total))
    .replace("{label}", label);
}

function CategoryToggle({
  category,
  dict,
}: {
  category: RecipeCategory;
  dict: Dictionary;
}) {
  return (
    <ToggleGroupItem
      value={category}
      className={cn("min-h-10 rounded-full px-4 font-bold", activeToggleClassName)}
    >
      {dict.recipeList.categories[category]}
    </ToggleGroupItem>
  );
}
