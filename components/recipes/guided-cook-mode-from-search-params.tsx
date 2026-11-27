"use client";

import { Suspense, useState, type ComponentProps } from "react";
import { GuidedCookMode } from "./guided-cook-mode";
import { ServingsFromSearchParams } from "./servings-from-search-params";

type Props = Omit<ComponentProps<typeof GuidedCookMode>, "selectedServings">;

// Cook mode is prerendered, so `?personnes=` is only known in the browser: the
// static HTML holds the reference servings and the quantities follow the URL
// once hydrated.
export function GuidedCookModeFromSearchParams(props: Props) {
  const [selectedServings, setSelectedServings] = useState<number>();

  return (
    <>
      <GuidedCookMode {...props} selectedServings={selectedServings} />
      <Suspense fallback={null}>
        <ServingsFromSearchParams
          referenceServings={props.recipe.referenceServings}
          onServingsChange={setSelectedServings}
        />
      </Suspense>
    </>
  );
}
