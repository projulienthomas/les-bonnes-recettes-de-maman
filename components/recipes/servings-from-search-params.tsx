"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  parseSelectedServings,
  resolveSelectedServings,
} from "@/lib/recipe-servings";

// Recipe pages are prerendered, so `?personnes=` is only known in the browser.
// The page renders the reference servings first, then this applies the URL
// value after hydration: only the quantities change, nothing else remounts.
// Without the parameter it leaves the state alone: this effect can run late on
// a slow device, after the reader already changed the servings.
// Render it inside <Suspense>: useSearchParams bails out of prerendering up to
// the nearest boundary.
export function ServingsFromSearchParams({
  referenceServings,
  onServingsChange,
}: {
  referenceServings: number | undefined;
  onServingsChange: (servings: number | undefined) => void;
}) {
  const requested =
    parseSelectedServings(useSearchParams().get("personnes") ?? undefined) ??
    undefined;

  useEffect(() => {
    if (requested === undefined) return;
    onServingsChange(resolveSelectedServings(referenceServings, requested));
  }, [referenceServings, requested, onServingsChange]);

  return null;
}
