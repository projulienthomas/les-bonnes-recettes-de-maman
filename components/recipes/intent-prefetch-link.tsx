"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A Link that prefetches once the visitor shows intent (pointer over it,
 * finger down, keyboard focus) instead of when it scrolls into view. Recipe
 * pages are static, so the default would prefetch every card the visitor
 * scrolls past: about 1 MB for the full list. Intent still leaves 100–300 ms
 * before the click, enough for a cached static page.
 */
export function IntentPrefetchLink({
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);

  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
    />
  );
}
