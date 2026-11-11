"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  CakeSlice,
  Candy,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CookingPot,
  Salad,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import type { RecipeCategory } from "@/lib/recipe-categories";
import { cn } from "@/lib/utils";
import { formatRecipeByline } from "@/lib/recipe-author";
import {
  flickSteps,
  getSpineMetrics,
  layoutShelf,
  nearestBook,
  resistPastEnds,
  trackOffsetFor,
} from "@/lib/recipe-shelf";
import { Button, buttonVariants } from "@/components/ui/button";
import type { RecipeSummary } from "./types";
import styles from "./recipe-shelf.module.css";

const defaultRecipeImageUrl =
  "https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=1400&q=85";

/** How long the shelf must stay still before the centred book comes out (wheel, keyboard). */
const SETTLE_DELAY_MS = 280;
/** After a click, the next book comes out once the books have slid into place. */
const OPEN_AFTER_SLIDE_MS = 460;
const WHEEL_STEP_PX = 60;
const DRAG_THRESHOLD_PX = 10;
const EDGE_RESISTANCE = 0.3;
/** A release only counts as a flick if the finger was still moving this recently. */
const FLICK_WINDOW_MS = 80;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** How the row of books moves: not at all, briskly for the keyboard, or at reading pace. */
const SLIDES = {
  none: { duration: 0 },
  quick: { duration: 0.22, ease: EASE_OUT },
  slide: { duration: 0.42, ease: [0.32, 0.72, 0, 1] },
} as const;

// The active book is one volume that turns on itself, spine to front cover.
// Arriving: it rises off the shelf, then turns (then opens, on a wide screen).
// Leaving, in order: it closes, turns back onto its spine, drops onto the
// shelf, and only then do the books slide to bring the next one to the centre.
const RISE_S = 0.16;
const TURN_IN_S = 0.45;
const COVER_OPEN_S = 0.4;
const COVER_CLOSE_S = 0.3;
const TURN_OUT_S = 0.38;
const DROP_S = 0.2;
/** The turn starts a little before the rise has finished. */
const TURN_IN_DELAY_S = RISE_S * 0.6;
/** The centred spine stands slightly proud of its neighbours. */
const ACTIVE_SPINE_LIFT_PX = -6;
const MOBILE_LIFT_PX = -18;
const DESKTOP_LIFT_PX = -12;
/** How long the shelf holds still while the book that is out puts itself away. */
const closeDurationMs = (mobile: boolean) =>
  Math.round(((mobile ? 0 : COVER_CLOSE_S) + TURN_OUT_S + DROP_S) * 1000);

const toneClasses = [
  styles.tone0,
  styles.tone1,
  styles.tone2,
  styles.tone3,
  styles.tone4,
  styles.tone5,
];

const categoryIcons: Record<RecipeCategory, LucideIcon> = {
  dessert: CakeSlice,
  plat: CookingPot,
  sucre: Candy,
  sale: Salad,
};

/** How the last move happened: it decides how much ceremony the books get. */
type MoveSource = "initial" | "pointer" | "drag" | "keyboard";

type ShelfLayout = {
  mobile: boolean;
  pageWidth: number;
  bookHeight: number;
  /** Width of the slot of the book that is out: a cover on a phone, a spread otherwise. */
  openWidth: number;
};

const desktopLayout: ShelfLayout = {
  mobile: false,
  pageWidth: 256,
  bookHeight: 352,
  openWidth: 512,
};

type SpineInfo = {
  width: number;
  height: number;
  toneClass: string;
};

type DragState = {
  pointerId: number;
  dragging: boolean;
  /** Pointer position the drag distance is measured from. */
  originX: number;
  /** Track position at the start, as if every book were already closed. */
  closedStart: number;
  /** How far the track must shift while the slot of the book that was out collapses. */
  collapse: number;
  /** Where the finger has put the track, in the all-closed layout. */
  position: number;
  lastX: number;
  lastTime: number;
  velocity: number;
};

type RecipeShelfProps = {
  locale: Locale;
  dict: Dictionary;
  recipes: RecipeSummary[];
};

