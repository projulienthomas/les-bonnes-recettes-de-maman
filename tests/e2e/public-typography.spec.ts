import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const longTitles = {
  fr: "Une très longue collection de recettes familiales au citron, aux noisettes et à la crème anglaise",
  en: "A very long collection of family recipes with lemon, hazelnuts, and homemade vanilla custard",
} as const;

test("keyboard focus reveals the auto-hidden site header", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith("mobile-"), "Desktop navigation only");
  await page.goto("/fr");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const header = page.locator("header").first();
  await expect
    .poll(async () => (await header.boundingBox())?.y ?? 0)
    .toBeLessThan(0);

  await header.getByRole("link", { name: "Les Bonnes Recettes de Maman" }).focus();
  await expect
    .poll(async () => (await header.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(0);
});

test("public typography holds across locales, themes, and widths", async ({ page, request }, testInfo) => {
  for (const locale of ["fr", "en"] as const) {
    await page.goto(`/${locale}`);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("main h1")).toHaveCount(1);
    await expect(page.locator("main h2")).toHaveCount(1);
    const commentLabel = locale === "fr" ? "3 commentaires" : "3 comments";
    await expect(
      page.locator(`[aria-label="${commentLabel}"]:visible`).first(),
    ).toHaveText("3");

    const pageTitles = page.locator("main h1:visible");
    await expect(pageTitles).toHaveCount(1);
    const pageTitle = pageTitles.first();
    const titleStyle = await pageTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
      };
    });
    if (testInfo.project.name.startsWith("mobile-")) {
      await expect(pageTitle).toHaveClass(/sr-only/);
    } else {
      expect(titleStyle.fontFamily).toContain("Newsreader");
      expect(titleStyle.fontSize).toBeGreaterThanOrEqual(40);
    }
    await expectDescendingOutline(page);

    const titleLayout = await pageTitle.evaluate((element, value) => {
      element.textContent = value;
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    }, longTitles[locale]);
    if (!testInfo.project.name.startsWith("mobile-")) {
      expect(titleLayout.scrollWidth).toBeLessThanOrEqual(titleLayout.clientWidth + 1);
    }
    expect(titleLayout.documentWidth).toBeLessThanOrEqual(titleLayout.viewportWidth + 1);

    const editorialLead = page.locator("main .type-editorial-lead:visible").first();
    if ((await editorialLead.count()) > 0) {
      const measure = await editorialLead.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          maxWidth: Number.parseFloat(style.maxWidth),
          width: element.getBoundingClientRect().width,
          overflowWrap: style.overflowWrap,
          textWrap: style.textWrap,
        };
      });
      expect(measure.maxWidth).toBeGreaterThan(0);
      expect(measure.width).toBeLessThanOrEqual(measure.maxWidth + 1);
      expect(measure.overflowWrap).toBe("break-word");
      expect(measure.textWrap).toBe("pretty");
    }
  }

  const fontResources = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /\.(?:woff2?|ttf)(?:\?|$)/.test(url)),
  );
  expect(fontResources.length).toBeGreaterThan(0);
  for (const fontUrl of fontResources) {
    expect(new URL(fontUrl).origin).toBe(new URL(page.url()).origin);
    expect(fontUrl).not.toContain("fonts.googleapis.com");
    expect(fontUrl).not.toContain("fonts.gstatic.com");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("html").evaluate((element) => element.classList.add("dark"));
  await page.waitForTimeout(50);
  const darkViolations = await new AxeBuilder({ page }).analyze();
  expect(
    darkViolations.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  await page.goto("/fr/recettes");
  await expectDescendingOutline(page);
  const recipeLink = page.locator('main a[href^="/fr/recettes/"]').first();
  if ((await recipeLink.count()) > 0) {
    await recipeLink.click();
    await expect(page).toHaveURL(/\/fr\/recettes\/[^/?#]+$/);
    const recipeTitle = page.locator("main h1.type-display:visible").first();
    await expect(recipeTitle).toHaveClass(/type-display/);
    await expectDescendingOutline(page);
    const instructionColumn = page.locator("main ol").first();
    if ((await instructionColumn.count()) > 0 && testInfo.project.name === "desktop") {
      expect((await instructionColumn.boundingBox())?.width ?? 0).toBeLessThanOrEqual(720);
    }
    if (testInfo.project.name === "desktop") {
      const recipeOgUrl = await page.locator('meta[property="og:image"]').last().getAttribute("content");
      expect(recipeOgUrl).toBeTruthy();
      const recipeOgResponse = await request.get(recipeOgUrl!);
      expect(recipeOgResponse.ok()).toBe(true);
      expect(recipeOgResponse.headers()["content-type"]).toContain("image/png");
    }
  }

  const notFoundResponse = await page.goto("/fr/recette-introuvable-typographie");
  expect(notFoundResponse?.status()).toBe(404);
  await expect(page.locator("main h1")).toHaveClass(/type-page-title/);
  await expectDescendingOutline(page);

  if (testInfo.project.name === "desktop") {
    const ogResponse = await request.get("/fr/opengraph-image");
    expect(ogResponse.ok()).toBe(true);
    expect(ogResponse.headers()["content-type"]).toContain("image/png");
  }
});

test("mobile recipe cards keep an equal-height structure without highlighting prep time", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await page.goto("/fr");

  const recipeLink = page.locator('main a[href^="/fr/recettes/"]').first();
  await expect(recipeLink.getByText(/Préparation ·/)).toHaveCount(0);

  const layout = await recipeLink.evaluate((link) => {
    const card = link.closest("li");
    const title = link.querySelector(".type-card-title");
    return {
      cardHeight: card?.getBoundingClientRect().height ?? 0,
      linkHeight: link.getBoundingClientRect().height,
      titleHeight: title?.getBoundingClientRect().height ?? 0,
      titleLineHeight: title ? Number.parseFloat(getComputedStyle(title).lineHeight) : 0,
    };
  });

  expect(layout.linkHeight).toBeCloseTo(layout.cardHeight, 0);
  expect(layout.titleHeight).toBeGreaterThanOrEqual(layout.titleLineHeight * 2 - 1);
});

test("mobile recipe cards do not highlight a partial cooking time", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await page.goto("/en");

  const recipeLink = page.locator('main a[href^="/en/recettes/"]').first();
  await expect(recipeLink.getByText(/Prep ·/)).toHaveCount(0);
  await expect(recipeLink.getByText(/Cook ·/)).toHaveCount(0);
});

