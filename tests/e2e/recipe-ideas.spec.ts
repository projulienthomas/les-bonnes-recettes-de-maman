import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("a visitor can publish, edit, and delete a recipe idea", async ({ page }, testInfo) => {
  const uniqueIdea = `Tarte aux mirabelles e2e ${testInfo.project.name} ${Date.now()}`;
  const editedIdea = `${uniqueIdea} avec des amandes`;
  const newestIdea = `Bugnes e2e ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/fr/idees#nouvelle-idee");

  await expect(page.getByRole("heading", { name: "Idées de recettes", level: 1 })).toBeVisible();
  await page.getByLabel("Votre nom (facultatif)").fill("Jeanne");
  await page.getByLabel("Votre idée").fill(uniqueIdea);
  await page.getByRole("button", { name: "Publier l’idée" }).click();

  const card = page.locator("article").filter({ hasText: uniqueIdea });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Votre idée").fill(editedIdea);
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

  const editedCard = page.locator("article").filter({ hasText: editedIdea });
  await expect(editedCard).toBeVisible();
  await page.getByLabel("Votre idée").fill(newestIdea);
  await page.getByRole("button", { name: "Publier l’idée" }).click();
  const outstandingSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Idées à ajouter" }),
  });
  await expect(outstandingSection.locator("article").first()).toContainText(
    newestIdea,
  );
  const newestCard = page.locator("article").filter({ hasText: newestIdea });
  await newestCard.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await editedCard.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(editedCard).toHaveCount(0);
});

test("the public header chooser exposes both creation paths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/en");
  await page.getByRole("button", { name: "New recipe", exact: true }).click();
  await expect(page.getByRole("link", { name: /Write the full recipe/ })).toHaveAttribute("href", "/en/admin/recettes?new=1");
  await expect(page.getByRole("link", { name: /Leave an idea/ })).toHaveAttribute("href", "/en/idees#nouvelle-idee");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "New recipe", exact: true })).toBeFocused();

  const cardTrigger = page.locator("main").getByRole("button", {
    name: /Add a recipe/,
  });
  await cardTrigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "List view" }).click();
  await page.locator("main").getByRole("button", { name: /Add a recipe/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the localized ideas page remains accessible in dark mode and at 200% zoom", async ({
  page,
}, testInfo) => {
  for (const locale of ["fr", "en"] as const) {
    await page.goto(`/${locale}/idees`);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(
      page.getByRole("heading", {
        name: locale === "fr" ? "Idées de recettes" : "Recipe ideas",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel(locale === "fr" ? "Votre idée" : "Your idea"),
    ).toBeVisible();
  }

  await page.locator("html").evaluate((element) => element.classList.add("dark"));
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(page.getByLabel("Your idea")).toBeVisible();
  const violations = await new AxeBuilder({ page }).analyze();
  expect(
    violations.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  const viewport = page.viewportSize();
  if (viewport) {
    await page.setViewportSize({
      width: Math.max(320, Math.floor(viewport.width / 2)),
      height: viewport.height,
    });
  }
  await expect(page.getByLabel("Your idea")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  if (testInfo.project.name.startsWith("mobile-")) {
    await page.getByLabel("Your idea").fill("A test idea");
    const submit = page.getByRole("button", { name: "Publish idea" });
    const box = await submit.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
