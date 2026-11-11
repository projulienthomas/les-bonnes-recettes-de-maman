/**
 * Geometry of the recipe shelf: how thick and tall each spine is, where the
 * track sits so a given book is centred, and which book a drag lands on.
 * Pure functions, so the shelf component only has to animate the results.
 */

export const SPINE_GAP_PX = 4;
/** Breathing room on each side of the book that is out of the shelf. */
export const OPEN_GAP_PX = 20;
export const SPINE_TONE_COUNT = 6;

const SPINE_MIN_WIDTH_PX = 40;
const SPINE_WIDTH_RANGE_PX = 22;
/** A recipe this short gets the thinnest spine; this long, the thickest. */
const SHORT_RECIPE_LENGTH = 3;
const LONG_RECIPE_LENGTH = 14;
const SPINE_HEIGHT_STEPS = 5;
const SPINE_HEIGHT_STEP_PX = 6;
const SPINE_TOP_MARGIN_PX = 8;

export type SpineMetrics = {
  width: number;
  height: number;
  /** Index into the spine palette, stable for a given recipe. */
  tone: number;
};

export function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * A book's look depends only on its recipe: the slug picks colour and height,
 * the recipe's length (steps, or ingredients as a fallback) its thickness.
 */
export function getSpineMetrics({
  slug,
  length,
  bookHeight,
}: {
  slug: string;
  length: number;
  bookHeight: number;
}): SpineMetrics {
  const hash = hashString(slug);
  const thickness = Math.min(
    1,
    Math.max(0, (length - SHORT_RECIPE_LENGTH) / (LONG_RECIPE_LENGTH - SHORT_RECIPE_LENGTH)),
  );
  return {
    width: Math.round(SPINE_MIN_WIDTH_PX + thickness * SPINE_WIDTH_RANGE_PX),
    height:
      bookHeight - SPINE_TOP_MARGIN_PX - (hash % SPINE_HEIGHT_STEPS) * SPINE_HEIGHT_STEP_PX,
    tone: hash % SPINE_TONE_COUNT,
  };
}

export type ShelfTrack = {
  slotWidths: number[];
  /** Gap after each slot; the last slot has none. */
  gaps: number[];
  /** Centre of each slot, measured from the start of the track. */
  centres: number[];
};

/**
 * Lays the books out in a row. Slots listed in `wide` hold a book that is out
 * of the shelf: they take `wideWidth` and push their neighbours a little away.
 */
export function layoutShelf({
  spineWidths,
  wide = [],
  wideWidth = 0,
}: {
  spineWidths: readonly number[];
  wide?: readonly number[];
  wideWidth?: number;
}): ShelfTrack {
  const isWide = (index: number) => wide.includes(index);
  const slotWidths = spineWidths.map((width, index) => (isWide(index) ? wideWidth : width));
  const gaps = spineWidths.map((_, index) => {
    if (index === spineWidths.length - 1) return 0;
    return isWide(index) || isWide(index + 1) ? OPEN_GAP_PX : SPINE_GAP_PX;
  });
  const centres: number[] = [];
  let start = 0;
  for (let index = 0; index < slotWidths.length; index += 1) {
    centres.push(start + slotWidths[index] / 2);
    start += slotWidths[index] + gaps[index];
  }
  return { slotWidths, gaps, centres };
}

/**
 * Track offset that centres a slot. The track starts at the middle of the
 * viewport, so it only has to move back by the slot's centre.
 */
export function trackOffsetFor(track: ShelfTrack, index: number) {
  return -(track.centres[index] ?? 0);
}

/** The book whose centre is closest to the middle of the viewport. */
export function nearestBook(track: ShelfTrack, offset: number) {
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < track.centres.length; index += 1) {
    const candidate = Math.abs(track.centres[index] + offset);
    if (candidate < distance) {
      distance = candidate;
      nearest = index;
    }
  }
  return nearest;
}

/**
 * Keeps a dragged track within the first and last book. Past either end the
 * shelf still moves, but only by a fraction of the finger's travel.
 */
export function resistPastEnds(track: ShelfTrack, offset: number, resistance: number) {
  if (track.centres.length === 0) return offset;
  const max = trackOffsetFor(track, 0);
  const min = trackOffsetFor(track, track.centres.length - 1);
  if (offset > max) return max + (offset - max) * resistance;
  if (offset < min) return min + (offset - min) * resistance;
  return offset;
}

/** How many extra books a flick carries the shelf, from its release velocity. */
export function flickSteps(
  velocityPxPerMs: number,
  { threshold = 0.5, booksPerUnit = 4, max = 6 } = {},
) {
  if (Math.abs(velocityPxPerMs) <= threshold) return 0;
  // A finger moving left (negative velocity) browses forward.
  const steps = Math.round(-velocityPxPerMs * booksPerUnit);
  return Math.max(-max, Math.min(max, steps));
}
