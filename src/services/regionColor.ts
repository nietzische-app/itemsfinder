import "server-only";

import { KEEP_ALL, type ForegroundFilter } from "@/services/foreground";
import { openImage } from "@/services/imageDecode";

import type { BoundingBox } from "@/types";

/**
 * Per-region dominant colour.
 *
 * Vision's IMAGE_PROPERTIES reports dominant colours for the **whole image**, and
 * the pipeline used to apply that single colour to every detection. On a photo
 * where a pink cardigan fills the frame, the black shorts and the black-and-white
 * sneakers were both labelled "pudra" — and since colour is the first word of the
 * generated search query, every downstream lookup was poisoned by it.
 *
 * So the colour is measured per box instead, by cropping the region and sampling
 * it locally. No extra Vision calls: the bytes are already in the request.
 */

/** Central fraction of the box that is sampled, to avoid edge/background bleed. */
const INSET = 0.18;

/** Downscale target for the crop. Colour does not need resolution. */
const SAMPLE_EDGE = 48;

/**
 * Bucket width per channel when finding the modal colour. 32 gives 8 levels per
 * channel: coarse enough that near-identical pixels group, fine enough to keep
 * navy and black apart.
 */
const BUCKET = 32;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Dominant colour of one normalised region, or null when it cannot be sampled.
 *
 * Returns the **mean of the largest colour bucket** rather than the mean of all
 * pixels: averaging a black-and-white sneaker gives grey, which is a colour the
 * shoe does not contain and a word no shopper would search. The modal bucket
 * picks the colour that actually dominates the region.
 */
export interface RegionColorOptions {
  /** Decoded size, so a batch of regions shares one metadata read. */
  size?: { width: number; height: number };
  /**
   * Boxes to ignore while sampling — the other detections that overlap this one.
   *
   * Garments occlude each other, and the box is not the garment. On the reference
   * photo the cardigan hangs over 69% of the shorts box, so sampling the box
   * returned pink for the shorts: the exact error per-region colour was meant to
   * fix, just localised. Excluding the overlapping regions leaves the pixels that
   * actually belong to this item.
   */
  exclude?: BoundingBox[];
  /**
   * Per-pixel foreground test — see `services/foreground.ts`.
   *
   * The inset above is a blunt stand-in for one: it assumes the garment is in the
   * middle of its box, which is exactly wrong for the cases that fail. Thin sandal
   * straps run to the edge of theirs. When a filter is supplied the inset is
   * dropped and the whole box is sampled, because the filter can say which pixels
   * are backdrop and the inset can only guess.
   */
  foreground?: ForegroundFilter;
}

/** Fraction of sampled pixels that must survive exclusion for it to be trusted. */
const MIN_SURVIVING = 0.12;

/**
 * Fraction that must survive the foreground filter.
 *
 * Much lower than `MIN_SURVIVING`, because a small survivor count is the *expected*
 * outcome for the items this is for: the sandals really are a few percent of their
 * box. Low, but not zero — under this there is not enough left to call a modal
 * colour, and falling back to the old answer beats reporting the colour of noise.
 */
const MIN_FOREGROUND = 0.02;


