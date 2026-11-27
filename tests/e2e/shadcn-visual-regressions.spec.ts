import { expect, test } from "@playwright/test";

test("shadcn migration keeps the key recipe surfaces stable", async ({ page }, testInfo) => {
  test.skip(!["mobile-390", "desktop"].includes(testInfo.project.name));

  await page.goto("/fr/admin/recettes");
  await expect(page.getByRole("heading", { name: "Le carnet" })).toBeVisible();
  await expect(page.locator("main")).toHaveScreenshot("admin-cookbook.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });

  await page.getByRole("button", { name: /Tarte de démonstration/ }).click();
  await expect(page.getByRole("heading", { name: "Image principale" })).toBeVisible();
  await expect(page.locator("main")).toHaveScreenshot("admin-information.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });


  await page.goto("/fr/recettes/amandin");
  const comments = page.getByRole("heading", { name: "Commentaires", exact: true }).locator("xpath=ancestor::section");
  await expect(comments).toBeVisible();
  // Capture the loaded section, not the loading placeholders.
  await expect(comments.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(comments).toHaveScreenshot("recipe-comments.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });

  await page.goto("/fr/recettes/amandin/cuisiner");
  await expect(page.locator("main")).toHaveScreenshot("guided-cook.png", { animations: "disabled", maxDiffPixelRatio: 0.02 });
});
