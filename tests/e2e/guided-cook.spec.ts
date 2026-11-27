import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function installWakeLockMock(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const state = { requests: 0, releases: 0 };
    Object.assign(window, { __wakeLockState: state });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async () => {
          state.requests += 1;
          return {
            release: async () => {
              state.releases += 1;
            },
            addEventListener: () => undefined,
          };
        },
      },
    });
  });
}

test("a cook can advance, check ingredients, and resume locally", async ({
  page,
}) => {
  await installWakeLockMock(page);
  await page.goto("/fr/recettes/tarte-de-demonstration");
  await page.getByRole("link", { name: "Commencer à cuisiner" }).click();

  await expect(page).toHaveURL(/\/cuisiner$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Mélanger",
  );
  await page.getByRole("button", { name: /Ingrédients/ }).click();
  await page.getByRole("dialog").getByText("Farine", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cuire");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cuire");
  await page.getByLabel("Garder l’écran allumé").check();
  await expect(page.getByText(/restera allumé/)).toBeVisible();

  const violations = await new AxeBuilder({ page }).analyze();
  expect(
    violations.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});

test("recipe portions scale ingredients and follow the cook into guided mode", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/tarte-de-demonstration");

  const panel = page.locator('[data-ingredients-layout="desktop"]');
  const counter = panel.getByRole("spinbutton", {
    name: "Nombre de personnes",
  });
  await expect(counter).toHaveValue("6");
  await expect(panel.getByText("Par défaut", { exact: true })).toBeVisible();
  await expect(panel).toContainText("200 g");

  await counter.fill("1");
  await expect(
    panel.getByRole("button", { name: "Diminuer le nombre de personnes" }),
  ).toBeDisabled();
  await counter.fill("50");
  await expect(
    panel.getByRole("button", { name: "Augmenter le nombre de personnes" }),
  ).toBeDisabled();
  await counter.fill("6");
  await expect(panel.getByText("Par défaut", { exact: true })).toBeVisible();

  await panel
    .getByRole("button", { name: "Augmenter le nombre de personnes" })
    .click();
  await expect(counter).toHaveValue("7");
  await expect(panel).toContainText("233,33 g");
  await expect(panel.getByText("Par défaut", { exact: true })).toHaveCount(0);

  await counter.fill("9");
  await expect(panel).toContainText("300 g");
  await expect(panel).toContainText("4,5");
  await page.getByRole("link", { name: "Commencer à cuisiner" }).click();
  await expect(page).toHaveURL(/\/cuisiner\?personnes=9$/);
  await page.getByRole("button", { name: /Ingrédients/ }).click();
  const ingredientSheet = page.getByRole("dialog");
  await expect(
    ingredientSheet.getByText("300 g", { exact: true }),
  ).toBeVisible();
  await expect(ingredientSheet.getByText("4,5", { exact: true })).toBeVisible();
  await expect(
    ingredientSheet.getByText("150 ml", { exact: true }),
  ).toBeVisible();
  await expect(
    ingredientSheet.getByText("un peu", { exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Retour à la recette" }).click();
  await expect(page).toHaveURL(/\?personnes=9$/);
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByRole("spinbutton", { name: "Nombre de personnes" }),
  ).toHaveValue("9");

  await page.goto("/en/recettes/tarte-de-demonstration");
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByRole("spinbutton", { name: "Number of servings" }),
  ).toHaveValue("6");
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByText("Default", { exact: true }),
  ).toBeVisible();
});

