import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  fetchMutation,
  fetchQuery,
  revalidateRecipePaths,
  grantRecipeAdminAccess,
  verifyRecipeAdminPassword,
  getAdminRecipeIdea,
  createAdminRecipeIdea,
  removeAdminRecipeIdea,
  getRecipeAdminAccess,
  adminUnauthorizedResponse,
} = vi.hoisted(() => ({
  fetchMutation: vi.fn(),
  fetchQuery: vi.fn(),
  revalidateRecipePaths: vi.fn(),
  grantRecipeAdminAccess: vi.fn(),
  verifyRecipeAdminPassword: vi.fn(() => true),
  getAdminRecipeIdea: vi.fn(),
  createAdminRecipeIdea: vi.fn(),
  removeAdminRecipeIdea: vi.fn(),
  getRecipeAdminAccess: vi.fn(),
  adminUnauthorizedResponse: vi.fn(() =>
    Response.json({ error: "Accès admin requis." }, { status: 401 }),
  ),
}));

vi.mock("convex/nextjs", () => ({ fetchMutation, fetchQuery }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/recipe-admin-auth", () => ({
  getRecipeAdminAccess,
  adminUnauthorizedResponse,
  getRecipeAdminPassword: vi.fn(() => "test-password"),
  grantRecipeAdminAccess,
  verifyRecipeAdminPassword,
}));
vi.mock("@/lib/recipe-admin-revalidate", () => ({ revalidateRecipePaths }));
vi.mock("@/lib/recipe-idea-admin-client", () => ({
  getAdminRecipeIdea,
  createAdminRecipeIdea,
  removeAdminRecipeIdea,
  listAdminRecipeIdeas: vi.fn(),
  getAdminRecipeIdeaCount: vi.fn(),
}));

import { POST as saveRecipe } from "./save/route";
import { POST as discardRecipe } from "./discard-draft/route";
import { POST as setHeroImage } from "./hero-image/route";
import { POST as setUnsplashImage } from "./unsplash-hero-image/route";
import { POST as setOpenverseImage } from "./openverse-hero-image/route";
import { POST as publishRecipe } from "./publish/route";
import { POST as setRecipeVisibility } from "./visibility/route";
import { DELETE as deleteRecipe } from "./delete/route";
import { POST as cleanupImage } from "./cleanup-image/route";
import { POST as accessAdmin } from "./access/route";
import { POST as revalidateRecipes } from "./revalidate/route";
import {
  POST as createIdea,
  DELETE as deleteIdea,
} from "../recipe-ideas/route";

const localized = {
  title: "Tarte mobile",
  author: "Maman",
  description: "Une recette",
  yieldLabel: "",
  prepTime: "10 min",
  cookTime: "",
  restTime: "",
  totalTime: "",
  timeLabel: "",
  temperature: "",
  equipment: [],
  ingredients: [{ name: "Farine", quantity: "100", unit: "g", notes: "" }],
  sections: [{ title: "Préparation", steps: ["Mélanger"] }],
  subRecipes: [],
  notes: [],
};
const payload = {
  defaultLocale: "fr",
  referenceServings: 6,
  translations: { fr: localized, en: localized },
  categories: [],
  relatedRecipeSlugs: [],
};

