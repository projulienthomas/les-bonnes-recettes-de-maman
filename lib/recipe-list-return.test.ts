import { beforeEach, describe, expect, it } from "vitest";
import {
  getRememberedRecipeListUrl,
  markLeavingRecipeList,
  registerRecipePageVisit,
  rememberRecipeListUrl,
  resetRecipeListReturn,
} from "./recipe-list-return";

describe("recipe list return", () => {
  beforeEach(() => resetRecipeListReturn());

  it("does not go back in history on a direct visit", () => {
    expect(registerRecipePageVisit("tartiflette")).toBe(false);
    expect(getRememberedRecipeListUrl("fr")).toBeNull();
  });

  it("goes back in history when the recipe was opened from the list", () => {
    rememberRecipeListUrl("/fr?q=tarti");
    markLeavingRecipeList();
    expect(registerRecipePageVisit("tartiflette")).toBe(true);
    // Remounting the same recipe page keeps that knowledge.
    expect(registerRecipePageVisit("tartiflette")).toBe(true);
    expect(getRememberedRecipeListUrl("fr")).toBe("/fr?q=tarti");
  });

  it("forgets it once another recipe is opened from the recipe page", () => {
    rememberRecipeListUrl("/fr");
    markLeavingRecipeList();
    registerRecipePageVisit("tartiflette");
    expect(registerRecipePageVisit("mayonnaise")).toBe(false);
    expect(registerRecipePageVisit("tartiflette")).toBe(false);
  });

  it("does not offer a list URL of another locale", () => {
    rememberRecipeListUrl("/en?q=pie");
    expect(getRememberedRecipeListUrl("fr")).toBeNull();
    expect(getRememberedRecipeListUrl("en")).toBe("/en?q=pie");
  });

  it("does not treat a list still on screen as left", () => {
    rememberRecipeListUrl("/fr");
    markLeavingRecipeList();
    rememberRecipeListUrl("/fr?q=a");
    expect(registerRecipePageVisit("tartiflette")).toBe(false);
  });
});
