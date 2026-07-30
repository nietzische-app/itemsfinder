import "server-only";

import { openImage } from "@/services/imageDecode";

import type { BoundingBox } from "@/types";

/**
 * Foreground separation inside a detection box.
 *
 * **What this is not.** It is not a learned segmentation model. SAM or MobileSAM
 * with a box prompt would produce a better mask; neither can be obtained here
 * (model weights are not reachable from this environment) and both bring an
 * inference runtime and a cold start that a serverless function pays on every
 * request. That option stays open — `docs/ROADMAP.md` 2.1 — and this does not
 * close it.
 *
 * **What this is.** Elimination of the two things that are provably not the
 * garment, working per pixel:
 *
 *  1. **Backdrop**, learned from pixels that lie outside every detection *and*
 *     outside the person. Those pixels are background by construction, not by
 *     assumption. This matters: rejecting "the colour that dominates the box" was
 *     measured against the eval set and rejected, because it throws the garment
 *     away whenever garment and backdrop are both dark. Learning the backdrop from
 *     somewhere it is known to be is a different source of information, and it
 *     stays silent when the photograph gives it nothing to learn from.
 *  2. **Skin**, by the standard chrominance rules. Every one of the four items the
 *     colour metric misses has skin inside its box — legs framing a sandal, a face
 *     under a headscarf, a knee through a rip — and no amount of colour statistics
 *     over a rectangle can tell that apart from the garment.
 *
 * Both are conservative and both abstain: when the filter would remove nearly
 * everything, the caller is told so and keeps the behaviour it had. This project's
 * history is a series of "improvements" that traded correct answers for incorrect
 * ones, so a stage that cannot say "I don't know" is not worth adding.
 */

/** Working resolution for learning the backdrop. Colour statistics need no detail. */
const BACKDROP_EDGE = 96;

/**
 * Quantisation, matching `regionColor`'s: 8 levels per channel.
 *
 * Membership in this grid *is* the backdrop test, which is deliberate — a distance
 * threshold would be one more constant chosen by looking at four photographs. A
 * studio wall spans several buckets because of its gradient, and learning from the
 * actual outside pixels picks up exactly the ones it spans.
 */
const BUCKET = 32;
const LEVELS = 8;

/** Detection boxes are approximate, so they are grown slightly before being cut out. */
const BOX_MARGIN = 0.02;

/** A bucket has to cover this much of the outside area to count as backdrop. */
const MIN_BUCKET_SHARE = 0.01;

/** Below this much visible outside area there is nothing to learn from. */
const MIN_OUTSIDE_SHARE = 0.08;

/*
 * A backdrop is a small palette. Everything else is a scene.
 *
 * This is the guard on the whole idea, and it exists because the idea failed
 * without it. "Outside every box" is background by construction, but background is
 * not the same thing as *backdrop*: in a studio shot the outside is a wall, and in
 * a street shot it is a building, a road and a sky. Treating a scene's colours as
 * removable deleted a black leather jacket that happened to share a bucket with the
 * dark bands of the glass wall behind it — the same failure that got the earlier
 * "reject the dominant colour" attempt rejected, arriving by a different road.
 *
 * Measured over the eval set, the number of quantised colours needed to cover 80%
 * of the outside area separates the two cleanly:
 *
 *     stüdyo:  long-coat 3,  black-blazer 5
 *     sokak:   pink-outfit 11,  biker-look 11
 *
 * Eight sits in that gap, and — stated plainly — anything from six to ten would
 * have drawn the same line on four photographs. What makes it more than an
 * arbitrary pick is that it means something: eight buckets is 1.5% of the 512-colour
 * grid, which a wall and its gradient and its shadow fit inside and a street does
 * not. When the set grows (`docs/ROADMAP.md` 1.1) this is the first constant to
 * re-measure.
 */
const PALETTE_COVERAGE = 0.8;
const MAX_PALETTE = 8;

export interface Backdrop {
  /** Quantised colours seen outside every box. */
  buckets: Set<number>;
  /** Share of the image those pixels came from, for diagnostics. */
  outsideShare: number;
  /** How many colours it took to cover `PALETTE_COVERAGE` of that area. */
  paletteSize: number;
}

function bucketOf(r: number, g: number, b: number): number {
  return (
    Math.floor(r / BUCKET) * LEVELS * LEVELS +
    Math.floor(g / BUCKET) * LEVELS +
    Math.floor(b / BUCKET)
  );
}

function inside(box: BoundingBox, x: number, y: number, margin: number): boolean {
  const mx = box.width * margin;
  const my = box.height * margin;
  return (
    x >= box.x - mx &&
    x <= box.x + box.width + mx &&
    y >= box.y - my &&
    y <= box.y + box.height + my
  );
}

/**
 * Learns the backdrop colours of one photograph.
 *
 * `boxes` should be everything the detector found *plus* the person: skin outside a
 * garment box is not backdrop, and letting it in here would teach the filter that a
 * camel coat is scenery.
 *
 * Returns `null` when the boxes leave too little of the frame visible — a
 * full-bleed crop has no backdrop to learn, and inventing one would be worse than
 * having none.
 */