function request(body: unknown) {
  return new Request("http://localhost/api/admin/recipes/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest() {
  return new Request("http://localhost/api/admin/recipes/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
}

describe("recipe admin route contracts", () => {
  beforeEach(() => {
    fetchMutation.mockReset();
    fetchQuery.mockReset();
    revalidateRecipePaths.mockReset();
    getAdminRecipeIdea.mockReset();
    getAdminRecipeIdea.mockResolvedValue({ _id: "idea-123" });
    createAdminRecipeIdea.mockReset();
    createAdminRecipeIdea.mockResolvedValue({ ideaId: "idea-123" });
    removeAdminRecipeIdea.mockReset();
    removeAdminRecipeIdea.mockResolvedValue({ ideaId: "idea-123" });
    getRecipeAdminAccess.mockReset();
    getRecipeAdminAccess.mockResolvedValue({
      ok: true,
      adminPassword: "test-password",
    });
  });

  test("all JSON mutation routes reject malformed bodies with a typed validation response", async () => {
    const responses = await Promise.all([
      saveRecipe(malformedRequest() as never),
      discardRecipe(malformedRequest() as never),
      setHeroImage(malformedRequest() as never),
      setUnsplashImage(malformedRequest() as never),
      setOpenverseImage(malformedRequest() as never),
      cleanupImage(malformedRequest() as never),
      publishRecipe(malformedRequest() as never),
      setRecipeVisibility(malformedRequest() as never),
      deleteRecipe(malformedRequest() as never),
      accessAdmin(malformedRequest() as never),
      revalidateRecipes(malformedRequest() as never),
      createIdea(malformedRequest() as never),
      deleteIdea(malformedRequest() as never),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        type: "validation",
        fieldErrors: {},
      });
    }
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("save returns slug, revision, and savedAt", async () => {
    fetchMutation.mockResolvedValue({
      slug: "tarte-mobile",
      title: "Tarte mobile",
      revision: 4,
      publishedRevision: 4,
      isPublic: true,
      savedAt: 1234,
    });
    const response = await saveRecipe(
      request({
        locale: "fr",
        mode: "update",
        slug: "tarte-mobile",
        expectedRevision: 3,
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      slug: "tarte-mobile",
      revision: 4,
      publishedRevision: 4,
      isPublic: true,
      savedAt: 1234,
    });
    expect(fetchMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        slug: "tarte-mobile",
        expectedRevision: 3,
        preserveStepIngredientUses: { fr: true, en: true },
      }),
    );
  });

  test("recipe creation forwards an optional source idea without changing ordinary creates", async () => {
    fetchMutation.mockResolvedValue({
      slug: "tarte-mobile",
      title: "Tarte mobile",
      revision: 0,
      savedAt: 1234,
    });
    await saveRecipe(
      request({
        locale: "fr",
        mode: "create",
        slug: "",
        sourceIdeaId: "idea-123",
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    expect(fetchMutation.mock.calls[0]?.[1]).toMatchObject({
      sourceIdeaId: "idea-123",
      adminPassword: "test-password",
    });

    await saveRecipe(
      request({
        locale: "fr",
        mode: "create",
        slug: "",
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    expect(fetchMutation.mock.calls[1]?.[1]).not.toHaveProperty("sourceIdeaId");
  });

  test("recipe creation rejects a malformed or unavailable source idea", async () => {
    getAdminRecipeIdea.mockResolvedValue(null);
    const response = await saveRecipe(
      request({
        locale: "fr",
        mode: "create",
        slug: "",
        sourceIdeaId: "not-a-convex-id",
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      type: "validation",
      fieldErrors: { sourceIdeaId: "Cette idée de recette est introuvable." },
    });
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("admin login preserves safe idea destinations and rejects external redirects", async () => {
    const safe = await accessAdmin(
      request({
        locale: "fr",
        password: "secret",
        redirectTo: "/fr/admin/recettes?new=1&idea=idea-123",
      }) as never,
    );
    expect(await safe.json()).toMatchObject({
      redirectTo: "/fr/admin/recettes?new=1&idea=idea-123",
    });
    const unsafe = await accessAdmin(
      request({
        locale: "fr",
        password: "secret",
        redirectTo: "https://evil.example/fr/admin/recettes?new=1",
      }) as never,
    );
    expect(await unsafe.json()).toMatchObject({
      redirectTo: "/fr/admin/recettes",
    });
  });

  test("admin idea routes validate and forward create and delete requests", async () => {
    const created = await createIdea(
      request({ authorName: "Maman", text: "Des bugnes" }) as never,
    );
    expect(created.status).toBe(200);
    expect(createAdminRecipeIdea).toHaveBeenCalledWith("test-password", {
      authorName: "Maman",
      text: "Des bugnes",
    });
    const removed = await deleteIdea(
      request({ ideaId: "idea-123" }) as never,
    );
    expect(removed.status).toBe(200);
    expect(removeAdminRecipeIdea).toHaveBeenCalledWith(
      "test-password",
      "idea-123",
    );
  });

  test("admin idea routes require the existing cookie-protected session", async () => {
    getRecipeAdminAccess.mockResolvedValue({
      ok: false,
      status: 401,
      message: "Accès admin requis.",
    });
    const response = await createIdea(
      request({ authorName: "Maman", text: "Des bugnes" }) as never,
    );
    expect(response.status).toBe(401);
    expect(createAdminRecipeIdea).not.toHaveBeenCalled();
  });

  test("save rejects reference servings outside the public selector bounds", async () => {
    const response = await saveRecipe(
      request({
        locale: "fr",
        mode: "update",
        slug: "tarte-mobile",
        expectedRevision: 3,
        recipePayload: JSON.stringify({ ...payload, referenceServings: 51 }),
      }) as never,
    );
    expect(response.status).toBe(400);
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  test("image routes return typed successful revision responses", async () => {
    fetchMutation
      .mockResolvedValueOnce({
        slug: "tarte-mobile",
        heroImageUrl: "https://storage.example/photo.jpg",
        revision: 4,
        savedAt: 1234,
      })
      .mockResolvedValueOnce({
        slug: "tarte-mobile",
        heroImageUrl: "https://images.example/photo.jpg",
        revision: 5,
        savedAt: 2345,
      });

    const upload = await setHeroImage(
      request({
        slug: "tarte-mobile",
        storageId: "storage-id",
        expectedRevision: 3,
      }) as never,
    );
    const unsplash = await setUnsplashImage(
      request({
        slug: "tarte-mobile",
        imageUrl: "https://images.example/photo.jpg",
        photographerName: "Maman",
        photographerUrl: "https://example.com/maman",
        photoUrl: "https://example.com/photo",
        expectedRevision: 4,
      }) as never,
    );

    expect(await upload.json()).toMatchObject({ type: "success", revision: 4 });
    expect(await unsplash.json()).toMatchObject({
      type: "success",
      revision: 5,
    });
  });

  test("cleanup reports whether an upload was deleted or already referenced", async () => {
    fetchMutation
      .mockResolvedValueOnce({ referenced: false, slug: "tarte-mobile" })
      .mockResolvedValueOnce({
        referenced: true,
        slug: "tarte-mobile",
        revision: 5,
        savedAt: 2345,
        heroImageUrl: "https://storage.example/photo.jpg",
      });
    const orphan = await cleanupImage(
      request({ slug: "tarte-mobile", storageId: "storage-id" }) as never,
    );
    const referenced = await cleanupImage(
      request({ slug: "tarte-mobile", storageId: "storage-id" }) as never,
    );
    expect(await orphan.json()).toMatchObject({
      type: "success",
      referenced: false,
    });
    expect(await referenced.json()).toMatchObject({
      type: "success",
      referenced: true,
      revision: 5,
    });
  });

  test("save and image routes expose typed revision conflicts", async () => {
    fetchMutation.mockRejectedValue(new Error("RECIPE_DRAFT_CONFLICT:7"));
    const saveResponse = await saveRecipe(
      request({
        locale: "fr",
        mode: "update",
        slug: "tarte-mobile",
        expectedRevision: 3,
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    const uploadResponse = await setHeroImage(
      request({
        slug: "tarte-mobile",
        storageId: "storage-id",
        expectedRevision: 3,
      }) as never,
    );
    const unsplashResponse = await setUnsplashImage(
      request({
        slug: "tarte-mobile",
        imageUrl: "https://images.example/photo.jpg",
        photographerName: "Maman",
        photographerUrl: "https://example.com/maman",
        photoUrl: "https://example.com/photo",
        expectedRevision: 3,
      }) as never,
    );
    for (const response of [saveResponse, uploadResponse, unsplashResponse]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "conflict",
        latestRevision: 7,
      });
    }
  });

  test("related recipe validation errors remain actionable through admin routes", async () => {
    fetchMutation
      .mockRejectedValueOnce(new Error("RECIPE_RELATED_RECIPE_SELF_REFERENCE"))
      .mockRejectedValueOnce(
        new Error("RECIPE_RELATED_RECIPE_NOT_FOUND:mayonnaise"),
      );
    const saveResponse = await saveRecipe(
      request({
        locale: "fr",
        mode: "update",
        slug: "tarte-mobile",
        expectedRevision: 3,
        recipePayload: JSON.stringify(payload),
      }) as never,
    );
    const publishResponse = await publishRecipe(
      request({ slug: "tarte-mobile", expectedRevision: 3 }) as never,
    );

    expect(saveResponse.status).toBe(400);
    expect(await saveResponse.json()).toMatchObject({
      type: "error",
      message: "Une recette ne peut pas être associée à elle-même.",
    });
    expect(publishResponse.status).toBe(400);
    expect(await publishResponse.json()).toMatchObject({
      type: "error",
      message:
        "La recette associée « mayonnaise » est introuvable ou n’est pas publiée.",
    });
  });

  test("Openverse image association exposes the same typed conflict", async () => {
    fetchMutation.mockRejectedValueOnce(new Error("RECIPE_DRAFT_CONFLICT:9"));
    const response = await setOpenverseImage(
      request({
        slug: "tarte-mobile",
        storageId: "storage-id",
        expectedRevision: 3,
        imageCredit: {
          provider: "openverse",
          title: "Tarte",
          creator: "Maman",
          creatorUrl: "https://example.com/maman",
          imageUrl: "https://images.example/photo.jpg",
          landingUrl: "https://example.com/photo",
          license: "CC BY",
          licenseVersion: "4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          source: "openverse",
          attribution: "Maman, CC BY 4.0",
          alt: "Tarte",
        },
      }) as never,
    );
    expect(response.status).toBe(409);
    expect(fetchMutation.mock.calls[0]?.[1].imageCredit).not.toHaveProperty(
      "provider",
    );
    expect(await response.json()).toMatchObject({
      type: "conflict",
      latestRevision: 9,
    });
  });

  test("discard returns the restored draft and publication revisions", async () => {
    fetchMutation.mockResolvedValue({
      slug: "tarte-mobile",
      revision: 5,
      publishedRevision: 5,
      savedAt: 2345,
      heroImageUrl: "/published.jpg",
      draft: payload,
    });
    const response = await discardRecipe(
      request({ slug: "tarte-mobile", expectedRevision: 4 }) as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      revision: 5,
      publishedRevision: 5,
      heroImageUrl: "/published.jpg",
      draft: { translations: { fr: { title: "Tarte mobile" } } },
    });
  });

  test("publish validates input, returns revisions, and exposes typed blockers", async () => {
    expect(
      (await publishRecipe(request({ slug: "tarte-mobile" }) as never)).status,
    ).toBe(400);
    fetchMutation.mockResolvedValueOnce({
      slug: "tarte-mobile",
      revision: 5,
      publishedRevision: 5,
      savedAt: 3456,
    });
    const success = await publishRecipe(
      request({ slug: "tarte-mobile", expectedRevision: 5 }) as never,
    );
    expect(await success.json()).toMatchObject({
      type: "success",
      revision: 5,
      publishedRevision: 5,
      savedAt: 3456,
    });
    fetchMutation.mockRejectedValueOnce(new Error("RECIPE_NOT_READY"));
    expect(
      (
        await publishRecipe(
          request({ slug: "tarte-mobile", expectedRevision: 5 }) as never,
        )
      ).status,
    ).toBe(400);
  });

  test("visibility has an explicit success contract", async () => {
    fetchMutation.mockResolvedValue({ slug: "tarte-mobile", isPublic: false });
    const response = await setRecipeVisibility(
      request({ slug: "tarte-mobile", visible: false }) as never,
    );
    expect(await response.json()).toEqual({
      type: "success",
      slug: "tarte-mobile",
      isPublic: false,
    });
  });

  test("delete validates revisions and returns a typed success contract", async () => {
    expect(
      (await deleteRecipe(request({ slug: "tarte-mobile" }) as never)).status,
    ).toBe(400);
    fetchMutation.mockResolvedValueOnce({ slug: "tarte-mobile" });
    const success = await deleteRecipe(
      request({ slug: "tarte-mobile", expectedRevision: 5 }) as never,
    );
    expect(await success.json()).toEqual({
      type: "success",
      slug: "tarte-mobile",
    });
    expect(revalidateRecipePaths).toHaveBeenCalledWith("tarte-mobile");

    fetchMutation.mockRejectedValueOnce(new Error("RECIPE_DRAFT_CONFLICT:7"));
    const conflict = await deleteRecipe(
      request({ slug: "tarte-mobile", expectedRevision: 5 }) as never,
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      type: "conflict",
      latestRevision: 7,
    });
  });
  test("revalidate requires admin access before reading the body", async () => {
    getRecipeAdminAccess.mockResolvedValueOnce({
      ok: false,
      status: 401,
      message: "Acces admin requis.",
    });
    const response = await revalidateRecipes(
      request({ slugs: ["tarte-mobile"] }) as never,
    );
    expect(response.status).toBe(401);
    expect(revalidateRecipePaths).not.toHaveBeenCalled();
  });

  test("revalidate refreshes each distinct synced slug", async () => {
    const response = await revalidateRecipes(
      request({ slugs: ["tarte-mobile", "tiramisu", "tarte-mobile"] }) as never,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "success",
      slugs: ["tarte-mobile", "tiramisu"],
    });
    expect(revalidateRecipePaths.mock.calls).toEqual([
      ["tarte-mobile"],
      ["tiramisu"],
    ]);
  });

  test("revalidate rejects empty, oversized, and malformed slug lists", async () => {
    const invalidBodies = [
      {},
      { slugs: [] },
      { slugs: "tarte-mobile" },
      { slugs: ["../admin"] },
      { slugs: ["Tarte Mobile"] },
      { slugs: ["tarte-mobile"], extra: true },
      { slugs: Array.from({ length: 101 }, (_, index) => `recette-${index}`) },
    ];
    for (const body of invalidBodies) {
      const response = await revalidateRecipes(request(body) as never);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ type: "validation" });
    }
    expect(revalidateRecipePaths).not.toHaveBeenCalled();
  });
});