test("mobile cookbook exposes an aligned create shortcut beside the view toggles", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await page.goto("/fr");

  const controls = page.getByRole("region", { name: "Recherche et filtres des recettes" });
  const createButton = controls.getByRole("button", { name: "Ajouter une recette" });
  const cardsView = controls.getByRole("button", { name: "Vue cartes" });
  const searchbox = controls.getByRole("searchbox", { name: "Rechercher une recette" });

  const [createBox, cardsBox, searchBox, controlsBox] = await Promise.all([
    createButton.boundingBox(),
    cardsView.boundingBox(),
    searchbox.boundingBox(),
    controls.boundingBox(),
  ]);
  expect(createBox?.width).toBe(44);
  expect(createBox?.height).toBe(44);
  const centerY = (box: { y: number; height: number } | null) =>
    (box?.y ?? 0) + (box?.height ?? 0) / 2;
  expect(centerY(cardsBox)).toBeCloseTo(centerY(createBox), 0);
  // The search field has a whole row, first in the filters.
  expect(searchBox?.y).toBeLessThan(createBox?.y ?? 0);
  expect(searchBox?.width).toBeGreaterThan((controlsBox?.width ?? 0) * 0.8);

  await createButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: /Écrire la recette complète/ })).toHaveAttribute("href", "/fr/admin/recettes?new=1");
  await expect(page.getByRole("link", { name: /Laisser une idée/ })).toHaveAttribute("href", "/fr/idees#nouvelle-idee");
});

test("public recipe photos do not display source credits", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");

  await expect(page.getByRole("img", { name: "Tarte de démonstration décorée de fruits" })).toBeVisible();
  await expect(page.getByText("Photographe de démonstration", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Unsplash" })).toHaveCount(0);
});

test("ingredient names start with a capital letter without changing their content", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const ingredientName = page.locator("[data-ingredient-name]").first();
  await expect(ingredientName).toHaveCount(1);
  expect(await ingredientName.evaluate((element) =>
    getComputedStyle(element, "::first-letter").textTransform,
  )).toBe("uppercase");
});

test("mobile ingredient summary aligns its title, yield, and chevron", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const summary = page.locator('[data-ingredients-layout="mobile"]');
  const title = summary.getByRole("heading", { name: "Ingrédients" });
  const yieldLabel = summary.locator("[data-yield-label]");
  const chevron = summary.locator('[data-slot="accordion-trigger-icon"]:visible');
  const [titleBox, yieldBox, chevronBox] = await Promise.all([
    title.boundingBox(),
    yieldLabel.boundingBox(),
    chevron.boundingBox(),
  ]);
  const centerY = (box: { y: number; height: number } | null) =>
    (box?.y ?? 0) + (box?.height ?? 0) / 2;

  expect(titleBox).not.toBeNull();
  expect(yieldBox).not.toBeNull();
  expect(chevronBox).not.toBeNull();
  expect(centerY(yieldBox)).toBeCloseTo(centerY(titleBox), 0);
  expect(centerY(chevronBox)).toBeCloseTo(centerY(titleBox), 0);
});

