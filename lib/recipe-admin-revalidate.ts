import "server-only";

import { revalidatePath } from "next/cache";
import { locales } from "@/i18n/config";

export function revalidateRecipePaths(slug: string) {
  for (const locale of locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/recettes`);
    revalidatePath(`/${locale}/recettes/${slug}`);
    revalidatePath(`/${locale}/recettes/${slug}/cuisiner`);
    revalidatePath(`/${locale}/admin/recettes`);
  }
}
