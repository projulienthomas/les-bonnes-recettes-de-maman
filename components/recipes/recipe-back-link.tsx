"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  getRememberedRecipeListUrl,
  registerRecipePageVisit,
} from "@/lib/recipe-list-return";

/**
 * Returns to the recipe list as the visitor left it. Arriving from the list in
 * this session, it goes back in history (search, filters and scroll restored);
 * otherwise it is a plain link, which also works without JavaScript.
 */
export function RecipeBackLink({
  locale,
  slug,
  label,
  className,
}: {
  locale: string;
  slug: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const arrivedFromList = useRef<boolean | null>(null);
  const [href, setHref] = useState(`/${locale}#recettes`);

  useEffect(() => {
    arrivedFromList.current ??= registerRecipePageVisit(slug);
    const listUrl = getRememberedRecipeListUrl(locale);
    // Known only in the browser: the server renders the plain list link.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (listUrl) setHref(`${listUrl}#recettes`);
  }, [locale, slug]);

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (
      !arrivedFromList.current ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    router.back();
  }

  return (
    <Link href={href} onClick={goBack} className={className}>
      <ChevronLeft aria-hidden className="size-5" />
      {label}
    </Link>
  );
}