export function RecipeShelf({ locale, dict, recipes }: RecipeShelfProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const layout = useShelfLayout();
  const hintId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const [initialSlug] = useState(() => searchParams.get("livre"));
  const [activeSlug, setActiveSlug] = useState<string | null>(initialSlug);
  const [openSlug, setOpenSlug] = useState<string | null>(initialSlug);
  // The book putting itself away; the shelf holds still until it is done.
  const [closingSlug, setClosingSlug] = useState<string | null>(null);
  const [moveSource, setMoveSource] = useState<MoveSource>("initial");
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const wheelRef = useRef(0);

  const foundActiveIndex = recipes.findIndex((recipe) => recipe.slug === activeSlug);
  const activeIndex = foundActiveIndex === -1 ? 0 : foundActiveIndex;
  const activeRecipe = recipes.at(activeIndex);
  const effectiveActiveSlug = activeRecipe?.slug ?? null;
  // The server cannot know the screen size, so it renders every book closed;
  // the active one comes out, in the right form, once the page is hydrated.
  const hydrated = useHydrated();
  // A book is put away as soon as the shelf moves off it; only bringing the
  // next one out waits for the shelf to settle (or for the finger to lift).
  const openIndex = !hydrated || openSlug !== effectiveActiveSlug
    ? -1
    : recipes.findIndex((recipe) => recipe.slug === openSlug);
  const closingIndex = closingSlug === null
    ? -1
    : recipes.findIndex((recipe) => recipe.slug === closingSlug);
  // Under a dragging finger the shelf must follow, so it only holds still for
  // the buttons, spines and wheel.
  const holdShelf = closingIndex !== -1 && moveSource !== "drag";
  const centreIndex = holdShelf ? closingIndex : activeIndex;

  const spines = useMemo<SpineInfo[]>(
    () => recipes.map((recipe) => {
      const { tone, ...metrics } = getSpineMetrics({
        slug: recipe.slug,
        length: recipe.stepCount ?? recipe.ingredients.length,
        bookHeight: layout.bookHeight,
      });
      return { ...metrics, toneClass: toneClasses[tone] };
    }),
    [layout.bookHeight, recipes],
  );
  const spineWidths = useMemo(() => spines.map((spine) => spine.width), [spines]);
  const closedTrack = useMemo(() => layoutShelf({ spineWidths }), [spineWidths]);
  const track = layoutShelf({
    spineWidths,
    wide: [openIndex, holdShelf ? closingIndex : -1].filter((index) => index !== -1),
    wideWidth: layout.openWidth,
  });
  // The track starts at the viewport's centre (left: 50%), so centring needs no measurement.
  const trackX = trackOffsetFor(track, centreIndex);
  const slide = reduceMotion || moveSource === "initial"
    ? "none"
    : moveSource === "keyboard" ? "quick" : "slide";

  // One value positions the whole row. It is animated towards the centred book,
  // or set directly by the finger while dragging, without re-rendering the shelf.
  const x = useMotionValue(trackX);
  const collapse = useMotionValue(0);

  useEffect(() => {
    if (isDragging) return;
    if (slide === "none") {
      x.set(trackX);
      return;
    }
    const controls = animate(x, trackX, SLIDES[slide]);
    return () => controls.stop();
  }, [isDragging, slide, trackX, x]);

  // While dragging, the slot of the book that was out collapses under the
  // finger; shifting the track by the same amount keeps the books in hand.
  useEffect(
    () => collapse.on("change", (value) => {
      const drag = dragRef.current;
      if (drag?.dragging) x.set(drag.position - drag.collapse + value);
    }),
    [collapse, x],
  );

  useEffect(() => {
    if (closingSlug === null) return;
    const timer = window.setTimeout(() => setClosingSlug(null), closeDurationMs(layout.mobile));
    return () => window.clearTimeout(timer);
  }, [closingSlug, layout.mobile]);

  // The centred book comes out once the shelf stops moving: right away when the
  // finger lifts, after a short pause for the wheel, buttons and keyboard.
  useEffect(() => {
    if (isDragging || closingSlug !== null || effectiveActiveSlug === openSlug) return;
    const delay = reduceMotion || moveSource === "drag"
      ? 0
      : moveSource === "pointer" ? OPEN_AFTER_SLIDE_MS : SETTLE_DELAY_MS;
    const timer = window.setTimeout(() => setOpenSlug(effectiveActiveSlug), delay);
    return () => window.clearTimeout(timer);
  }, [closingSlug, effectiveActiveSlug, isDragging, moveSource, openSlug, reduceMotion]);

  // Keep the book that is out in the URL so back navigation and shared links land on it.
  useEffect(() => {
    if (!openSlug || openIndex === -1) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("livre") === openSlug) return;
    params.set("livre", openSlug);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params.toString()}${window.location.hash}`,
    );
  }, [openIndex, openSlug]);

  // Horizontal wheel / trackpad scrolling steps through the shelf.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey ? event.deltaY : 0;
    if (delta === 0) return;
    event.preventDefault();
    wheelRef.current += delta;
    const steps = Math.trunc(wheelRef.current / WHEEL_STEP_PX);
    if (steps === 0) return;
    wheelRef.current -= steps * WHEEL_STEP_PX;
    moveBy(steps);
  });
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // Not passive: the page must not swipe back while the shelf scrolls.
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  if (!activeRecipe) return null;

  /** Lets the book that is out put itself away before anything else moves. */
  function putAway() {
    if (reduceMotion || openIndex === -1) return;
    setClosingSlug(openSlug);
    setOpenSlug(null);
  }

  function select(index: number, source: MoveSource = "pointer") {
    const next = recipes[Math.max(0, Math.min(recipes.length - 1, index))];
    if (!next) return;
    // The keyboard stays brisk: no ceremony, the books just change place.
    if (source !== "keyboard" && next.slug !== openSlug) putAway();
    setMoveSource(source);
    setActiveSlug(next.slug);
  }

  function moveBy(steps: number, source: MoveSource = "pointer") {
    select(activeIndex + steps, source);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !activeRecipe) return;
    const { slug } = activeRecipe;
    const keyMoves: Record<string, () => void> = {
      ArrowLeft: () => moveBy(-1, "keyboard"),
      ArrowRight: () => moveBy(1, "keyboard"),
      Home: () => select(0, "keyboard"),
      End: () => select(recipes.length - 1, "keyboard"),
      Enter: () => router.push(`/${locale}/recettes/${slug}`),
    };
    const action = keyMoves[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A second finger must not hijack a drag already in progress.
    if (dragRef.current) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      dragging: false,
      originX: event.clientX,
      closedStart: 0,
      collapse: 0,
      position: 0,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (Math.abs(event.clientX - drag.originX) < DRAG_THRESHOLD_PX) return;
      // The drag starts here: measure from this point so nothing jumps.
      drag.dragging = true;
      drag.originX = event.clientX;
      event.currentTarget.setPointerCapture(event.pointerId);
      x.stop();
      // From now on the finger moves an all-closed shelf: the slot of the book
      // that was out collapses, and the track shifts with it.
      drag.collapse = trackOffsetFor(closedTrack, centreIndex) - trackX;
      drag.closedStart = x.get() + drag.collapse;
      drag.position = drag.closedStart;
      collapse.jump(0);
      if (drag.collapse !== 0) {
        if (reduceMotion) collapse.set(drag.collapse);
        else animate(collapse, drag.collapse, SLIDES.slide);
      }
      putAway();
      setMoveSource("drag");
      setIsDragging(true);
    }
    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) {
      drag.velocity = (event.clientX - drag.lastX) / elapsed;
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;
    }
    // The books stay under the finger, with resistance past either end.
    drag.position = resistPastEnds(
      closedTrack,
      drag.closedStart + event.clientX - drag.originX,
      EDGE_RESISTANCE,
    );
    x.set(drag.position - drag.collapse + collapse.get());
    const target = nearestBook(closedTrack, drag.position);
    if (target !== activeIndex) select(target, "drag");
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressClickRef.current = drag.dragging;
    if (!drag.dragging) return;
    // A quick flick carries the shelf a few books further.
    const stillMoving = event.timeStamp - drag.lastTime < FLICK_WINDOW_MS;
    const extra = stillMoving ? flickSteps(drag.velocity) : 0;
    if (extra !== 0) select(nearestBook(closedTrack, drag.position) + extra, "drag");
    setIsDragging(false);
  }

  // The click that ends a drag must not bring a book out or follow a link.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  const shelf = dict.recipeList.shelf;
  const position = shelf.position
    .replace("{current}", String(activeIndex + 1))
    .replace("{total}", String(recipes.length));
  // A book arrives with its full ceremony only after a click, a tap or a drag.
  const skipIntro = moveSource === "initial" || moveSource === "keyboard" || reduceMotion;
  const fadeIn = moveSource === "keyboard" || (reduceMotion && moveSource !== "initial");

  return (
    <div className="grid gap-4">
      <div
        ref={viewportRef}
        role="region"
        aria-roledescription={shelf.roleDescription}
        aria-label={shelf.label}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={cn(
          "relative -mx-4 touch-pan-y select-none overflow-hidden px-4 pt-6 pb-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:mx-0 md:rounded-3xl md:px-0",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ height: layout.bookHeight + 52 }}
      >
        <p id={hintId} className="sr-only">{shelf.hint}</p>
        <p aria-live="polite" className="sr-only">
          {`${activeRecipe.title}, ${position}`}
        </p>
        <motion.ul className="absolute bottom-5 left-1/2 flex items-end" style={{ x }}>
          {recipes.map((recipe, index) => {
            const isOut = index === openIndex || index === closingIndex;
            return (
              <motion.li
                key={recipe._id}
                initial={false}
                animate={{ width: track.slotWidths[index], marginInlineEnd: track.gaps[index] }}
                transition={SLIDES[slide]}
                className="relative flex shrink-0 items-end justify-center [perspective:1400px]"
                // Books nearer the centre sit higher, so the one that is out
                // passes over its neighbours, not under them.
                style={{
                  height: layout.bookHeight,
                  zIndex: isOut ? 40 : Math.max(0, 30 - Math.abs(index - centreIndex)),
                }}
              >
                <AnimatePresence initial={false}>
                  {isOut ? (
                    <ShelfBook
                      key="book"
                      recipe={recipe}
                      locale={locale}
                      dict={dict}
                      layout={layout}
                      spine={spines[index]}
                      closing={index === closingIndex}
                      index={index}
                      skipIntro={skipIntro}
                      fadeIn={fadeIn}
                    />
                  ) : (
                    <Spine
                      key="spine"
                      recipe={recipe}
                      locale={locale}
                      spine={spines[index]}
                      isActive={index === activeIndex}
                      reduceMotion={reduceMotion}
                      onClick={() => select(index)}
                    />
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </motion.ul>
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-x-0 bottom-2 h-3", styles.plank)}
        />
        {activeIndex !== openIndex ? (
          // Warm the cover image while the shelf settles, so it is there when the book turns.
          <span aria-hidden className="pointer-events-none absolute size-px overflow-hidden opacity-0">
            <Image
              src={activeRecipe.heroImageUrl || defaultRecipeImageUrl}
              alt=""
              fill
              sizes={layout.mobile ? "80vw" : "256px"}
            />
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label={shelf.previous}
          disabled={activeIndex === 0}
          onClick={() => moveBy(-1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="type-meta min-w-16 text-center text-muted-foreground tabular-nums">
          {position}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label={shelf.next}
          disabled={activeIndex === recipes.length - 1}
          onClick={() => moveBy(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

const SPINE_CLASS =
  "flex shrink-0 flex-col items-center overflow-hidden rounded-[3px] pt-6 pb-3 shadow-[0_1px_2px_oklch(0_0_0/0.25)]";

function SpineContent({ recipe, locale }: { recipe: RecipeSummary; locale: Locale }) {
  const category = recipe.categories[0];
  const CategoryIcon = category ? categoryIcons[category] : null;
  return (
    <>
      <span
        className={cn(
          "min-h-0 flex-1 font-heading text-[0.95rem] font-semibold leading-none tracking-[0.01em]",
          styles.spineTitle,
          locale !== "en" && styles.bottomToTop,
        )}
      >
        {recipe.title}
      </span>
      {CategoryIcon ? (
        <CategoryIcon aria-hidden className="mt-4 size-4 shrink-0 stroke-[1.6] opacity-80" />
      ) : null}
    </>
  );
}

/**
 * A book standing on the shelf. The volume that comes out starts and ends in
 * this exact pose, so the two swap in place without any motion of their own.
 */
function Spine({
  recipe,
  locale,
  spine,
  isActive,
  reduceMotion,
  onClick,
}: {
  recipe: RecipeSummary;
  locale: Locale;
  spine: SpineInfo;
  isActive: boolean;
  reduceMotion: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      title={recipe.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: isActive ? ACTIVE_SPINE_LIFT_PX : 0 }}
      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.12 : 0 } }}
      transition={{
        opacity: { duration: reduceMotion ? 0.15 : 0 },
        y: { duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT },
      }}
      className={cn("relative cursor-pointer", SPINE_CLASS, styles.spine, spine.toneClass)}
      style={{ width: spine.width, height: spine.height }}
    >
      <SpineContent recipe={recipe} locale={locale} />
    </motion.div>
  );
}

type ShelfBookProps = {
  recipe: RecipeSummary;
  locale: Locale;
  dict: Dictionary;
  layout: ShelfLayout;
  spine: SpineInfo;
  /** Putting itself away: close, turn back onto the spine, drop onto the shelf. */
  closing: boolean;
  index: number;
  /** Appear already out, without the rise and the turn. */
  skipIntro: boolean;
  /** With `skipIntro`: fade in rather than appear at once. */
  fadeIn: boolean;
};

/** The book that is out of the shelf: a cover on a phone, an open spread otherwise. */
function ShelfBook(props: ShelfBookProps) {
  return props.layout.mobile ? <CoverBook {...props} /> : <SpreadBook {...props} />;
}

/** Leaving without ceremony (keyboard, filters): a short fade over the spine. */
const bookExit = (closing: boolean, reduceMotion: boolean) => ({
  opacity: 0,
  // Put away, the volume already sits in its spine's pose: the swap is instant.
  transition: { duration: reduceMotion ? 0.15 : closing ? 0 : 0.12 },
});

/**
 * Phone: the active book is one volume. It starts exactly where its spine stood
 * on the shelf, rises, and turns on itself to show its front cover. Leaving, it
 * turns back onto its spine and drops back onto the shelf.
 * Tapping the cover opens the recipe.
 */
function CoverBook({ recipe, locale, dict, layout, spine, closing, skipIntro, fadeIn }: ShelfBookProps) {
  const width = layout.pageWidth;
  const { height, width: depth, toneClass } = spine;
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className="absolute bottom-0 left-1/2 [transform-style:preserve-3d]"
      style={{ width, height, marginLeft: -width / 2 }}
      initial={skipIntro
        ? fadeIn ? { opacity: 0 } : false
        // Turned a quarter: only the spine faces the reader, as on the shelf.
        : { rotateY: 90, y: ACTIVE_SPINE_LIFT_PX }}
      animate={closing
        ? { rotateY: 90, y: 0, opacity: 1 }
        : { rotateY: 0, y: MOBILE_LIFT_PX, opacity: 1 }}
      exit={bookExit(closing, reduceMotion)}
      transition={fadeIn
        ? { duration: 0.15 }
        : closing
          ? {
              rotateY: { duration: TURN_OUT_S, ease: EASE_IN_OUT },
              y: { delay: TURN_OUT_S, duration: DROP_S, ease: EASE_IN_OUT },
            }
          : {
              y: { duration: RISE_S, ease: EASE_OUT },
              rotateY: { delay: TURN_IN_DELAY_S, duration: TURN_IN_S, ease: EASE_IN_OUT },
            }}
    >
      <span
        aria-hidden
        className={cn("pointer-events-none absolute -bottom-7 left-[8%] h-7 w-[84%]", styles.bookShadow)}
      />
      {/* The spine, the same face the shelf showed, on the volume's left side. */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute top-0 left-0", SPINE_CLASS, styles.face, styles.spine, toneClass)}
        style={{ width: depth, height, transform: `translateX(${-depth / 2}px) rotateY(-90deg)` }}
      >
        <SpineContent recipe={recipe} locale={locale} />
      </span>
      {/* Page block seen from the fore-edge while the volume turns. */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute top-[4px] bottom-[4px] left-0", styles.face, styles.foreEdge)}
        style={{ width: depth, transform: `translateX(${width - depth / 2}px) rotateY(90deg)` }}
      />
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 rounded-[5px]", styles.face, styles.backBoard, toneClass)}
        style={{ transform: `translateZ(${-depth / 2}px) rotateY(180deg)` }}
      />
      <Link
        href={`/${locale}/recettes/${recipe.slug}`}
        aria-label={`${recipe.title} — ${dict.recipeList.shelf.readRecipe}`}
        className={cn(
          "absolute inset-0 rounded-r-[6px] rounded-l-[3px] outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring",
          styles.face,
        )}
        style={{ transform: `translateZ(${depth / 2}px)` }}
        draggable={false}
      >
        <BookCover recipe={recipe} toneClass={toneClass} imageSizes="80vw" />
      </Link>
    </motion.div>
  );
}

/** The front cover: cloth board, stamped rules, a tipped-in print and the title. */
function BookCover({
  recipe,
  toneClass,
  imageSizes,
  className,
}: {
  recipe: RecipeSummary;
  toneClass: string;
  imageSizes: string;
  className?: string;
}) {
  const imageUrl = recipe.heroImageUrl || defaultRecipeImageUrl;
  return (
    <span
      className={cn(
        "absolute inset-0 flex flex-col items-center overflow-hidden rounded-r-[6px] rounded-l-[3px] pt-9 pr-8 pb-7 pl-10",
        styles.coverCloth,
        toneClass,
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-[10px] w-[5px]", styles.hinge)} />
      <span aria-hidden className={cn("absolute top-3 right-3 bottom-3 left-[22px] rounded-[2px]", styles.coverRule)} />
      <span className={cn("relative block w-full flex-1 p-[5px]", styles.coverPrint)}>
        <span className="relative block size-full overflow-hidden bg-muted">
          <Image src={imageUrl} alt="" fill sizes={imageSizes} className="object-cover" draggable={false} />
        </span>
      </span>
      <span
        className={cn(
          "relative mt-5 line-clamp-2 text-center font-heading text-[1.3rem] leading-tight font-semibold tracking-[0.01em] text-balance",
          styles.coverTitle,
        )}
      >
        {recipe.title}
      </span>
      <span aria-hidden className="relative mt-2 h-px w-10 bg-current opacity-40" />
    </span>
  );
}

/**
 * Wide screens: the same volume, which then opens on a spread. Arriving, it
 * rises off the shelf, turns from its spine to its front cover, and opens.
 * Leaving, it closes, turns back onto its spine and drops onto the shelf.
 */
function SpreadBook({
  recipe,
  locale,
  dict,
  layout,
  spine,
  closing,
  skipIntro,
  fadeIn,
  index,
}: ShelfBookProps) {
  const [opened, setOpened] = useState(skipIntro);
  const { pageWidth } = layout;
  const { height, width: depth, toneClass } = spine;
  const reduceMotion = useReducedMotion() ?? false;
  const shut = !opened || closing;

  // A timer rather than an animation callback: an interrupted animation never
  // reports completion, and the book would stay closed on its cover.
  useEffect(() => {
    if (opened) return;
    const timer = window.setTimeout(
      () => setOpened(true),
      Math.round((TURN_IN_DELAY_S + TURN_IN_S) * 1000),
    );
    return () => window.clearTimeout(timer);
  }, [opened]);
  const imageUrl = recipe.heroImageUrl || defaultRecipeImageUrl;
  const edgeTransition = "opacity 120ms linear";

  return (
    <motion.div
      className="absolute bottom-0 left-1/2 [transform-style:preserve-3d]"
      // Closed, the volume is the right half: it turns about that half's centre.
      style={{
        width: layout.openWidth,
        height,
        marginLeft: -layout.openWidth / 2,
        transformOrigin: "75% 50%",
      }}
      initial={skipIntro
        ? fadeIn ? { opacity: 0 } : false
        : { rotateY: 90, y: ACTIVE_SPINE_LIFT_PX, x: -pageWidth / 2 }}
      animate={closing
        ? { rotateY: 90, y: 0, x: -pageWidth / 2, opacity: 1 }
        : { rotateY: 0, y: DESKTOP_LIFT_PX, x: shut ? -pageWidth / 2 : 0, opacity: 1 }}
      exit={bookExit(closing, reduceMotion)}
      transition={fadeIn
        ? { duration: 0.15 }
        : closing
          ? {
              x: { duration: COVER_CLOSE_S, ease: EASE_IN_OUT },
              rotateY: { delay: COVER_CLOSE_S, duration: TURN_OUT_S, ease: EASE_IN_OUT },
              y: { delay: COVER_CLOSE_S + TURN_OUT_S, duration: DROP_S, ease: EASE_IN_OUT },
            }
          : {
              y: { duration: RISE_S, ease: EASE_OUT },
              rotateY: { delay: TURN_IN_DELAY_S, duration: TURN_IN_S, ease: EASE_IN_OUT },
              x: { duration: COVER_OPEN_S, ease: EASE_IN_OUT },
            }}
    >
      {/* Spine and fore-edge of the closed volume, seen while it turns. */}
      <span
        aria-hidden
        className={cn("pointer-events-none absolute top-0", SPINE_CLASS, styles.face, styles.spine, toneClass)}
        style={{
          left: pageWidth,
          width: depth,
          height,
          transform: `translateX(${-depth / 2}px) rotateY(-90deg)`,
          opacity: shut ? 1 : 0,
          transition: edgeTransition,
        }}
      >
        <SpineContent recipe={recipe} locale={locale} />
      </span>
      <span
        aria-hidden
        className={cn("pointer-events-none absolute top-[4px] bottom-[4px] left-0", styles.face, styles.foreEdge)}
        style={{
          width: depth,
          transform: `translateX(${layout.openWidth - depth / 2}px) rotateY(90deg)`,
          opacity: shut ? 1 : 0,
          transition: edgeTransition,
        }}
      />
      {/* Back board and right-hand page block: the back of the closed volume. */}
      <motion.div
        className={cn("absolute inset-y-0 right-0 rounded-r-[6px]", styles.book, styles.board, toneClass)}
        // Shut, the pages lie behind the cover and the spine: hide them, or the
        // browser may paint them over the spine while the volume turns. They
        // stay until the cover has closed, and return as soon as it opens.
        style={{
          width: pageWidth,
          visibility: shut ? "hidden" : "visible",
          transition: `visibility 0s linear ${shut ? COVER_CLOSE_S : 0}s`,
        }}
        initial={false}
        animate={{ z: shut ? -depth / 2 : 0 }}
        transition={{ duration: COVER_CLOSE_S, ease: EASE_IN_OUT }}
      >
        <div
          className={cn(
            "absolute top-[7px] bottom-[15px] left-0 right-[16px] flex flex-col overflow-hidden",
            styles.sheet,
            styles.sheetRight,
          )}
        >
          <BookPreview recipe={recipe} locale={locale} dict={dict} />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-2.5 right-4 font-heading text-[0.7rem] text-muted-foreground",
              styles.folio,
            )}
          >
            {(index + 1) * 2 + 1}
          </span>
        </div>
      </motion.div>

      {/* Front board, hinged at the spine. Closed it shows the cover; opened, its
          inside carries the left-hand page with the photo plate. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 right-0 [transform-origin:left_center] [transform-style:preserve-3d]"
        style={{ width: pageWidth }}
        initial={false}
        animate={{ rotateY: shut ? 0 : -180, z: shut ? depth / 2 : 0 }}
        transition={skipIntro && !closing
          ? { duration: 0 }
          : { duration: closing ? COVER_CLOSE_S : COVER_OPEN_S, ease: EASE_IN_OUT }}
      >
        <BookCover recipe={recipe} toneClass={toneClass} imageSizes="256px" className={styles.face} />
        <div
          className={cn(
            "absolute inset-0 rounded-l-[6px] [transform:rotateY(180deg)]",
            styles.face,
            styles.book,
            styles.board,
            toneClass,
          )}
        >
          <div
            className={cn(
              "absolute top-[7px] bottom-[15px] left-[16px] right-0 flex flex-col overflow-hidden px-6 pt-7 pb-9",
              styles.sheet,
              styles.sheetLeft,
            )}
          >
            <span className={cn("relative block flex-1 overflow-hidden rounded-[2px] bg-muted", styles.plate)}>
              <Image src={imageUrl} alt="" fill sizes="256px" className="object-cover" />
            </span>
            <span className="type-byline mt-3 text-center text-[0.8rem] text-muted-foreground italic">
              {formatRecipeByline(locale, dict.recipeDetail.recipeBy, recipe.author)}
            </span>
            <span
              className={cn(
                "absolute bottom-2.5 left-4 font-heading text-[0.7rem] text-muted-foreground",
                styles.folio,
              )}
            >
              {(index + 1) * 2}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** What the right-hand page tells about the recipe, and the way in. */
function BookPreview({
  recipe,
  locale,
  dict,
}: {
  recipe: RecipeSummary;
  locale: Locale;
  dict: Dictionary;
}) {
  const times = [
    recipe.prepTime ? `${dict.recipeDetail.prepTime} ${recipe.prepTime}` : null,
    recipe.cookTime ? `${dict.recipeDetail.cookTime} ${recipe.cookTime}` : null,
  ].filter((value): value is string => value !== null);
  const timeText = times.length > 0 ? times.join(" · ") : recipe.timeLabel;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pt-7 pb-9 pl-8">
      <h3 className="line-clamp-3 shrink-0 pb-0.5 font-heading text-[1.6rem] leading-[1.08] font-semibold text-balance hyphens-auto text-foreground">
        {recipe.title}
      </h3>
      <dl className="grid gap-1.5 text-sm font-semibold text-muted-foreground">
        {timeText ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{dict.recipeList.shelf.time}</dt>
            <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 stroke-[1.8] text-primary" />
            <dd>{timeText}</dd>
          </div>
        ) : null}
        {recipe.yieldLabel ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{dict.recipeList.shelf.yield}</dt>
            <Users aria-hidden className="mt-0.5 size-4 shrink-0 stroke-[1.8] text-primary" />
            <dd>{recipe.yieldLabel}</dd>
          </div>
        ) : null}
      </dl>
      {recipe.categories.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={dict.recipeList.categoriesLabel}>
          {recipe.categories.map((category) => (
            <li
              key={category}
              className="rounded-full border border-primary/25 px-2.5 py-0.5 text-xs font-bold text-primary"
            >
              {dict.recipeList.categories[category]}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={`/${locale}/recettes/${recipe.slug}`}
        className={cn(buttonVariants({ size: "sm" }), "mt-auto self-start rounded-full")}
      >
        {dict.recipeList.shelf.readRecipe}
      </Link>
    </div>
  );
}

const mobileQuery = "(max-width: 767px)";

function useShelfLayout(): ShelfLayout {
  const mobile = useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(mobileQuery);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
  const viewport = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerWidth,
    () => 1024,
  );
  if (!mobile) return desktopLayout;
  const pageWidth = Math.min(300, Math.round(viewport * 0.78));
  return { mobile, pageWidth, bookHeight: 430, openWidth: pageWidth };
}

const noopSubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
