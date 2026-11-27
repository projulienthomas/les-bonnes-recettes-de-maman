import Link from "next/link";
import { Pencil } from "lucide-react";
import type { Locale } from "@/i18n/config";

const editLabels: Record<Locale, string> = {
  fr: "Éditer",
  en: "Edit",
  "pt-br": "Editar",
  "nl-be": "Bewerken",
};

type EditRecipeAccessProps = {
  locale: Locale;
  slug: string;
};

export function EditRecipeAccess({
  locale,
  slug,
}: EditRecipeAccessProps) {
  const adminHref = `/${locale}/admin/recettes?slug=${encodeURIComponent(slug)}`;

  return (
    // Every visitor sees this link; only the admin follows it, so do not
    // make the public page fetch the admin route in the background.
    <Link
      href={adminHref}
      prefetch={false}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-[scale,background-color,color] duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] md:min-h-10"
    >
      <Pencil className="size-4 stroke-[1.8]" />
      {editLabels[locale]}
    </Link>
  );
}
