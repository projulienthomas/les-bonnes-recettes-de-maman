import { expect, test } from "@playwright/test";

test("recipe comments form is localized and keeps a browser participant key", async ({ page }) => {
  await page.goto("/fr/recettes/tarte-de-demonstration");
  await expect(page.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  await expect(page.getByText("Aucun commentaire pour le moment. Soyez la première personne à partager votre expérience.")).toBeVisible();
  await expect(page.getByText("Partagez votre résultat, une astuce ou un souvenir autour de cette recette.")).toHaveCount(1);
  const commentToggle = page.getByRole("button", { name: "Ajouter un commentaire" });
  await expect(commentToggle).toHaveCount(1);
  await expect(page.getByLabel("Votre commentaire")).not.toBeVisible();
  await commentToggle.click();
  await expect(page.getByText("Aucun commentaire pour le moment. Soyez la première personne à partager votre expérience.")).toHaveCount(0);
  await expect(page.getByLabel("Votre nom (facultatif)")).toHaveAttribute("maxlength", "60");
  await expect(page.getByLabel("Votre commentaire")).toHaveAttribute("maxlength", "1500");
  await expect(page.getByRole("switch", { name: "Ajouter une photo (facultatif)" })).toHaveCount(0);
  await expect(page.getByLabel("Choisir une photo")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await page.getByLabel("Votre nom (facultatif)").fill("Brouillon");
  await page.getByLabel("Votre commentaire").fill("À effacer");
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("button", { name: "Ajouter un commentaire" })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un commentaire" }).click();
  await expect(page.getByLabel("Votre nom (facultatif)")).toHaveValue("");
  await expect(page.getByLabel("Votre commentaire")).toHaveValue("");
  const participantKey = await page.evaluate(() => localStorage.getItem("recipe-comment-participant-v1"));
  expect(participantKey).toMatch(/^[a-f0-9]{48}$/);

  await page.goto("/en/recettes/tarte-de-demonstration");
  await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add a comment" }).click();
  await expect(page.getByLabel("Your comment")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("recipe-comment-participant-v1"))).toBe(participantKey);

  await page.evaluate(() => localStorage.setItem("recipe-comment-participant-v1", "corrupted"));
  await page.reload();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("recipe-comment-participant-v1"))).toMatch(/^[a-f0-9]{48}$/);
});