test("step ingredients stay visible and scale on the recipe and in cook mode", async ({
  page,
}) => {
  await page.goto("/fr/recettes/tarte-de-demonstration?personnes=9");
  const recipeStep = page.locator("[data-step-ingredients]").first();
  await expect(recipeStep.getByText("Pour cette étape")).toBeVisible();
  await expect(recipeStep).toContainText("300 g");
  await expect(recipeStep).toContainText("Farine");
  await expect(recipeStep).toContainText("3");

  await page.getByRole("link", { name: "Commencer à cuisiner" }).click();
  const cookStep = page.locator("[data-step-ingredients]");
  await expect(cookStep).toContainText("300 g");
  await expect(cookStep).toContainText("Farine");
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(cookStep).toHaveCount(0);

  await page.goto("/en/recettes/tarte-de-demonstration");
  const englishStep = page.locator("[data-step-ingredients]").first();
  await expect(englishStep.getByText("For this step")).toBeVisible();
  await page.getByRole("link", { name: "Start cooking" }).click();
  await expect(page.locator("[data-step-ingredients]")).toContainText(
    "For this step",
  );
});

test("the portions control remains accessible at every recipe breakpoint", async ({
  page,
}, testInfo) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");
  const layout = testInfo.project.name === "desktop" ? "desktop" : "mobile";
  const panel = page.locator(`[data-ingredients-layout="${layout}"]`);
  if (layout === "mobile") {
    await panel.getByRole("button", { name: /Ingrédients/ }).click();
  }
  const counter = panel.getByRole("spinbutton", {
    name: "Nombre de personnes",
  });
  await expect(counter).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Diminuer le nombre de personnes" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Augmenter le nombre de personnes" }),
  ).toBeVisible();
  const selectorLayout = await panel
    .locator("[data-servings-selector]")
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(selectorLayout.scrollWidth).toBeLessThanOrEqual(
    selectorLayout.clientWidth,
  );
  await panel
    .getByRole("button", { name: "Augmenter le nombre de personnes" })
    .click();
  await expect(counter).toHaveValue("7");
  await expect(panel).toContainText("233,33 g");
});

test("English portions scale and follow the cook on mobile and desktop", async ({
  page,
}, testInfo) => {
  test.skip(!["mobile-390", "desktop"].includes(testInfo.project.name));
  await page.goto("/en/recettes/tarte-de-demonstration");
  const layout = testInfo.project.name === "desktop" ? "desktop" : "mobile";
  const panel = page.locator(`[data-ingredients-layout="${layout}"]`);
  if (layout === "mobile")
    await panel.getByRole("button", { name: /Ingredients/ }).click();
  const counter = panel.getByRole("spinbutton", { name: "Number of servings" });
  await expect(counter).toHaveValue("6");
  await expect(panel.getByText("Default", { exact: true })).toBeVisible();
  await counter.fill("");
  await expect(counter).toHaveValue("6");
  await counter.fill("51");
  await expect(counter).toHaveValue("50");
  await counter.fill("0");
  await expect(counter).toHaveValue("1");
  await counter.fill("2.5");
  await expect(counter).toHaveValue("1");
  await counter.fill("9");
  await expect(panel).toContainText("300 g");
  await expect(panel).toContainText("4.5");

  await page.getByRole("link", { name: "Start cooking" }).click();
  await expect(page).toHaveURL(/\/cuisiner\?personnes=9$/);
  await page.getByRole("button", { name: /Ingredients/ }).click();
  const ingredientSheet = page.getByRole("dialog");
  await expect(
    ingredientSheet.getByText("300 g", { exact: true }),
  ).toBeVisible();
  await expect(ingredientSheet.getByText("4.5", { exact: true })).toBeVisible();
});

test("the direct servings input stays synchronized across responsive layouts", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/tarte-de-demonstration");
  const desktop = page.locator('[data-ingredients-layout="desktop"]');
  await desktop
    .getByRole("spinbutton", { name: "Nombre de personnes" })
    .fill("9");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator('[data-ingredients-layout="mobile"]');
  await mobile.getByRole("button", { name: /Ingrédients/ }).click();
  await expect(
    mobile.getByRole("spinbutton", { name: "Nombre de personnes" }),
  ).toHaveValue("9");
  await expect(mobile).toContainText("300 g");
});