export async function learnBackdrop(
  imageBuffer: Buffer,
  options: { size?: { width: number; height: number }; boxes: BoundingBox[] },
): Promise<Backdrop | null> {
  try {
    const image = openImage(imageBuffer);
    const { width, height } = options.size ?? (await image.metadata());
    if (!width || !height) return null;

    const { data, info } = await image
      .resize(BACKDROP_EDGE, BACKDROP_EDGE, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    if (channels < 3) return null;

    const counts = new Map<number, number>();
    let outside = 0;
    let total = 0;

    for (let i = 0; i + channels - 1 < data.length; i += channels) {
      const pixel = i / channels;
      const nx = ((pixel % info.width) + 0.5) / info.width;
      const ny = (Math.floor(pixel / info.width) + 0.5) / info.height;
      total += 1;

      if (options.boxes.some((box) => inside(box, nx, ny, BOX_MARGIN))) continue;

      outside += 1;
      const key = bucketOf(data[i]!, data[i + 1]!, data[i + 2]!);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (total === 0 || outside / total < MIN_OUTSIDE_SHARE) return null;

    // Is this a backdrop or a scene? Count the colours it takes to cover most of
    // the outside area; a wall needs few, a street needs many.
    const sorted = Array.from(counts.values()).sort((a, b) => b - a);
    let paletteSize = 0;
    let covered = 0;
    while (covered < PALETTE_COVERAGE * outside && paletteSize < sorted.length) {
      covered += sorted[paletteSize]!;
      paletteSize += 1;
    }
    if (paletteSize > MAX_PALETTE) return null;

    const buckets = new Set<number>();
    for (const [key, count] of Array.from(counts.entries())) {
      if (count / outside >= MIN_BUCKET_SHARE) buckets.add(key);
    }

    return buckets.size > 0
      ? { buckets, outsideShare: outside / total, paletteSize }
      : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Skin                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Two published chrominance rules, required together.
 *
 * These constants are from the skin-detection literature (the RGB rule of Kovač
 * et al. and the standard YCbCr range), not values picked by looking at this eval
 * set — which is the only reason a threshold is acceptable here at all. Requiring
 * both cuts the false-positive rate of either alone; the cost is that skin in deep
 * shadow is missed, which is the safe direction: a missed skin pixel leaves the
 * measurement where it already was, while a garment pixel called skin removes real
 * evidence.
 *
 * The known limitation, stated rather than discovered later: beige, camel and tan
 * garments sit inside the skin gamut and there is no chrominance rule that
 * separates them. Nothing in the current eval set is that colour, so nothing here
 * measures it. The abstention below is the guard, not a fix.
 */
function isSkin(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const rgbRule =
    r > 95 && g > 40 && b > 20 && max - min > 15 && Math.abs(r - g) > 15 && r > g && r > b;
  if (!rgbRule) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

/* -------------------------------------------------------------------------- */
/*  Filter                                                                    */
/* -------------------------------------------------------------------------- */

export interface ForegroundFilter {
  /** False when the pixel is backdrop or skin, and so cannot be the garment. */
  keep(r: number, g: number, b: number): boolean;
  /** Whether anything is actually being removed, so a caller can skip the pass. */
  readonly active: boolean;
  /**
   * Whether a backdrop model is in play, as opposed to skin removal alone.
   *
   * The distinction matters to `regionColor`, which insets the box to avoid
   * sampling the boundary with whatever is behind the garment. That inset is a
   * blunt stand-in for knowing where the background is, and it is safe to drop only
   * when something better has replaced it. Skin removal is not that: it says
   * nothing about a wall. Dropping the inset on skin alone was measured and it cost
   * `po-shorts`, whose box edges are pavement.
   */
  readonly handlesBackground: boolean;
}

/** A filter that keeps every pixel — the behaviour before this module existed. */
export const KEEP_ALL: ForegroundFilter = {
  keep: () => true,
  active: false,
  handlesBackground: false,
};

/**
 * Builds the per-pixel test.
 *
 * Split into a predicate rather than a bitmap on purpose: `regionColor` and
 * `visualDescriptor` both already walk the pixels of a crop they have decoded, and
 * handing them a mask would mean decoding and resampling the same region twice to
 * produce something they immediately flatten again.
 *
 * The cost of not having a bitmap is that there is no connected-component cleanup,
 * so a stray backdrop-coloured pixel in the middle of a garment survives. Both
 * callers reduce over thousands of pixels — a modal bucket, a histogram — so a
 * scattering of survivors changes nothing. A spatial pass would matter for a real
 * mask; it does not for a colour statistic.
 */
export function foregroundFilter(
  backdrop: Backdrop | null,
  options: { skin?: boolean } = {},
): ForegroundFilter {
  const skin = options.skin ?? true;
  const buckets = backdrop?.buckets ?? null;

  if (!buckets && !skin) return KEEP_ALL;

  return {
    active: true,
    handlesBackground: buckets !== null,
    keep(r, g, b) {
      if (buckets && buckets.has(bucketOf(r, g, b))) return false;
      if (skin && isSkin(r, g, b)) return false;
      return true;
    },
  };
}

/** Exposed for the eval and for tests; not part of the pipeline's own vocabulary. */
export const __testing = { isSkin, bucketOf };