test("recipe comments remain usable when persistent browser storage is unavailable", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", { configurable: true, value: () => { throw new DOMException("Blocked", "SecurityError"); } });
    Object.defineProperty(Storage.prototype, "setItem", { configurable: true, value: () => { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.goto("/fr/recettes/tarte-de-demonstration");
  await expect(page.getByRole("heading", { name: "Commentaires", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ajouter un commentaire" }).click();
  await expect(page.getByRole("button", { name: "Publier le commentaire" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("recipe editor exposes protected comment moderation", async ({ page }) => {
  let deletedCommentId: string | null = null;
  await page.route("**/api/admin/recipes/comments", async (route) => {
    if (route.request().method() === "DELETE") {
      deletedCommentId = (route.request().postDataJSON() as { commentId: string }).commentId;
      await route.fulfill({ json: { type: "success", commentId: deletedCommentId } });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/admin/recipes/comments?**", async (route) => {
    await route.fulfill({
      json: {
        page: [{
          _id: "comment-e2e",
          _creationTime: Date.UTC(2026, 6, 19),
          authorName: null,
          text: "Très bonne recette.",
          photoUrl: null,
          edited: false,
          thumbsUpCount: 2,
          thumbsDownCount: 0,
        }],
        isDone: true,
        continueCursor: "",
      },
    });
  });
  await page.goto("/fr/admin/recettes?slug=tarte-de-demonstration");
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("menuitem", { name: "Commentaires" }).click();
  await expect(page.getByRole("heading", { name: "Commentaires de la recette" })).toBeVisible();
  await expect(page.getByText("Très bonne recette.")).toBeVisible();
  await page.getByRole("button", { name: "Supprimer" }).click();
  await confirmDestructiveAction(page, "Supprimer");
  await expect(page.getByText("Très bonne recette.")).toHaveCount(0);
  expect(deletedCommentId).toBe("comment-e2e");
});

test("visitor publishes, reacts, edits, reloads and deletes comments with and without a photo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  const marker = `Commentaire E2E ${Date.now()}`;
  await page.goto("/fr/recettes/mayonnaise");
  await page.getByRole("button", { name: "Ajouter un commentaire" }).click();
  const commentInput = page.getByLabel("Votre commentaire");
  await expect(commentInput).toBeVisible();
  await commentInput.fill(marker);
  await page.getByLabel("Choisir une photo").setInputFiles({
    name: "resultat.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Publier le commentaire" }).click();
  await expect(page.getByText("Votre commentaire est publié.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter un commentaire" })).toBeVisible();
  await expect(page.getByText(marker, { exact: true })).toBeVisible();

  let article = page.locator("article").filter({ hasText: marker });
  await expect(article.getByRole("heading", { name: "Anonyme" })).toBeVisible();
  await article.getByRole("button", { name: "Ouvrir la photo de Anonyme" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  const like = article.getByRole("button", { name: "J’aime" });
  const down = article.getByRole("button", { name: "Pouce bas" });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like).toContainText("1");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(like).toContainText("0");
  await like.click();
  await expect(like).toHaveAttribute("aria-busy", "false");
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(article.getByRole("status")).toContainText("1 mention J’aime, Aimé");
  await down.click();
  await expect(down).toHaveAttribute("aria-pressed", "true");
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-busy", "false");

  await page.reload();
  article = page.locator("article").filter({ hasText: marker });
  await expect(article.getByRole("button", { name: "Modifier" })).toBeVisible();
  await article.getByRole("button", { name: "Modifier" }).click();
  await expect(page.getByLabel("Votre commentaire")).toBeFocused();
  const editToggle = page.locator('[aria-controls="recipe-comment-form"]');
  await editToggle.click();
  await expect(editToggle).toHaveAccessibleName("Reprendre la modification");
  await editToggle.click();
  const editedMarker = `${marker} modifié`;
  await page.getByLabel("Votre commentaire").fill(editedMarker);
  await page.getByRole("button", { name: "Retirer la photo" }).click();
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText("Votre commentaire a été modifié.")).toBeVisible();
  article = page.locator("article").filter({ hasText: editedMarker });
  await expect(article).toContainText("modifié");
  await expect(article.getByRole("button", { name: "Ouvrir la photo de Anonyme" })).toHaveCount(0);

  await article.getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Choisir une photo").setInputFiles({
    name: "resultat-remplace.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  article = page.locator("article").filter({ hasText: editedMarker });
  await expect(article.getByRole("button", { name: "Ouvrir la photo de Anonyme" })).toBeVisible();

  await article.getByRole("button", { name: "Modifier" }).click();
  await expect(page.getByLabel("Votre commentaire")).toBeFocused();
  await article.getByRole("button", { name: "Supprimer" }).click();
  await confirmDestructiveAction(page, "Supprimer");
  await expect(article).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ajouter un commentaire" })).toBeVisible();

  const namedMarker = `${marker} nommé`;
  await page.getByRole("button", { name: "Ajouter un commentaire" }).click();
  await page.getByLabel("Votre nom (facultatif)").fill("Julien E2E");
  await page.getByLabel("Votre commentaire").fill(namedMarker);
  await page.getByRole("button", { name: "Publier le commentaire" }).click();
  const namedArticle = page.locator("article").filter({ hasText: namedMarker });
  await expect(namedArticle.getByRole("heading", { name: "Julien E2E" })).toBeVisible();
  await namedArticle.getByRole("button", { name: "Supprimer" }).click();
  await confirmDestructiveAction(page, "Supprimer");
  await expect(namedArticle).toHaveCount(0);

  const englishMarker = `${marker} English`;
  await page.goto("/en/recettes/mayonnaise");
  await page.getByRole("button", { name: "Add a comment" }).click();
  await page.getByLabel("Your comment").fill(englishMarker);
  await page.getByRole("button", { name: "Publish comment" }).click();
  let englishArticle = page.locator("article").filter({ hasText: englishMarker });
  await expect(englishArticle.getByRole("heading", { name: "Anonymous" })).toBeVisible();
  let englishLike = englishArticle.getByRole("button", { name: "Like" });
  await expect(englishArticle.getByRole("button", { name: "Thumbs down" })).toBeVisible();
  await englishLike.click();
  await expect(englishLike).toHaveAttribute("aria-busy", "false");
  await expect(englishLike).toHaveAttribute("aria-pressed", "true");
  await expect(englishLike).toContainText("1");
  await expect(englishArticle.getByRole("status")).toContainText("1 like, Liked");
  await page.reload();
  englishArticle = page.locator("article").filter({ hasText: englishMarker });
  englishLike = englishArticle.getByRole("button", { name: "Like" });
  await expect(englishLike).toHaveAttribute("aria-pressed", "true");
  await englishLike.click();
  await expect(englishLike).toHaveAttribute("aria-busy", "false");
  await expect(englishLike).toHaveAttribute("aria-pressed", "false");
  await expect(englishLike).toContainText("0");
  await englishArticle.getByRole("button", { name: "Edit" }).click();
  const editedEnglishMarker = `${englishMarker} edited`;
  await page.getByLabel("Your comment").fill(editedEnglishMarker);
  await page.getByRole("button", { name: "Save changes" }).click();
  englishArticle = page.locator("article").filter({ hasText: editedEnglishMarker });
  await expect(englishArticle).toContainText("edited");
  await englishArticle.getByRole("button", { name: "Delete" }).click();
  await confirmDestructiveAction(page, "Delete");
  await expect(englishArticle).toHaveCount(0);
});

test("visitor loads comments beyond the first batch of ten", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(60_000);
  const marker = `Pagination E2E ${Date.now()}`;
  const participantKeySeed = Date.now().toString(16);
  const participantKeys = Array.from({ length: 11 }, (_, index) => `${participantKeySeed}${index.toString(16).padStart(2, "0")}`.padEnd(48, "0"));
  await page.goto("/fr/recettes/amandin");

  for (let index = 0; index < participantKeys.length; index += 1) {
    await switchParticipant(page, participantKeys[index]);
    const addComment = page.getByRole("button", { name: "Ajouter un commentaire" });
    const commentInput = page.getByLabel("Votre commentaire");
    await expect.poll(async () =>
      (await addComment.isVisible()) || (await commentInput.isVisible()),
    ).toBe(true);
    if (await addComment.isVisible()) await addComment.click();
    await expect(commentInput).toBeVisible();
    await commentInput.fill(`${marker} ${index + 1}`);
    await page.getByRole("button", { name: "Publier le commentaire" }).click();
    await expect(commentArticle(page, `${marker} ${index + 1}`)).toBeVisible();
  }

  await page.reload();
  await expect(commentArticle(page, `${marker} 1`)).toHaveCount(0);
  await page.getByRole("button", { name: "Voir plus de commentaires" }).click();
  await expect(commentArticle(page, `${marker} 1`)).toBeVisible();

  for (let index = participantKeys.length - 1; index >= 0; index -= 1) {
    await switchParticipant(page, participantKeys[index]);
    const article = commentArticle(page, `${marker} ${index + 1}`);
    await article.getByRole("button", { name: "Supprimer" }).click();
    await confirmDestructiveAction(page, "Supprimer");
    await expect(article).toHaveCount(0);
  }
});

async function switchParticipant(page: import("@playwright/test").Page, key: string) {
  await page.evaluate((nextKey) => {
    localStorage.setItem("recipe-comment-participant-v1", nextKey);
    window.dispatchEvent(new StorageEvent("storage", {
      key: "recipe-comment-participant-v1",
      newValue: nextKey,
    }));
  }, key);
}

async function confirmDestructiveAction(page: import("@playwright/test").Page, label: string) {
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
}

function commentArticle(page: import("@playwright/test").Page, text: string) {
  return page.getByText(text, { exact: true }).locator("xpath=ancestor::article");
}