test("each recipe starts from its own reference portions and legacy recipes stay unchanged", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/tarte-de-demonstration?personnes=9");
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByRole("spinbutton", { name: "Nombre de personnes" }),
  ).toHaveValue("9");

  await page.goto("/fr/recettes/autre-recette-de-demonstration");
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByRole("spinbutton", { name: "Nombre de personnes" }),
  ).toHaveValue("4");
  await expect(
    page
      .locator('[data-ingredients-layout="desktop"]')
      .getByText("Par défaut", { exact: true }),
  ).toBeVisible();

  await page.goto("/fr/recettes/ancienne-recette-sans-portions");
  const legacyPanel = page.locator('[data-ingredients-layout="desktop"]');
  await expect(
    legacyPanel.getByRole("spinbutton", { name: "Nombre de personnes" }),
  ).toHaveCount(0);
  await expect(legacyPanel.getByText("2 cakes", { exact: true })).toBeVisible();
  await expect(legacyPanel).toContainText("200 g");
});

test("cook progress is retained when selected portions change", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.goto("/fr/recettes/tarte-de-demonstration/cuisiner?personnes=9");
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cuire");

  await page.goto("/fr/recettes/tarte-de-demonstration/cuisiner?personnes=12");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Cuire");
  await page.getByRole("button", { name: /Ingrédients/ }).click();
  await expect(page.getByText("400 g", { exact: true })).toBeVisible();
});

test("completion, restart, locale isolation, and wake-lock lifecycle stay local", async ({
  page,
}) => {
  await installWakeLockMock(page);
  await page.goto("/fr/recettes/tarte-de-demonstration/cuisiner");
  await page.getByLabel("Garder l’écran allumé").check();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wakeLockState: { requests: number } })
            .__wakeLockState.requests,
      ),
    )
    .toBe(1);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wakeLockState: { releases: number } })
            .__wakeLockState.releases,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wakeLockState: { requests: number } })
            .__wakeLockState.requests,
      ),
    )
    .toBe(2);

  await page.getByRole("button", { name: "Étape suivante" }).click();
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByRole("heading", { name: "C’est prêt" })).toBeVisible();
  await page
    .locator("section")
    .getByRole("link", { name: "Retour à la recette" })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __wakeLockState: { releases: number } })
            .__wakeLockState.releases,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expect(
    page.getByRole("link", { name: "Reprendre la recette" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recommencer" }).click();
  await expect(
    page.getByRole("link", { name: "Commencer à cuisiner" }),
  ).toBeVisible();

  await page.goto("/en/recettes/tarte-de-demonstration");
  await expect(page.getByRole("link", { name: "Start cooking" })).toBeVisible();
});

test("wake lock is opt-in and degrades quietly when unsupported", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/fr/recettes/tarte-de-demonstration/cuisiner");
  await expect(page.getByLabel("Garder l’écran allumé")).toBeDisabled();
  await expect(page.getByText(/n’est pas disponible/)).toBeVisible();
});

