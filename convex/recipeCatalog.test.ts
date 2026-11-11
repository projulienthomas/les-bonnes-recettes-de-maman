import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { recipeCatalog } from "./recipeCatalog";
import { rawRecipeCatalog } from "./recipeCatalog/rawCatalog";
import { loadCatalogSources } from "./recipeCatalog/validation";

const recipes = recipeCatalog;

describe("bilingual recipe catalog", () => {
  test("keeps the generated manifest aligned with every recipe filename", () => {
    const filenames = readdirSync(
      new URL("./recipeCatalog/recipes", import.meta.url),
    )
      .filter((filename) => filename.endsWith(".json"))
      .sort();

    expect(Object.keys(rawRecipeCatalog)).toEqual(
      filenames.map((filename) => filename.replace(/\.json$/, "")),
    );
    expect(
      Object.values(rawRecipeCatalog).map(({ sourcePath }) => sourcePath),
    ).toEqual(
      filenames.map((filename) => `./recipes/${filename}`),
    );
  });

  test("rejects an index slug that disagrees with its recipe filename", () => {
    const [entry] = Object.values(rawRecipeCatalog);

    expect(() =>
      loadCatalogSources({ "not-the-indexed-slug": entry }),
    ).toThrow(
      "Catalog index slug not-the-indexed-slug does not match file slug amandin",
    );
  });

  test("rejects an embedded slug that disagrees with its index and filename", () => {
    const [entry] = Object.values(rawRecipeCatalog);

    expect(() =>
      loadCatalogSources({
        "not-the-embedded-slug": {
          ...entry,
          sourcePath: "./recipes/not-the-embedded-slug.json",
        },
      }),
    ).toThrow(
      "Catalog index slug not-the-embedded-slug contains recipe amandin",
    );
  });

  test("loads every recipe with explicit French and English content", () => {
    for (const recipe of recipes) {
      const french = recipe.translations.fr;
      const english = recipe.translations.en;

      expect(french.title).not.toBe("");
      expect(english.title).not.toBe("");
      expect(french.description).not.toBe("");
      expect(english.description).not.toBe("");
      expect(french.yieldLabel).toBeTypeOf("string");
      expect(english.yieldLabel).toBeTypeOf("string");
    }
  });

  test("corrects the localized Gougères yield in seeded storage", () => {
    const gougeres = recipes.find((recipe) => recipe.slug === "gougeres");
    expect(gougeres).toBeDefined();

    const seeded = gougeres!;
    expect(seeded.translations.fr.yieldLabel).toBe("Environ 20 gougères");
    expect(seeded.translations.en.yieldLabel).toBe("About 20 gougères");
  });

  test("localizes Fabrice's champagne punch without changing its brands or quantities", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "soupe-de-champagne",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded.categories).toEqual(["sucre"]);
    expect(seeded.heroImageUrl).toBe("https://images.unsplash.com/photo-1578425144925-a3638eb650aa?auto=format&fit=crop&w=1400&q=85");
    expect(seeded.referenceServings).toBeUndefined();

    expect(seeded.translations.fr).toMatchObject({
      title: "Soupe de champagne",
      author: "Fabrice",
      yieldLabel: "Environ 1 litre",
      prepTime: "5 min",
    });
    expect(
      seeded.translations.fr.ingredients.map(({ name, quantity, unit }) => ({
        name,
        quantity,
        unit,
      })),
    ).toEqual([
      { name: "crémant de Loire", quantity: "75", unit: "cl" },
      { name: "Cointreau", quantity: "10", unit: "cl" },
      { name: "Pulco Citron", quantity: "10", unit: "cl" },
      { name: "Canadou", quantity: "5 à 7", unit: "cl" },
      { name: "glaçons", quantity: "", unit: "" },
    ]);
    expect(
      seeded.translations.fr.sections[0]?.steps.map(({ text }) => text),
    ).toEqual([
      "Placer tous les ingrédients au réfrigérateur à l’avance afin qu’ils soient bien frais.",
      "Dans un saladier, mélanger le Cointreau, le Pulco Citron et le Canadou.",
      "Au dernier moment, ajouter le crémant de Loire.",
      "Ajouter des glaçons, remuer délicatement et servir aussitôt, très frais.",
    ]);

    const liquidIngredients = source!.translations.fr.ingredients.slice(0, 4);
    const fixedVolume = liquidIngredients
      .slice(0, 3)
      .reduce((total, ingredient) => total + Number(ingredient.quantity), 0);
    const canadouRange = liquidIngredients[3]!.quantity
      .split(" à ")
      .map(Number);
    expect(canadouRange.map((quantity) => fixedVolume + quantity)).toEqual([
      100, 102,
    ]);

    expect(seeded.translations.en).toMatchObject({
      title: "Champagne Punch",
      author: "Fabrice",
      yieldLabel: "About 1 litre",
      prepTime: "5 min",
    });
    expect(
      seeded.translations.en.ingredients.map(({ name, quantity }) => ({
        name,
        quantity,
      })),
    ).toEqual([
      { name: "Loire Valley Crémant", quantity: "75" },
      { name: "Cointreau", quantity: "10" },
      { name: "Pulco Citron", quantity: "10" },
      { name: "Canadou", quantity: "5 to 7" },
      { name: "ice cubes", quantity: "" },
    ]);
    expect(
      seeded.translations.en.sections[0]?.steps.map(({ text }) => text),
    ).toEqual([
      "Chill all the ingredients in advance so they are very cold.",
      "In a punch bowl, combine the Cointreau, Pulco Citron and Canadou.",
      "At the last moment, add the Loire Valley Crémant.",
      "Add ice cubes, stir gently and serve immediately, very cold.",
    ]);
  });

  test("localizes Julien's chocolate chip cookies as a piece-based recipe", () => {
    const source = recipes.find(
      (recipe) =>
        recipe.slug === "cookies-aux-pepites-de-chocolat-et-fleur-de-sel",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "cookies-aux-pepites-de-chocolat-et-fleur-de-sel",
      heroImageUrl:
        "https://festive-lobster-957.eu-west-1.convex.cloud/api/storage/478b3cf6-cb85-4e8f-a303-360ff520e49d",
      categories: ["dessert", "sucre"],
      legacyCategoryLabels: [],
    });
    expect(seeded.referenceServings).toBeUndefined();

    expect(seeded.translations.fr).toMatchObject({
      title: "Cookies aux pépites de chocolat et fleur de sel",
      author: "Julien",
      yieldLabel: "Environ 20 gros cookies",
      prepTime: "≈ 40 min",
      cookTime: "10 min",
      totalTime: "≈ 1 h 20",
      temperature: "180 °C",
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Chocolate Chip Cookies with Fleur de Sel",
      author: "Julien",
      description:
        "Large chocolate chip cookies with crisp edges, soft centers and a touch of fleur de sel.",
      yieldLabel: "About 20 large cookies",
      prepTime: "≈ 40 min",
      cookTime: "10 min",
      totalTime: "≈ 1 h 20",
      temperature: "180 °C",
    });
    expect(
      seeded.translations.en.ingredients.map(({ name, notes }) => ({
        name,
        notes,
      })),
    ).toEqual([
      { name: "butter", notes: "" },
      { name: "brown sugar", notes: "" },
      { name: "granulated sugar", notes: "" },
      { name: "flour", notes: "" },
      { name: "baking soda", notes: "optional" },
      { name: "baking powder", notes: "" },
      { name: "salt", notes: "" },
      { name: "large egg", notes: "" },
      { name: "vanilla bean", notes: "seeds only" },
      { name: "dark chocolate", notes: "roughly chopped" },
      { name: "fleur de sel", notes: "for sprinkling" },
    ]);
    expect(seeded.translations.en.sections.map(({ title }) => title)).toEqual([
      "Preparing the Dough",
      "Resting",
      "Baking",
      "Cooling",
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Melt the butter in a saucepan over medium heat, then let it cool slightly off the heat.",
      "While the butter melts, combine the flour, baking soda, baking powder and salt in a first bowl. Roughly chop the chocolate.",
      "Pour the melted butter into a second, larger bowl. Add the brown sugar and granulated sugar, then mix until smooth.",
      "Mix the egg and vanilla seeds into the large bowl until smooth and glossy.",
      "Add the contents of the first bowl to the large bowl in two batches, mixing with a wooden spoon only until the flour is incorporated.",
      "Add the chopped chocolate and mix once more without overworking the dough.",
      "Cover the bowl and chill the dough for 30 min.",
      "Preheat the oven to 180 °C and line a baking sheet with parchment paper.",
      "Shape the dough into large balls with an ice cream scoop or tablespoon, spacing them well apart on the baking sheet.",
      "Sprinkle each ball with a small pinch of fleur de sel.",
      "Bake for 8 min, remove the baking sheet and tap it lightly on the counter to help the cookies spread.",
      "Bake for another 2 min, then tap the baking sheet again after removing it from the oven.",
      "Transfer the cookies to a rack and let them rest for at least 10 min before storing or serving.",
    ]);
  });

  test("localizes Mary McHale's banana bread as one metric loaf", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "banana-bread-du-kona-inn",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded.referenceServings).toBeUndefined();
    expect(seeded.translations.fr).toMatchObject({
      title: "Banana bread",
      author: "Mary McHale",
      yieldLabel: "1 cake",
      prepTime: "20 min",
      cookTime: "45 à 60 min",
      temperature: "175 °C",
    });
    expect(
      seeded.translations.fr.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "sucre blanc", quantity: "150", unit: "g", notes: "" },
      { name: "beurre", quantity: "115", unit: "g", notes: "fondu" },
      { name: "bananes bien mûres", quantity: "325 à 350", unit: "g", notes: "écrasées, environ 3 à 4 bananes selon leur taille" },
      { name: "œufs", quantity: "2", unit: "", notes: "bien battus" },
      { name: "farine T45", quantity: "150", unit: "g", notes: "" },
      { name: "bicarbonate de soude", quantity: "1", unit: "c. à café", notes: "" },
      { name: "sel", quantity: "3", unit: "g", notes: "" },
      { name: "noix de pécan hachées", quantity: "40", unit: "g", notes: "" },
      { name: "cannelle", quantity: "1", unit: "pincée", notes: "" },
      { name: "noix de pécan hachées", quantity: "60", unit: "g", notes: "pour la garniture facultative" },
      { name: "cassonade foncée", quantity: "2", unit: "c. à soupe", notes: "pour la garniture facultative" },
      { name: "cannelle", quantity: "1/2", unit: "c. à café", notes: "pour la garniture facultative" },
    ]);
    expect(seeded.translations.fr.subRecipes).toEqual([]);
    expect(seeded.translations.fr.sections.map(({ title }) => title)).toEqual([
      "Préparation",
      "Garniture croustillante aux noix (facultative)",
      "Cuisson",
      "Conservation",
    ]);

    expect(seeded.translations.en).toMatchObject({
      title: "Banana Bread",
      author: "Mary McHale",
      yieldLabel: "1 loaf",
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "white sugar", quantity: "150", unit: "g", notes: "" },
      { name: "butter", quantity: "115", unit: "g", notes: "melted" },
      { name: "very ripe bananas", quantity: "325 to 350", unit: "g", notes: "mashed, about 3 to 4 bananas depending on their size" },
      { name: "eggs", quantity: "2", unit: "", notes: "well beaten" },
      { name: "T45 flour", quantity: "150", unit: "g", notes: "" },
      { name: "baking soda", quantity: "1", unit: "tsp", notes: "" },
      { name: "salt", quantity: "3", unit: "g", notes: "" },
      { name: "chopped pecans", quantity: "40", unit: "g", notes: "" },
      { name: "cinnamon", quantity: "1", unit: "pinch", notes: "" },
      { name: "chopped pecans", quantity: "60", unit: "g", notes: "for the optional topping" },
      { name: "dark brown sugar", quantity: "2", unit: "tbsp", notes: "for the optional topping" },
      { name: "cinnamon", quantity: "1/2", unit: "tsp", notes: "for the optional topping" },
    ]);
    expect(seeded.translations.en.subRecipes).toEqual([]);
    expect(seeded.translations.en.sections.map(({ title }) => title)).toEqual([
      "Preparation",
      "Crunchy Pecan Topping (Optional)",
      "Baking",
      "Storage",
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Preheat the oven to 175 °C and lightly grease the loaf pan.",
      "Melt the butter in a saucepan over low heat, then let it cool slightly off the heat.",
      "While the butter melts, combine the flour, baking soda, salt and cinnamon in a first bowl. Ideally, sift this mixture.",
      "Mash the bananas with a fork.",
      "Pour the warm melted butter into a second, larger bowl. Add the sugar and whisk until smooth.",
      "Add the beaten eggs, then the mashed bananas, and mix until smooth.",
      "Add the contents of the first bowl to the large bowl and fold with a spatula just until no dry flour remains. Do not overmix.",
      "Fold in the chopped pecans.",
      "If making the topping: mix the topping pecans, dark brown sugar and cinnamon.",
      "Pour half the batter into the pan and sprinkle with half the pecan mixture.",
      "Add the remaining batter, sprinkle the rest of the mixture on top and press it in lightly.",
      "Without the topping, pour all the batter into the pan.",
      "Bake for 45 to 60 min, until the center is firm and a knife or toothpick inserted into it comes out clean or almost clean.",
      "Let cool in the pan for 10 min, then unmold onto a rack.",
      "This banana bread freezes very well.",
    ]);
  });

  test("localizes Louis's mayonnaise as a savory yield-only recipe", () => {
    const source = recipes.find((recipe) => recipe.slug === "mayonnaise");
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "mayonnaise",
      heroImageUrl: "https://images.unsplash.com/photo-1562114808-b4b33cf60f4f?auto=format&fit=crop&w=1400&q=85",
      categories: ["sale"],
      legacyCategoryLabels: [],
    });
    expect(seeded.referenceServings).toBeUndefined();

    expect(seeded.translations.fr).toMatchObject({
      title: "Mayonnaise",
      author: "Louis",
      yieldLabel: "Un petit bol",
      prepTime: "5 min",
      cookTime: "",
      totalTime: "5 min",
    });
    expect(
      seeded.translations.fr.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      {
        name: "moutarde de Dijon",
        quantity: "2",
        unit: "c. à café",
        notes: "",
      },
      { name: "jaune d’œuf", quantity: "1", unit: "", notes: "" },
      { name: "huile de tournesol", quantity: "10", unit: "cl", notes: "" },
      {
        name: "vinaigre balsamique",
        quantity: "quelques gouttes",
        unit: "",
        notes: "",
      },
      { name: "sel", quantity: "", unit: "", notes: "à convenance" },
      { name: "poivre", quantity: "", unit: "", notes: "à convenance" },
    ]);
    expect(seeded.translations.fr.notes).toEqual([
      "Pour une mayonnaise bien fraîche, la laisser reposer 30 min au réfrigérateur avant de servir.",
    ]);

    expect(seeded.translations.en).toMatchObject({
      title: "Mayonnaise",
      author: "Louis",
      description:
        "Homemade Dijon mustard mayonnaise blended with sunflower oil and seasoned with balsamic vinegar.",
      yieldLabel: "One small bowl",
      prepTime: "5 min",
      cookTime: "",
      totalTime: "5 min",
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "Dijon mustard", quantity: "2", unit: "tsp", notes: "" },
      { name: "egg yolk", quantity: "1", unit: "", notes: "" },
      { name: "sunflower oil", quantity: "10", unit: "cl", notes: "" },
      {
        name: "balsamic vinegar",
        quantity: "a few drops",
        unit: "",
        notes: "",
      },
      { name: "salt", quantity: "", unit: "", notes: "to taste" },
      { name: "pepper", quantity: "", unit: "", notes: "to taste" },
    ]);
    expect(
      seeded.translations.en.sections[0]?.steps.map(({ text }) => text),
    ).toEqual([
      "Place the Dijon mustard and egg yolk in the blender bowl, then blend.",
      "Keep blending while gradually pouring in the sunflower oil in a thin stream, until the mayonnaise is well emulsified.",
      "Add a few drops of balsamic vinegar, then season with salt and pepper to taste. Blend once more until smooth.",
    ]);
    expect(seeded.translations.en.notes).toEqual([
      "For a well-chilled mayonnaise, refrigerate it for 30 min before serving.",
    ]);
  });

  test("localizes Maman's apricot clafoutis for six people", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "clafoutis-aux-abricots",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "clafoutis-aux-abricots",
      categories: ["dessert", "sucre"],
      legacyCategoryLabels: [],
      referenceServings: 6,
    });
    expect(seeded.translations.fr).toMatchObject({
      title: "Clafoutis aux abricots",
      author: "Maman",
      yieldLabel: "6 personnes",
      cookTime: "35 à 40 min",
      temperature: "180 °C",
      equipment: ["1 plat à gratin ou 1 moule de 24 cm"],
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Apricot Clafoutis",
      author: "Maman",
      description:
        "Soft, lightly browned apricot clafoutis made with almond flour.",
      yieldLabel: "6 people",
      cookTime: "35 to 40 min",
      temperature: "180 °C",
      equipment: ["1 baking dish or 1 24 cm round pan"],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "apricots", quantity: "500 to 600", unit: "g", notes: "" },
      { name: "eggs", quantity: "3", unit: "", notes: "" },
      { name: "sugar", quantity: "80", unit: "g", notes: "" },
      { name: "flour", quantity: "60", unit: "g", notes: "" },
      { name: "almond flour", quantity: "40", unit: "g", notes: "" },
      {
        name: "semi-skimmed milk",
        quantity: "250",
        unit: "ml",
        notes: "",
      },
      {
        name: "vanilla extract",
        quantity: "1",
        unit: "tsp",
        notes: "or the seeds from half a vanilla bean",
      },
      { name: "salt", quantity: "1", unit: "pinch", notes: "" },
      {
        name: "butter",
        quantity: "20",
        unit: "g",
        notes: "for the pan, or use a little oil",
      },
      {
        name: "brown sugar",
        quantity: "1",
        unit: "tbsp",
        notes: "optional, to lightly caramelize the top",
      },
      {
        name: "sliced almonds",
        quantity: "a few",
        unit: "",
        notes: "optional",
      },
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Preheat the oven to 180 °C.",
      "Butter a baking dish or a pan about 24 cm in diameter.",
      "Wash the apricots, halve and pit them. Arrange them in the dish, cut side up.",
      "Whisk the eggs with the sugar until evenly combined.",
      "Add the flour, almond flour and pinch of salt.",
      "Gradually pour in the milk while whisking until the batter is smooth, then add the vanilla.",
      "Pour the batter over the apricots.",
      "For a lightly caramelized top, sprinkle with brown sugar and, if desired, a few sliced almonds.",
      "Bake for 35 to 40 min, until the top is golden brown and the center is just set.",
      "Let cool for 15 to 20 min before serving. The clafoutis is excellent warm or chilled for a few hours in the refrigerator.",
    ]);
  });

  test("localizes Maman's bolognese sauce with its project image", () => {
    const source = recipes.find((recipe) => recipe.slug === "sauce-bolognaise");
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "sauce-bolognaise",
      heroImageUrl: "https://images.unsplash.com/photo-1600803734709-83f30a78e312?auto=format&fit=crop&w=1400&q=85",
      relatedRecipeSlugs: ["lasagnes"],
      categories: ["plat", "sale"],
      legacyCategoryLabels: [],
    });
    expect(seeded.referenceServings).toBe(6);
    expect(seeded.translations.fr).toMatchObject({
      title: "Sauce bolognaise",
      author: "Maman",
      cookTime: "40 min",
      temperature: "feu doux",
      equipment: ["1 poêle"],
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Bolognese Sauce",
      author: "Maman",
      cookTime: "40 min",
      temperature: "low heat",
      equipment: ["1 frying pan"],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "ground beef", quantity: "500", unit: "g", notes: "" },
      { name: "ham", quantity: "2", unit: "slices", notes: "" },
      { name: "canned tomato pulp", quantity: "400", unit: "g", notes: "" },
      { name: "tomato purée", quantity: "200", unit: "g", notes: "" },
      { name: "onion", quantity: "1", unit: "", notes: "" },
      { name: "garlic", quantity: "1", unit: "clove", notes: "" },
      { name: "parsley", quantity: "1", unit: "bunch", notes: "" },
      { name: "carrot", quantity: "1", unit: "", notes: "optional" },
      { name: "Herbes de Provence", quantity: "", unit: "", notes: "" },
      { name: "salt", quantity: "", unit: "", notes: "to taste" },
      { name: "pepper", quantity: "", unit: "", notes: "to taste" },
      { name: "olive oil", quantity: "1", unit: "tbsp", notes: "" },
    ]);
    expect(
      seeded.translations.en.sections[0]?.steps.map(({ text }) => text),
    ).toEqual([
      "Peel the garlic and onion.",
      "Heat a little oil in a frying pan. Add the onion, garlic and chopped parsley along with the carrot cut into very small dice, then cook gently over low heat.",
      "Add the ground beef and ham, then brown for about 10 minutes.",
      "Add the tomato pulp and tomato purée.",
      "Season with salt and pepper, then add the Herbes de Provence.",
      "Simmer partially covered for about 30 minutes.",
    ]);
    for (const locale of ["fr", "en"] as const) {
      const steps = seeded.translations[locale].sections[0]!.steps;
      expect(steps[3]!.ingredientUses).toEqual([
        { ingredientId: "ingredient-main-2" },
        { ingredientId: "ingredient-main-3" },
      ]);
      expect(steps[4]!.ingredientUses).toEqual([
        { ingredientId: "ingredient-main-8" },
        { ingredientId: "ingredient-main-9" },
        { ingredientId: "ingredient-main-10" },
      ]);
    }
    expect(seeded.translations.en.notes).toEqual([
      "This sauce can notably be used to make lasagna.",
    ]);
  });

  test("localizes Maman's classic and vegetarian lasagna recipes", () => {
    const classic = recipes.find((recipe) => recipe.slug === "lasagnes");
    const vegetarian = recipes.find(
      (recipe) => recipe.slug === "lasagnes-vegetariennes",
    );
    expect(classic).toBeDefined();
    expect(vegetarian).toBeDefined();

    const seededClassic = classic!;
    expect(seededClassic).toMatchObject({
      slug: "lasagnes",
      heroImageUrl: "https://images.unsplash.com/photo-1709429790175-b02bb1b19207?auto=format&fit=crop&w=1400&q=85",
      relatedRecipeSlugs: ["bechamel", "sauce-bolognaise", "lasagnes-vegetariennes"],
      categories: ["plat", "sale"],
    });
    expect(seededClassic.translations.en).toMatchObject({
      title: "Lasagna",
      description:
        "Family-style lasagna with Bolognese sauce, béchamel and grated cheeses.",
      yieldLabel: "1 dish",
      cookTime: "30 min",
      temperature: "200 °C",
      equipment: ["1 baking dish"],
    });
    expect(
      seededClassic.translations.en.ingredients.map(({ name }) => name),
    ).toEqual([
      "béchamel",
      "Bolognese sauce",
      "lasagna sheets",
      "grated Gruyère",
      "grated parmesan",
    ]);

    const seededVegetarian = vegetarian!;
    expect(seededVegetarian).toMatchObject({
      slug: "lasagnes-vegetariennes",
      heroImageUrl: "https://images.unsplash.com/photo-1586197138382-e1d1479fbb14?auto=format&fit=crop&w=1400&q=85",
      relatedRecipeSlugs: ["bechamel", "lasagnes"],
      categories: ["plat", "sale"],
    });
    expect(seededVegetarian.translations.en).toMatchObject({
      title: "Vegetarian Lasagna",
      description:
        "Vegetarian lasagna with ratatouille, béchamel and grated cheeses.",
      yieldLabel: "1 dish",
    });
    expect(
      seededVegetarian.translations.en.sections[0]?.steps.map(
        ({ text }) => text,
      ),
    ).toContain(
      "Use a ratatouille that is not too liquid so the lasagna holds together well.",
    );
  });

  test("localizes Maman's lentil salad for four people", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "salade-de-lentilles",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "salade-de-lentilles",
      heroImageUrl: "https://images.unsplash.com/photo-1702650657375-934239d8b472?auto=format&fit=crop&w=1400&q=85",
      categories: ["plat", "sale"],
      legacyCategoryLabels: [],
      referenceServings: 4,
    });
    expect(seeded.translations.fr).toMatchObject({
      title: "Salade de lentilles",
      author: "Maman",
      yieldLabel: "4 personnes",
      prepTime: "15 min",
      cookTime: "20 min",
      totalTime: "35 min",
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Lentil Salad",
      author: "Maman",
      description:
        "Green lentil salad with cherry tomatoes, feta, red onion and parsley, dressed with a lemon vinaigrette.",
      yieldLabel: "4 people",
      equipment: ["1 saucepan", "1 small bowl", "1 salad bowl"],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      {
        name: "lemon",
        quantity: "1/2",
        unit: "",
        notes: "juice and zest",
      },
      { name: "olive oil", quantity: "60", unit: "ml", notes: "" },
      {
        name: "garlic",
        quantity: "1/2",
        unit: "clove",
        notes: "minced",
      },
      { name: "oregano", quantity: "1/2", unit: "tbsp", notes: "" },
      { name: "green lentils", quantity: "320", unit: "g", notes: "" },
      {
        name: "red onion",
        quantity: "1/2",
        unit: "",
        notes: "thinly sliced",
      },
      {
        name: "cherry tomatoes",
        quantity: "200",
        unit: "g",
        notes: "cut into very small pieces",
      },
      {
        name: "parsley",
        quantity: "4",
        unit: "tbsp",
        notes: "chopped",
      },
      { name: "feta", quantity: "80", unit: "g", notes: "crumbled" },
      { name: "salt", quantity: "", unit: "", notes: "to taste" },
      { name: "pepper", quantity: "", unit: "", notes: "to taste" },
    ]);
    expect(
      seeded.translations.en.sections[0]?.steps.map(({ text }) => text),
    ).toEqual([
      "Cook the lentils according to the package directions. Drain, rinse and leave to cool.",
      "Meanwhile, make the vinaigrette: in a small bowl, whisk the juice and zest of half a lemon with the olive oil, garlic, oregano, salt and pepper. Set aside.",
      "Cut the cherry tomatoes into very small pieces. In a salad bowl, combine them with the lentils, parsley, red onion and feta. Add the vinaigrette and toss gently.",
    ]);
    expect(seeded.translations.en.notes).toEqual([
      "Add the lemon juice sparingly: too much could overpower the flavors of the other ingredients.",
      "For my usual version, I replace the lemon vinaigrette with balsamic vinegar, olive oil and salt.",
      "I add 2 eggs and sometimes, depending on what I have on hand, a few cubes of zucchini, cucumber and/or carrot, cut into very small pieces.",
    ]);
  });

  test("localizes Maman's walnut brownies from the handwritten recipe", () => {
    const source = recipes.find((recipe) => recipe.slug === "brownies");
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "brownies",
      categories: ["dessert", "sucre"],
      legacyCategoryLabels: [],
    });
    expect(seeded.referenceServings).toBeUndefined();
    expect(seeded.translations.fr).toMatchObject({
      title: "Brownies",
      author: "Maman",
      cookTime: "20 min",
      restTime: "2 h 35",
      temperature: "180 °C",
      equipment: [
        "1 moule rectangulaire de 25 × 18 cm ou 1 moule carré équivalent",
        "papier sulfurisé",
      ],
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Brownies",
      author: "Maman",
      description:
        "Dark chocolate and walnut brownies with a soft, fudgy center.",
      cookTime: "20 min",
      restTime: "2 h 35",
      temperature: "180 °C",
      equipment: [
        "1 rectangular 25 × 18 cm baking pan or equivalent square pan",
        "parchment paper",
      ],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "dark chocolate", quantity: "250", unit: "g", notes: "" },
      { name: "sugar", quantity: "150", unit: "g", notes: "" },
      { name: "butter", quantity: "150", unit: "g", notes: "" },
      { name: "vanilla sugar", quantity: "1", unit: "packet", notes: "" },
      { name: "flour", quantity: "60", unit: "g", notes: "sifted" },
      { name: "eggs", quantity: "3", unit: "", notes: "" },
      { name: "salt", quantity: "1", unit: "pinch", notes: "" },
      { name: "walnuts", quantity: "60", unit: "g", notes: "" },
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Preheat the oven to 180 °C and line the baking pan with parchment paper.",
      "Melt the dark chocolate with the butter.",
      "Add the sugar and vanilla sugar, then mix.",
      "Beat the eggs with the pinch of salt, then fold them into the chocolate mixture.",
      "Add the sifted flour and walnuts, then mix until combined.",
      "Pour the batter into the pan and bake for 20 min at 180 °C.",
      "After baking, leave the brownies in the switched-off oven for 5 min.",
      "Remove from the oven and leave to cool for 30 min.",
      "Refrigerate for 2 h, then unmold.",
    ]);
  });

  test("localizes Maman's cod parcels and Polish butter sauce", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "papillotes-de-cabillaud",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "papillotes-de-cabillaud",
      categories: ["plat", "sale"],
      legacyCategoryLabels: [],
    });
    expect(seeded.referenceServings).toBeUndefined();
    expect(seeded.translations.fr).toMatchObject({
      title: "Papillotes de cabillaud",
      author: "Maman",
      cookTime: "30 min",
      temperature: "180 °C",
      equipment: ["papier sulfurisé", "agrafeuse", "saucier SEB", "fourchette"],
    });
    expect(seeded.translations.fr.ingredients[1]?.unit).toBe("c. à café");
    expect(seeded.translations.fr.ingredients[7]?.unit).toBe("c. à café");
    expect(seeded.translations.en).toMatchObject({
      title: "Cod Parcels",
      author: "Maman",
      description:
        "Oven-baked cod parcels with lemon and herbs, served with Polish-style butter sauce.",
      cookTime: "30 min",
      temperature: "180 °C",
      equipment: ["parchment paper", "stapler", "SEB sauce maker", "fork"],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "cod", quantity: "", unit: "", notes: "quantity not specified" },
      {
        name: "lemon juice",
        quantity: "1",
        unit: "tsp",
        notes: "for the parcels",
      },
      {
        name: "olive oil",
        quantity: "1",
        unit: "tsp",
        notes: "for the parcels",
      },
      { name: "salt", quantity: "", unit: "", notes: "to taste" },
      { name: "pepper", quantity: "", unit: "", notes: "to taste" },
      {
        name: "parsley or cilantro",
        quantity: "",
        unit: "",
        notes: "to taste",
      },
      { name: "hard-boiled egg", quantity: "1", unit: "", notes: "" },
      { name: "mustard", quantity: "1", unit: "tsp", notes: "" },
      { name: "butter", quantity: "100", unit: "g", notes: "" },
      {
        name: "lemon juice",
        quantity: "1",
        unit: "tbsp",
        notes: "for the sauce",
      },
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Preheat the oven to 180 °C.",
      "Place the cod on parchment paper. Add 1 tsp lemon juice and 1 tsp olive oil, then season with salt, pepper and parsley or cilantro.",
      "Close the parcel with the stapler, keeping the staples away from the food.",
      "Bake for 30 min at 180 °C.",
      "Mash the hard-boiled egg very finely with a fork.",
      "Place it in the SEB sauce maker with the salt, pepper, mustard and 1 tbsp lemon juice.",
      "Set the SEB sauce maker to position 2 for gentle cooking, then gradually add the butter in small pieces.",
      "Leave the SEB sauce maker running for 12 min, then serve the sauce with the cod parcels.",
    ]);
    expect(seeded.translations.en.notes).toEqual([
      "The handwritten recipe does not specify the amount of cod.",
      "The sauce makes about 1 bowl.",
    ]);
  });

  test("seeds Marmiton-style metadata and structured recipe links", () => {
    const source = recipes.find((recipe) => recipe.slug === "pain-de-poisson");
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded.relatedRecipeSlugs).toEqual(["mayonnaise"]);
    expect(seeded.translations.fr).toMatchObject({
      restTime: "Jusqu’à complet refroidissement",
      equipment: ["1 moule à cake", "1 plat pour bain-marie", "1 robot mixeur"],
    });
    expect(seeded.translations.en).toMatchObject({
      restTime: "Until completely cool",
      equipment: ["1 loaf pan", "1 roasting dish for the water bath", "1 food processor"],
    });
  });

  test("localizes Maman's pasta carbonara for two people", () => {
    const source = recipes.find((recipe) => recipe.slug === "pates-carbonara");
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "pates-carbonara",
      heroImageUrl: "https://images.unsplash.com/photo-1633337474564-1d9478ca4e2e?auto=format&fit=crop&w=1400&q=85",
      categories: ["plat", "sale"],
      legacyCategoryLabels: [],
      referenceServings: 2,
    });
    expect(seeded.translations.fr).toMatchObject({
      title: "Pâtes carbonara",
      author: "Antoine",
      prepTime: "5 min",
      cookTime: "15 min",
      totalTime: "20 min",
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Pasta Carbonara",
      author: "Antoine",
      description:
        "Family-style pasta carbonara with whole eggs, parmesan and smoked bacon, loosened with a little pasta cooking water if needed.",
      equipment: ["1 large saucepan", "1 frying pan", "1 bowl", "1 glass"],
    });
    expect(
      seeded.translations.en.ingredients.map(
        ({ id: _id, ...ingredient }) => ingredient,
      ),
    ).toEqual([
      { name: "spaghetti", quantity: "250", unit: "g", notes: "" },
      {
        name: "smoked bacon lardons",
        quantity: "125",
        unit: "g",
        notes: "",
      },
      {
        name: "eggs",
        quantity: "2",
        unit: "",
        notes: "whole, without separating the whites and yolks",
      },
      {
        name: "grated parmesan",
        quantity: "50",
        unit: "g",
        notes: "plus extra for serving",
      },
      {
        name: "pasta cooking water",
        quantity: "a little",
        unit: "",
        notes: "reserve in case the sauce is too dry",
      },
      { name: "salt", quantity: "", unit: "", notes: "to taste" },
      { name: "pepper", quantity: "", unit: "", notes: "to taste" },
    ]);
    expect(
      seeded.translations.en.sections.flatMap(({ steps }) =>
        steps.map(({ text }) => text),
      ),
    ).toEqual([
      "Cook the pasta in a large saucepan of salted boiling water according to the package directions.",
      "Meanwhile, brown the smoked bacon lardons in a frying pan.",
      "In a bowl, beat the whole eggs with the parmesan and pepper. Add only a little salt, as the smoked bacon and parmesan are already salty.",
      "Before draining the pasta, reserve a glass of cooking water. Drain the pasta without drying it out, then return it to the hot saucepan off the heat.",
      "Immediately add the smoked bacon, then pour in the egg and parmesan mixture. Stir continuously so the residual heat coats the pasta without scrambling the eggs.",
      "If the sauce is too dry, add a little reserved cooking water. Serve immediately with extra parmesan and pepper.",
    ]);
  });

  test("localizes Alexia's sun-dried tomato and feta loaf for six people", () => {
    const source = recipes.find(
      (recipe) => recipe.slug === "cake-aux-tomates-sechees-et-a-la-feta",
    );
    expect(source).toBeDefined();

    const seeded = source!;
    expect(seeded).toMatchObject({
      slug: "cake-aux-tomates-sechees-et-a-la-feta",
      heroImageUrl: "https://images.unsplash.com/photo-1624144043330-82dcf58bf8ec?auto=format&fit=crop&w=1400&q=85",
      categories: ["sale"],
      legacyCategoryLabels: [],
      referenceServings: 6,
    });
    expect(seeded.translations.fr).toMatchObject({
      title: "Cake aux tomates séchées et à la feta",
      author: "Alexia",
      prepTime: "15 min",
      cookTime: "40 min",
      totalTime: "55 min",
      temperature: "180 °C",
      equipment: ["1 saladier", "1 moule à cake"],
    });
    expect(seeded.translations.en).toMatchObject({
      title: "Sun-Dried Tomato and Feta Loaf",
      author: "Alexia",
      description:
        "Moist savory loaf with sun-dried tomatoes, feta, basil and Gruyère.",
      equipment: ["1 salad bowl", "1 loaf pan"],
    });
    expect(seeded.translations.en.ingredients[1]).toMatchObject({
      name: "oil",
      quantity: "6",
      unit: "cl",
      notes:
        "preferably oil from the sun-dried tomato jar, otherwise olive oil",
    });
    expect(seeded.translations.en.notes).toEqual([
      "For the oil, preferably use the oil from the sun-dried tomato jar; otherwise, use olive oil.",
    ]);
  });
});
