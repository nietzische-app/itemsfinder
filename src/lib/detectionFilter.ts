import type { BoundingBox } from "@/types";
import type { ItemFamily } from "@/lib/itemFamily";

/**
 * Cleans up raw object detections before they become hotspots.
 *
 * Vision's OBJECT_LOCALIZATION is generous: a three-piece outfit routinely comes
 * back as eight or more overlapping boxes, because it reports the same garment at
 * several granularities ("Clothing", "Outerwear", "Top" over one cardigan) and
 * each shoe of a pair separately. Every one of those became a hotspot, so the
 * canvas read as clutter rather than as three things you can buy.
 *
 * Four passes, in order:
 *   1. confidence floor
 *   2. suppress boxes contained by a box we already kept
 *   3. suppress boxes overlapping a kept box past an IoU threshold
 *   4. merge same-family neighbours (the two shoes of a pair)
 * then a hard cap, highest confidence first.
 */

export interface DetectionCandidate {
  /** Vision's object class, e.g. "Footwear". */
  name: string;
  /** 0..1 detector confidence. */
  score: number;
  box: BoundingBox;
  /** Family the name maps to; drives the merge pass. */
  family: ItemFamily;
}

export interface DedupeOptions {
  /** Minimum confidence to survive pass 1. Vision noise sits below ~0.6. */
  minScore?: number;
  /** IoU above which two boxes are the same thing. */
  maxIou?: number;
  /**
   * Fraction of the *smaller* box that must sit inside the larger for the
   * smaller to count as contained. Catches the "Clothing" box wrapping a
   * cardigan, where IoU is low but containment is near total.
   */
  maxContainment?: number;
  /** Gap, as a fraction of image size, within which same-family boxes merge. */
  mergeGap?: number;
  /** Hard cap on the returned detections. */
  maxItems?: number;
}

/**
 * Exported so the parameter sweep can report where the shipped values land in the
 * grid it searches. A sweep that cannot say "and here is what we use today" only
 * tells you a maximum, not whether moving is worth it.
 */
export const DEDUPE_DEFAULTS: Required<DedupeOptions> = {
  minScore: 0.65,
  maxIou: 0.4,
  maxContainment: 0.7,
  mergeGap: 0.06,
  maxItems: 4,
};

export function boxArea(box: BoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/** Area of the overlap between two boxes; 0 when they do not intersect. */
export function intersectionArea(a: BoundingBox, b: BoundingBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/** Intersection over union, the standard "are these the same box" measure. */
export function iou(a: BoundingBox, b: BoundingBox): number {
  const overlap = intersectionArea(a, b);
  const union = boxArea(a) + boxArea(b) - overlap;
  return union <= 0 ? 0 : overlap / union;
}

/**
 * How much of the smaller box sits inside the larger one.
 *
 * IoU alone misses nesting: a full-body "Clothing" box over a cardigan can score
 * 0.25 IoU while containing the cardigan entirely. That is a duplicate, and the
 * specific one is the keeper.
 */
export function containment(a: BoundingBox, b: BoundingBox): number {
  const smaller = Math.min(boxArea(a), boxArea(b));
  return smaller <= 0 ? 0 : intersectionArea(a, b) / smaller;
}

/** Smallest box covering both inputs. */
export function unionBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);

  return { x, y, width: right - x, height: bottom - y };
}

/** Edge-to-edge gap between two boxes, 0 when they touch or overlap. */
export function boxGap(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.max(dx, dy);
}

/**
 * Suppresses duplicates and merges fragments.
 *
 * Returns detections in the input's own confidence order, capped. The merge pass
 * is what turns two "Shoe" boxes into one footwear region: a pair of shoes is one
 * thing a shopper buys, so it should be one hotspot with a box covering both.
 */