test("mobile cook mode fits the visible viewport without page scrolling", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  await installWakeLockMock(page);
  await page.setViewportSize({ width: 390, height: 650 });
  await page.goto("/fr/recettes/tarte-de-demonstration/cuisiner");
  await page.getByRole("heading", { level: 1 }).evaluate((heading) => {
    heading.textContent = "Battre les jaunes avec le sucre fin.";
  });

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main");
    const content = main?.children.item(1);
    const progressBar = document.querySelector("main > div[aria-hidden]");
    return {
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      mainClientHeight: main?.clientHeight ?? 0,
      mainOverflow: main ? getComputedStyle(main).overflowY : "",
      contentOverflow: content ? getComputedStyle(content).overflowY : "",
      progressBottom:
        progressBar?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
  expect(layout.mainClientHeight).toBeLessThanOrEqual(
    layout.viewportHeight + 1,
  );
  expect(layout.mainOverflow).toBe("hidden");
  expect(layout.contentOverflow).toBe("auto");
  expect(layout.progressBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
});

test("the legacy collection URL preserves discovery state", async ({
  page,
}) => {
  await page.goto("/fr/recettes?q=tarte&cat=dessert&view=list&sort=date");
  await expect(page).toHaveURL(
    /\/fr\?q=tarte&cat=dessert&view=list&sort=date#recettes$/,
  );
  await expect(
    page.getByRole("region", { name: "Recherche et filtres des recettes" }),
  ).toBeAttached();
  const searchbox = page.getByRole("searchbox", { name: "Rechercher une recette" });
  await expect(searchbox).toBeVisible();
  await expect(searchbox).toHaveValue("tarte");
});

test("locale switching preserves discovery and anchor state", async ({
  page,
}) => {
  await page.goto("/fr?q=tarte&cat=dessert&view=list&sort=date&order=asc#recettes");
  await page.getByRole("button", { name: /^Langue/ }).click();
  await page.getByRole("menuitem", { name: /English/ }).click();
  await expect(page).toHaveURL(
    /\/en\?q=tarte&cat=dessert&view=list&sort=date&order=asc#recettes$/,
  );
});

test("homepage discovery state remains URL-backed", async ({
  page,
}, testInfo) => {
  await page.goto("/fr");
  const searchbox = page.getByRole("searchbox", { name: "Rechercher une recette" });
  await expect(searchbox).toBeVisible();
  // Always visible, so it must not pop the phone keyboard on page load.
  await expect(searchbox).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Rechercher une recette" })).toHaveCount(0);
  const dessertFilter = page.getByRole("button", { name: "Dessert" });
  const [searchBox, dessertBox] = await Promise.all([
    searchbox.boundingBox(),
    dessertFilter.boundingBox(),
  ]);
  expect((searchBox?.y ?? 0) + (searchBox?.height ?? 0)).toBeLessThanOrEqual(dessertBox?.y ?? 0);
  const resultCount = page.getByText(/^\d+ recettes? sur \d+$/);
  // At rest the count is only announced to screen readers; it shows once a
  // search or a category is active.
  await expect(resultCount).toHaveClass(/sr-only/);
  await searchbox.fill("tarte");
  await searchbox.press("Enter");
  await expect(page).toHaveURL(/q=tarte/);
  await expect(resultCount).toHaveClass(/type-meta/);
  expect(await resultCount.evaluate((element) => getComputedStyle(element).whiteSpace))
    .toBe("nowrap");

  await dessertFilter.click();
  await expect(page).toHaveURL(/cat=dessert/);
  const resetFilters = page.getByRole("button", { name: "Réinitialiser" });
  const [resultBox, resetBox] = await Promise.all([
    resultCount.boundingBox(),
    resetFilters.boundingBox(),
  ]);
  expect(resultBox).not.toBeNull();
  expect(resetBox).not.toBeNull();
  expect((resultBox?.y ?? 0) + (resultBox?.height ?? 0) / 2)
    .toBeCloseTo((resetBox?.y ?? 0) + (resetBox?.height ?? 0) / 2, 0);
  if (testInfo.project.name.startsWith("mobile-")) {
    await page.goto("/fr?q=tarte&cat=dessert&view=list");
  } else {
    await page.getByRole("button", { name: "Vue liste" }).click();
  }
  await expect(page).toHaveURL(/view=list/);
  const alphabeticalSort = page.getByRole("button", { name: "Alphabétique" });
  await expect(alphabeticalSort).toBeVisible();
  const recipeLinks = page.locator('main a[href^="/fr/recettes/"]');
  const dateSort = page.getByRole("button", { name: "Date d’ajout" });
  await expect(dateSort).toBeVisible();
  await expect(dateSort).toHaveAttribute("aria-pressed", "true");
  const dateDescending = await recipeLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  await dateSort.click();
  await expect(page).toHaveURL(/sort=date&order=asc/);
  await expect.poll(() => recipeLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual([...dateDescending].reverse());

  await alphabeticalSort.click();
  await expect(page).toHaveURL(/sort=alpha&order=asc/);
  const alphabeticalAscending = await recipeLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  await alphabeticalSort.click();
  await expect(page).toHaveURL(/sort=alpha&order=desc/);
  await expect.poll(() => recipeLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  )).toEqual([...alphabeticalAscending].reverse());
});
