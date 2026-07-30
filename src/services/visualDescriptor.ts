import "server-only";

import { type Sharp } from "sharp";

import { KEEP_ALL, type ForegroundFilter } from "@/services/foreground";
import { openImage } from "@/services/imageDecode";

import type { BoundingBox } from "@/types";

/**
 * Visual descriptors, for comparing a detection crop against a product photo.
 *
 * **This is a hand-built descriptor, not a learned embedding.** It is named for
 * what it is. Two parts, both computed from pixels:
 *
 *  - a **colour histogram** in HSV, which is what actually decides fashion matches
 *    — a shopper rejects the wrong colour before they notice the cut,
 *  - a **difference hash**, 64 bits of coarse structure, which separates a boot
 *    from a sandal when both are black.
 *
 * What it cannot do: it has no idea what a garment *is*. It cannot tell a black
 * leather jacket from a black leather sofa, and it will happily rate two unrelated
 * beige items as similar. That is why it is blended with the attribute agreement
 * score rather than replacing it, and why the family gate stays in front of both.
 * A learned embedding would carry semantics; it would also need a model runtime and
 * an index over a real product feed, neither of which exists here. The interface is
 * the seam for that: swap `describeImage` and `visualSimilarity` and nothing above
 * changes.
 */

/**
 * Fraction trimmed from every edge before measuring.
 *
 * Both sides of the comparison have background the other does not: retailer photos
 * are shot on white, and a detection crop is a rectangle cut out of a street
 * photograph. Trimming to the centre is the cheapest way to compare more garment
 * and less backdrop, and it applies to both sides equally so it cannot bias one.
 */
const INSET = 0.15;

/** Edge length the histogram is sampled at. Colour needs no resolution. */
const HISTOGRAM_EDGE = 48;

/** Saturation below which a pixel has no meaningful hue. */
const ACHROMATIC = 0.18;

/**
 * Fraction of sampled pixels that must survive masking for the masked histogram to
 * be trusted. Mirrors `regionColor.ts`: measuring the occluder is wrong, but
 * measuring a dozen surviving pixels is worse.
 */
const MIN_SURVIVING = 0.15;

/** Hue bins × saturation bins × value bins, plus the achromatic ramp. */
const HUE_BINS = 8;
const SAT_BINS = 2;
const VAL_BINS = 2;
const GREY_BINS = 4;
const HISTOGRAM_SIZE = HUE_BINS * SAT_BINS * VAL_BINS + GREY_BINS;

export interface VisualDescriptor {
  /** L2-normalised HSV histogram, so cosine similarity is a plain dot product. */
  histogram: number[];
  /** 64-bit difference hash, as 16 hex characters. */
  hash: string;
}

/**
 * Weight of colour versus structure.
 *
 * Colour dominates because structure is the part that legitimately disagrees: the
 * product photo is a flat-lay or a studio shot, ours is a person mid-stride. Coarse
 * structure still earns its 30% — it is what stops a black boot from scoring as a
 * black sandal.
 */
const COLOR_WEIGHT = 0.7;
const STRUCTURE_WEIGHT = 0.3;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Describes one image, or null when it cannot be decoded.
 *
 * Never throws: a product image that is a 404 page, an SVG placeholder or a
 * truncated JPEG has to degrade to "no visual evidence", not fail the scan.
 */
