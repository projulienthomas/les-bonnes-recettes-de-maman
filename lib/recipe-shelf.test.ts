import { describe, expect, it } from "vitest";
import {
  OPEN_GAP_PX,
  SPINE_GAP_PX,
  SPINE_TONE_COUNT,
  flickSteps,
  getSpineMetrics,
  layoutShelf,
  nearestBook,
  resistPastEnds,
  trackOffsetFor,
} from "./recipe-shelf";

describe("getSpineMetrics", () => {
  it("gives a recipe the same look every time", () => {
    const first = getSpineMetrics({ slug: "amandin", length: 7, bookHeight: 352 });
    const second = getSpineMetrics({ slug: "amandin", length: 7, bookHeight: 352 });
    expect(second).toEqual(first);
  });

  it("makes longer recipes thicker, within bounds", () => {
    const short = getSpineMetrics({ slug: "a", length: 1, bookHeight: 352 });
    const medium = getSpineMetrics({ slug: "a", length: 8, bookHeight: 352 });
    const long = getSpineMetrics({ slug: "a", length: 40, bookHeight: 352 });
    expect(short.width).toBe(40);
    expect(long.width).toBe(62);
    expect(medium.width).toBeGreaterThan(short.width);
    expect(medium.width).toBeLessThan(long.width);
  });

  it("keeps every book shorter than the shelf and tall enough for its pages", () => {
    for (const slug of ["amandin", "tiramisu", "far-breton", "pot-au-feu", "quiche", "x"]) {
      const { height, tone } = getSpineMetrics({ slug, length: 5, bookHeight: 352 });
      expect(height).toBeLessThan(352);
      expect(height).toBeGreaterThanOrEqual(320);
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(SPINE_TONE_COUNT);
    }
  });
});

describe("layoutShelf", () => {
  const spineWidths = [40, 50, 60];

  it("lines closed books up with a small gap", () => {
    const track = layoutShelf({ spineWidths });
    expect(track.slotWidths).toEqual([40, 50, 60]);
    expect(track.gaps).toEqual([SPINE_GAP_PX, SPINE_GAP_PX, 0]);
    expect(track.centres).toEqual([20, 40 + 4 + 25, 40 + 4 + 50 + 4 + 30]);
  });

  it("widens the slot of the book that is out and gives it room", () => {
    const track = layoutShelf({ spineWidths, wide: [1], wideWidth: 300 });
    expect(track.slotWidths).toEqual([40, 300, 60]);
    expect(track.gaps).toEqual([OPEN_GAP_PX, OPEN_GAP_PX, 0]);
    expect(track.centres[1]).toBe(40 + OPEN_GAP_PX + 150);
  });

  it("centres a book by moving the track back by its centre", () => {
    const track = layoutShelf({ spineWidths });
    expect(trackOffsetFor(track, 0)).toBe(-20);
    expect(trackOffsetFor(track, 2)).toBe(-128);
  });
});

describe("dragging", () => {
  const track = layoutShelf({ spineWidths: [40, 50, 60, 40] });

  it("lands on the book nearest the middle", () => {
    expect(nearestBook(track, trackOffsetFor(track, 2))).toBe(2);
    expect(nearestBook(track, trackOffsetFor(track, 2) + 10)).toBe(2);
    // Half a slot further back, the previous book is closer.
    expect(nearestBook(track, trackOffsetFor(track, 1) - 5)).toBe(1);
    expect(nearestBook(track, 500)).toBe(0);
    expect(nearestBook(track, -5000)).toBe(3);
  });

  it("follows the finger exactly between the first and last book", () => {
    const inside = trackOffsetFor(track, 1) - 12;
    expect(resistPastEnds(track, inside, 0.3)).toBe(inside);
  });

  it("gives way reluctantly past either end", () => {
    const first = trackOffsetFor(track, 0);
    const last = trackOffsetFor(track, 3);
    expect(resistPastEnds(track, first + 100, 0.3)).toBeCloseTo(first + 30);
    expect(resistPastEnds(track, last - 100, 0.3)).toBeCloseTo(last - 30);
  });

  it("turns a quick flick into a few more books, in the finger's direction", () => {
    expect(flickSteps(0.2)).toBe(0);
    expect(flickSteps(-1)).toBe(4);
    expect(flickSteps(1)).toBe(-4);
    expect(flickSteps(-10)).toBe(6);
  });
});