export async function regionDominantColor(
  imageBuffer: Buffer,
  box: BoundingBox,
  options: RegionColorOptions = {},
): Promise<string | null> {
  const meta = options.size;
  const exclude = options.exclude ?? [];
  const foreground = options.foreground ?? KEEP_ALL;
  try {
    const image = openImage(imageBuffer);
    const { width, height } = meta ?? (await image.metadata());
    if (!width || !height) return null;

    // Inset the box so the sample is the garment, not the boundary with whatever
    // is behind it. Dropped only when a backdrop model can do that job properly —
    // skin removal cannot, and dropping it on skin alone costs the items whose box
    // edges are pavement.
    const inset = foreground.handlesBackground ? 0 : INSET;
    const insetX = box.width * inset;
    const insetY = box.height * inset;

    const left = Math.round(clamp01(box.x + insetX) * width);
    const top = Math.round(clamp01(box.y + insetY) * height);
    const right = Math.round(clamp01(box.x + box.width - insetX) * width);
    const bottom = Math.round(clamp01(box.y + box.height - insetY) * height);

    const cropWidth = Math.max(1, right - left);
    const cropHeight = Math.max(1, bottom - top);

    // A region smaller than a few pixels carries no usable colour signal.
    if (cropWidth < 3 || cropHeight < 3) return null;

    const { data, info } = await image
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    if (channels < 3) return null;

    /**
     * Buckets the sampled pixels, optionally skipping occluded ones and those the
     * foreground filter rejects.
     *
     * Three rungs, tried in order, each a strictly weaker claim than the one above:
     * garment pixels only, then anything not covered by a sibling detection, then
     * everything. Falling to a weaker rung is not a failure — it is the answer this
     * function gave before the rung above it existed.
     */
    const collect = (skipExcluded: boolean, skipBackground: boolean) => {
      const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
      let sampled = 0;
      let total = 0;

      for (let i = 0; i + channels - 1 < data.length; i += channels) {
        const pixel = i / channels;
        const px = pixel % info.width;
        const py = Math.floor(pixel / info.width);
        total += 1;

        if (skipExcluded && exclude.length > 0) {
          // Sample pixel -> crop fraction -> whole-image normalised coordinates.
          const nx = (left + ((px + 0.5) / info.width) * cropWidth) / width;
          const ny = (top + ((py + 0.5) / info.height) * cropHeight) / height;

          const occluded = exclude.some(
            (region) =>
              nx >= region.x &&
              nx <= region.x + region.width &&
              ny >= region.y &&
              ny <= region.y + region.height,
          );
          if (occluded) continue;
        }

        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;

        if (skipBackground && !foreground.keep(r, g, b)) continue;
        sampled += 1;

        const key =
          Math.floor(r / BUCKET) * 64 + Math.floor(g / BUCKET) * 8 + Math.floor(b / BUCKET);

        const bucket = buckets.get(key);
        if (bucket) {
          bucket.count += 1;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
        } else {
          buckets.set(key, { count: 1, r, g, b });
        }
      }

      const share = total === 0 ? 0 : sampled / total;
      const floor = skipBackground ? MIN_FOREGROUND : MIN_SURVIVING;
      return { buckets, sampled, enough: total > 0 && share >= floor };
    };

    /*
     * The ladder. Note the second rung re-samples with the inset *conceptually*
     * restored — it cannot literally, since the crop was already taken, so a run
     * that falls back keeps the wider crop. That is the honest trade: a filter that
     * abstains gives a slightly wider sample than the no-filter path, and the
     * alternative is decoding the region twice on every scan.
     */
    const foregroundPass = foreground.active ? collect(true, true) : null;
    const occluderPass = foregroundPass?.enough ? null : collect(true, false);

    const chosen = foregroundPass?.enough
      ? foregroundPass
      : occluderPass?.enough
        ? occluderPass
        : collect(false, false);
    const buckets = chosen.buckets;

    // Array.from rather than iterating the Map directly: the build target
    // predates downlevel iteration of map iterators.
    let best: { count: number; r: number; g: number; b: number } | null = null;
    for (const bucket of Array.from(buckets.values())) {
      if (!best || bucket.count > best.count) best = bucket;
    }
    if (!best) return null;

    /*
     * No abstention threshold here, deliberately. When a garment is a minority of
     * its own box — thin sandal straps over a grey floor, a small beanie against a
     * studio wall — the modal colour is the background, and it is *indistinguishable
     * by share* from a garment that genuinely fills its box. A dominance floor was
     * measured against the eval set and cost two correct answers while recovering
     * none. Recovering those cases needs a real mask (segmentation or a VLM
     * attribute pass), not a threshold.
     */
    return toHex(best.r / best.count, best.g / best.count, best.b / best.count);
  } catch {
    // A corrupt or unsupported payload should degrade to the whole-image colour,
    // not fail the scan.
    return null;
  }
}

/** Decoded dimensions, so a batch of regions shares one metadata read. */
export async function imageSize(
  imageBuffer: Buffer,
): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height } = await openImage(imageBuffer).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}