export interface DescribeOptions {
  /**
   * Regions to ignore, in this image's own normalised coordinates — the other
   * garments overlapping this crop. Supplied by `cropRegion` as `crop.masks`.
   *
   * Only the histogram honours them. The difference hash reads a 9×8 greyscale
   * reduction where an occluder cannot be cut out without inventing structure that
   * is not there; masking to a flat colour would create edges of its own. Structure
   * is 30% of the score, so it absorbs the error, and colour — the part that decides
   * fashion matches — is measured on the garment.
   */
  exclude?: BoundingBox[];
  /**
   * Per-pixel foreground test — see `services/foreground.ts`.
   *
   * **Deliberately not enabled by the pipeline.** The roadmap predicted that a mask
   * would fix the descriptor as well as the colour, and measurement said otherwise:
   * retrieval on the eval set goes 12/14 -> 10/14 with it on. Removing pixels
   * thins both histograms and does it *asymmetrically* — the tight crop and the
   * loose one lose different proportions — so two views of the same garment end up
   * further apart than they started.
   *
   * The option stays because it is the subject of that measurement, and because the
   * measurement is biased against it: this test compares two crops of the same
   * photograph, where the shared backdrop is shared *signal*, which it would not be
   * against a retailer's white-studio shot. Worth re-running when 0.3 puts real
   * product photographs in the catalogue, or when 1.1 grows the set. Until one of
   * those says otherwise, off is the measured answer.
   */
  foreground?: ForegroundFilter;
}

export async function describeImage(
  imageBuffer: Buffer,
  options: DescribeOptions = {},
): Promise<VisualDescriptor | null> {
  try {
    const image = openImage(imageBuffer);
    const { width, height } = await image.metadata();
    if (!width || !height || width < 8 || height < 8) return null;

    const left = Math.round(width * INSET);
    const top = Math.round(height * INSET);
    const cropWidth = Math.max(8, width - left * 2);
    const cropHeight = Math.max(8, height - top * 2);

    const centre = () =>
      openImage(imageBuffer).extract({
        left,
        top,
        width: cropWidth,
        height: cropHeight,
      });

    /*
     * The mask arrives in the *uncropped* frame of this image, and the centre inset
     * above has already changed that frame, so it has to be re-based before it can
     * be applied to the sample.
     */
    const masks = (options.exclude ?? [])
      .map((region) => ({
        x: (region.x * width - left) / cropWidth,
        y: (region.y * height - top) / cropHeight,
        width: (region.width * width) / cropWidth,
        height: (region.height * height) / cropHeight,
      }))
      .filter(
        (region) =>
          region.x + region.width > 0 &&
          region.y + region.height > 0 &&
          region.x < 1 &&
          region.y < 1,
      );

    const [histogram, hash] = await Promise.all([
      buildHistogram(centre(), masks, options.foreground ?? KEEP_ALL),
      buildHash(centre()),
    ]);

    return histogram && hash ? { histogram, hash } : null;
  } catch {
    return null;
  }
}