test("recipe content orders equipment, ingredients, then preparation", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const ingredients = page.getByRole("heading", { name: "Ingrédients" });
  const equipment = page.getByRole("heading", { name: "Ustensiles" });
  const preparation = page.getByRole("heading", { name: "Préparation" });

  await expect(ingredients).toBeVisible();
  await expect(equipment).toBeVisible();
  await expect(preparation).toBeVisible();

  const equipmentItems = page.locator("[data-equipment-list] > li");
  await expect(equipmentItems).toHaveCount(1);
  await expect(equipmentItems.first()).toContainText("moule à tarte");
  await expect(
    equipmentItems.first().locator("[data-equipment-icon][aria-hidden='true']"),
  ).toHaveCount(1);

  const ingredientsBox = await ingredients.boundingBox();
  const equipmentBox = await equipment.boundingBox();
  const preparationBox = await preparation.boundingBox();
  expect(equipmentBox?.y).toBeLessThan(ingredientsBox?.y ?? 0);
  expect(ingredientsBox?.y).toBeLessThan(preparationBox?.y ?? 0);
});

test("mobile recipe back link sits above the hero image", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const backLink = page.getByRole("link", { name: "Retour à la liste des recettes" });
  const heroImage = page.locator("main header img");
  const backBox = await backLink.boundingBox();
  const imageBox = await heroImage.boundingBox();

  expect(backBox?.height).toBeGreaterThanOrEqual(44);
  expect((backBox?.y ?? 0) + (backBox?.height ?? 0)).toBeLessThanOrEqual(imageBox?.y ?? 0);
});

test("recipe times sit under the title, before the description and actions", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const times = page.locator("[data-recipe-times]");
  await expect(times).toHaveCount(1);
  await expect(times.getByText("Temps total", { exact: true })).toBeVisible();
  const [titleBox, timesBox, descriptionBox] = await Promise.all([
    page.getByRole("heading", { level: 1 }).boundingBox(),
    times.boundingBox(),
    page.locator("main header .type-editorial-lead").boundingBox(),
  ]);
  expect(timesBox?.y).toBeGreaterThan(titleBox?.y ?? 0);
  expect(timesBox?.y).toBeLessThan(descriptionBox?.y ?? 0);
});

test("recipe back link returns to the list as it was left", async ({ page }) => {
  await page.goto("/fr?q=tarte#recettes");
  await page.locator('main a[href="/fr/recettes/tarte-de-demonstration"]').first().click();
  await expect(page).toHaveURL(/\/fr\/recettes\/tarte-de-demonstration/);

  await page.getByRole("link", { name: "Retour à la liste des recettes" }).click();
  await expect(page).toHaveURL(/\/fr\?q=tarte/);
  await expect(page.getByRole("searchbox", { name: "Rechercher une recette" })).toHaveValue("tarte");
});

test("recipe back link falls back to the list link on a direct visit", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");

  await expect(page.getByRole("link", { name: "Retour à la liste des recettes" }))
    .toHaveAttribute("href", "/fr#recettes");
});

test("desktop recipe body keeps a compact ingredient panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const ingredients = page.getByRole("heading", { name: "Ingrédients" });
  const ingredientPanel = ingredients.locator("xpath=ancestor::aside");
  const panelBox = await ingredientPanel.boundingBox();
  expect(panelBox?.width).toBe(320);

  const temperature = page.getByText("four moyen", { exact: true });
  await expect(page.getByText("Température", { exact: true })).toBeVisible();
  const temperatureLayout = await temperature.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      whiteSpace: style.whiteSpace,
    };
  });
  expect(temperatureLayout.whiteSpace).toBe("nowrap");
  expect(temperatureLayout.height).toBeLessThanOrEqual(temperatureLayout.lineHeight + 1);
});

test("desktop ingredient yield stays inside its compact panel", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/ancienne-recette-sans-portions");

  const panel = page.locator('[data-ingredients-layout="desktop"]');
  const heading = panel.getByRole("heading", { name: "Ingrédients" });
  const yieldLabel = heading.locator("xpath=following-sibling::span");
  await yieldLabel.evaluate((element) => {
    element.textContent = "8 à 10 personnes";
  });

  const layout = await panel.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
});

async function expectDescendingOutline(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const headings = await page.getByRole("heading").evaluateAll((elements) =>
    elements.map((element) => ({
      level: Number(element.tagName.slice(1)),
      size: Number.parseFloat(getComputedStyle(element).fontSize),
    })),
  );
  expect(headings.filter(({ level }) => level === 1)).toHaveLength(1);
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    expect(current.level).toBeLessThanOrEqual(previous.level + 1);
    if (current.level > previous.level) {
      expect(current.size).toBeLessThanOrEqual(previous.size);
    }
  }
}
