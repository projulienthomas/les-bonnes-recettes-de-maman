import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { locales } from "@/i18n/config";

/** Tags the cached list of published recipes read by the home page. */
export const publishedRecipesTag = "published-recipes";

export function revalidateRecipePaths(slug: string) {
  // The admin must see its own save at once, not a stale list.
  revalidateTag(publishedRecipesTag, { expire: 0 });
  for (const locale of locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/recettes`);
    revalidatePath(`/${locale}/recettes/${slug}`);
    revalidatePath(`/${locale}/recettes/${slug}/cuisiner`);
    revalidatePath(`/${locale}/admin/recettes`);
  }
}