/** HSV histogram of a pipeline, L2-normalised, skipping masked regions. */
async function buildHistogram(
  pipeline: Sharp,
  masks: BoundingBox[] = [],
  foreground: ForegroundFilter = KEEP_ALL,
): Promise<number[] | null> {
  const { data, info } = await pipeline
    .resize(HISTOGRAM_EDGE, HISTOGRAM_EDGE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3) return null;

  /** One pass over the sample, optionally skipping masked and background pixels. */
  const collect = (skipMasked: boolean) => {
    const bins = new Array<number>(HISTOGRAM_SIZE).fill(0);
    let counted = 0;
    let total = 0;

    for (let i = 0; i + 2 < data.length; i += info.channels) {
      const pixel = i / info.channels;
      total += 1;

      if (skipMasked && masks.length > 0) {
        const nx = ((pixel % info.width) + 0.5) / info.width;
        const ny = (Math.floor(pixel / info.width) + 0.5) / info.height;

        const occluded = masks.some(
          (region) =>
            nx >= region.x &&
            nx <= region.x + region.width &&
            ny >= region.y &&
            ny <= region.y + region.height,
        );
        if (occluded) continue;
      }

      if (skipMasked && !foreground.keep(data[i]!, data[i + 1]!, data[i + 2]!)) continue;

      const r = data[i]! / 255;
      const g = data[i + 1]! / 255;
      const b = data[i + 2]! / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const saturation = max === 0 ? 0 : delta / max;

      counted += 1;

      if (saturation < ACHROMATIC) {
        /*
         * Achromatic pixels get their own lightness ramp instead of being forced
         * into a hue bin. Half of fashion is black, white and grey; binning those by
         * hue puts a black coat and a white shirt in whichever bin their sensor
         * noise happens to point at, which is worse than not measuring them.
         */
        const bin = Math.min(GREY_BINS - 1, Math.floor(max * GREY_BINS));
        bins[HUE_BINS * SAT_BINS * VAL_BINS + bin]! += 1;
        continue;
      }

      let hue = 0;
      if (max === r) hue = ((g - b) / delta + 6) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;

      const hueBin = Math.min(HUE_BINS - 1, Math.floor((hue / 6) * HUE_BINS));
      const satBin = Math.min(SAT_BINS - 1, Math.floor(saturation * SAT_BINS));
      const valBin = Math.min(VAL_BINS - 1, Math.floor(max * VAL_BINS));

      bins[(hueBin * SAT_BINS + satBin) * VAL_BINS + valBin]! += 1;
    }

    return { bins, counted, enough: total > 0 && counted / total >= MIN_SURVIVING };
  };

  const masked = collect(true);
  const chosen = masked.enough ? masked : collect(false);
  if (chosen.counted === 0) return null;

  const norm = Math.sqrt(chosen.bins.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return null;

  return chosen.bins.map((value) => value / norm);
}

/**
 * Difference hash: 9×8 greyscale, one bit per horizontally adjacent pair.
 *
 * Robust to scale, brightness and mild colour shifts, which is exactly the noise
 * between a studio product shot and a photo of someone wearing the thing.
 */
async function buildHash(pipeline: Sharp): Promise<string | null> {
  const { data, info } = await pipeline
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) return null;

  const bytes = new Uint8Array(8);
  for (let y = 0; y < 8; y += 1) {
    let byte = 0;
    for (let x = 0; x < 8; x += 1) {
      const leftPixel = data[y * 9 + x]!;
      const rightPixel = data[y * 9 + x + 1]!;
      if (leftPixel > rightPixel) byte |= 1 << (7 - x);
    }
    bytes[y] = byte;
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Popcount of one byte. */
function popcount(value: number): number {
  let n = value;
  n = n - ((n >> 1) & 0x55);
  n = (n & 0x33) + ((n >> 2) & 0x33);
  return (n + (n >> 4)) & 0x0f;
}

function hammingDistance(a: string, b: string): number | null {
  if (a.length !== b.length) return null;

  let distance = 0;
  for (let i = 0; i < a.length; i += 2) {
    const left = Number.parseInt(a.slice(i, i + 2), 16);
    const right = Number.parseInt(b.slice(i, i + 2), 16);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
    distance += popcount(left ^ right);
  }
  return distance;
}

/**
 * 0..1 visual similarity between two descriptors.
 *
 * Colour is cosine similarity between the normalised histograms; structure is the
 * complement of the normalised Hamming distance. A dHash of two *unrelated* images
 * already agrees on about half its bits by chance, so the structural term is
 * rescaled from that floor — leaving it raw would hand every pair a free 0.5 and
 * make the term almost constant.
 */
export function visualSimilarity(a: VisualDescriptor, b: VisualDescriptor): number {
  if (a.histogram.length !== b.histogram.length) return 0;

  let dot = 0;
  for (let i = 0; i < a.histogram.length; i += 1) {
    dot += a.histogram[i]! * b.histogram[i]!;
  }

  const distance = hammingDistance(a.hash, b.hash);
  const agreement = distance === null ? 0.5 : 1 - distance / 64;
  // Rescale [0.5, 1] onto [0, 1]; chance agreement is worth nothing.
  const structure = clamp01((agreement - 0.5) * 2);

  return (
    Math.round((COLOR_WEIGHT * clamp01(dot) + STRUCTURE_WEIGHT * structure) * 1000) / 1000
  );
}