export function dedupeDetections(
  candidates: DetectionCandidate[],
  options: DedupeOptions = {},
): DetectionCandidate[] {
  const { minScore, maxIou, maxContainment, mergeGap, maxItems } = {
    ...DEDUPE_DEFAULTS,
    ...options,
  };

  /*
   * Pass 1: confidence floor, then order by **specificity before confidence**.
   *
   * Sorting on score alone loses the garment. Vision reports a generic
   * "Clothing" box over the whole outfit at 0.95 and the "Outerwear" box inside
   * it at 0.94, so score order keeps the generic one first and then suppresses
   * both real garments by containment. A named family always outranks
   * "unknown"; ties fall back to the smaller box, which is the more specific
   * region.
   */
  const ranked = candidates
    .filter((candidate) => candidate.score >= minScore && boxArea(candidate.box) > 0)
    .sort((a, b) => {
      const specificity = Number(b.family !== "unknown") - Number(a.family !== "unknown");
      if (specificity !== 0) return specificity;
      if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
      return boxArea(a.box) - boxArea(b.box);
    });

  const kept: DetectionCandidate[] = [];

  for (const candidate of ranked) {
    let merged = false;
    let duplicate = false;

    for (let i = 0; i < kept.length; i += 1) {
      const existing = kept[i]!;

      // Pass 4 first for same-family neighbours: a pair of shoes should widen
      // the kept box rather than be discarded as a duplicate.
      if (
        candidate.family !== "unknown" &&
        candidate.family === existing.family &&
        boxGap(candidate.box, existing.box) <= mergeGap
      ) {
        kept[i] = { ...existing, box: unionBox(existing.box, candidate.box) };
        merged = true;
        break;
      }

      // Passes 2 and 3: nested or heavily overlapping means duplicate.
      if (
        containment(candidate.box, existing.box) >= maxContainment ||
        iou(candidate.box, existing.box) >= maxIou
      ) {
        duplicate = true;
        break;
      }
    }

    if (merged || duplicate) continue;
    kept.push(candidate);
  }

  return kept.slice(0, maxItems);
}

/* -------------------------------------------------------------------------- */
/*  Person-relative geometry                                                  */
/* -------------------------------------------------------------------------- */

/** Where a garment sits on the body. */
export type BodyRegion = "head" | "upper" | "lower" | "feet" | "unknown";

/**
 * Places a box against the detected person.
 *
 * Vision returns a "Person" box that this pipeline used to discard. It is a free
 * and surprisingly strong prior: a garment in the top fifth of a person is
 * headwear, the bottom tenth is footwear, and so on. That fixes the cases where
 * Vision labels shorts "Top", and it gives the footwear merge a sanity check.
 *
 * Fractions are of the person's height, measured from their top edge.
 */
export function bodyRegionOf(
  box: BoundingBox,
  person: BoundingBox | null,
): BodyRegion {
  const t = bodyPosition(box, person);
  if (t === null) return "unknown";

  // Bands measured against a full-body frame: head to mid-chest, chest to hip,
  // hip to ankle, ankle down. A leaning pose pushes the hip line up, which is
  // why the upper/lower split sits at 0.45 rather than half way.
  if (t < 0.14) return "head";
  if (t < 0.45) return "upper";
  if (t < 0.85) return "lower";
  return "feet";
}

/**
 * Vertical position of a box within the person, 0 at their crown and 1 at their
 * feet. Null when there is no person to measure against.
 */
export function bodyPosition(
  box: BoundingBox,
  person: BoundingBox | null,
): number | null {
  if (!person || person.height <= 0) return null;

  const centre = box.y + box.height / 2;
  const t = (centre - person.y) / person.height;

  // Vision's person box often starts at the hairline, so a hat or beanie sits
  // slightly above it. A little slack keeps those measurable instead of
  // discarding them as out of frame.
  if (t < -0.12 || t > 1.12) return null;
  return t;
}

/**
 * Rejects only the physically impossible.
 *
 * Deliberately one-sided and generous rather than a set of tight bands. Vision's
 * person box is sometimes a half-body crop, which shifts every fraction; with
 * tight bands that silently *drops real detections*, which is far worse than
 * letting a bit of noise through. So each family gets the single bound that
 * cannot be argued with — shoes are never at chest height — and everything else
 * passes.
 */
export function familyFitsBody(family: ItemFamily, t: number | null): boolean {
  if (t === null) return true;

  switch (family) {
    case "footwear":
      return t > 0.55;
    case "lips":
    case "eyes":
    case "face":
      return t < 0.3;
    case "bottom":
      return t > 0.3;
    case "top":
    case "outerwear":
    case "dress":
      return t < 0.88;
    /*
     * A hat is on a head. This is the family that was folded into `accessory` and
     * therefore unconstrained, so a hat detected at ankle height passed — the exact
     * impossibility this function exists to reject.
     *
     * 0.35 rather than something tighter because the box is the *hat*, measured
     * against the person's full height, and a wide-brimmed hat or a headscarf worn
     * low sits further down than a beanie.
     */
    case "headwear":
      return t < 0.35;
    // Belts, bags, socks and jewellery legitimately appear anywhere on a body.
    default:
      return true;
  }
}
