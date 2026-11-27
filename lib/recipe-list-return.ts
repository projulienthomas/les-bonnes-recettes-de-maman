/**
 * Remembers, for this tab and only in memory, how the visitor reached a recipe
 * page, so its back link can return to the list exactly as it was left.
 *
 * Module state lives as long as the client-side session: a full page load
 * (direct visit, reload, shared link) starts empty and the back link falls
 * back to its plain href.
 */

let rememberedListUrl: string | null = null;
let leavingList = false;
let recipeArrivedFromList: string | null = null;

/** The recipe list is on screen at `url` (path and query). */
export function rememberRecipeListUrl(url: string) {
  rememberedListUrl = url;
  leavingList = false;
}

/** The recipe list is being left through an in-site navigation. */
export function markLeavingRecipeList() {
  leavingList = true;
}

/** The last list URL seen in this session, for the given locale. */
export function getRememberedRecipeListUrl(locale: string) {
  if (!rememberedListUrl) return null;
  const path = rememberedListUrl.split(/[?#]/)[0];
  return path === `/${locale}` ? rememberedListUrl : null;
}

/**
 * Called when a recipe page mounts. Returns whether the previous history entry
 * is the recipe list, i.e. whether going back in history returns to it.
 */
export function registerRecipePageVisit(slug: string) {
  if (leavingList) {
    leavingList = false;
    recipeArrivedFromList = slug;
  } else if (recipeArrivedFromList !== slug) {
    recipeArrivedFromList = null;
  }
  return recipeArrivedFromList === slug;
}

/** For tests. */
export function resetRecipeListReturn() {
  rememberedListUrl = null;
  leavingList = false;
  recipeArrivedFromList = null;
}
