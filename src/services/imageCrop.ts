import "server-only";

import sharp from "sharp";

import type { BoundingBox } from "@/types";

/**
 * Region crops, for handing a single detection to a vision model.
 *
 * `regionColor.ts` samples a region to measure one number. This produces an
 * actual image of the region, which is what lets a model say "the beanie is
 * cream" on a crop that is 70% studio wall — the failure class a modal-colour
 * measurement cannot get out of, however the threshold is tuned.
 */

/** Longest edge of the produced JPEG. Garment attributes need detail, not pixels. */
const MAX_EDGE = 640;

/**
 * Shortest edge a crop is enlarged to.
 *
 * A beanie or a lipstick occupies a few dozen pixels of a portrait photo. Sent at
 * native size the model is reading a thumbnail; upscaling costs nothing but tokens
 * and the model reads the garment instead of guessing.
 */
const MIN_EDGE = 224;

/**
 * Fraction of the box added on each side.
 *
 * The box is a rectangle around the garment, not the garment: a shoe cropped to
 * its exact box loses the ankle that identifies it as a boot rather than a
 * slipper. A little context reads better; too much brings the neighbouring
 * garment back in, which is what the box was for.
 */
const PADDING = 0.06;

export interface Crop {
  /** Raw base64 JPEG, ready for an API image block. */
  base64: string;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  /**
   * Occluding regions, expressed in this crop's own normalised coordinates.
   *
   * The box is not the garment: on the reference photo the cardigan hangs over 69%
   * of the shorts box, so a crop of "the shorts" is mostly pink knit. `regionColor`
   * already solves this for a single measurement by skipping occluded pixels;
   * anything measuring the crop needs the same information, and only the cropper
   * knows how to map the neighbours into the cut-out's frame.
   */
  masks: BoundingBox[];
}

export interface CropOptions {
  /** Decoded size, so a batch of crops shares one metadata read. */
  size?: { width: number; height: number };
  padding?: number;
  maxEdge?: number;
  minEdge?: number;
  /** Other detections' boxes, in whole-image normalised coordinates. */
  exclude?: BoundingBox[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Crops one normalised region to a JPEG, or null when the region cannot be cut.
 *
 * Never throws: a corrupt payload has to degrade to the measured colour, not fail
 * the scan.
 */
export async function cropRegion(
  imageBuffer: Buffer,
  box: BoundingBox,
  options: CropOptions = {},
): Promise<Crop | null> {
  const padding = options.padding ?? PADDING;
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const minEdge = options.minEdge ?? MIN_EDGE;

  try {
    const image = sharp(imageBuffer, { failOn: "none" });
    const { width, height } = options.size ?? (await image.metadata());
    if (!width || !height) return null;

    const padX = box.width * padding;
    const padY = box.height * padding;

    const left = Math.round(clamp01(box.x - padX) * width);
    const top = Math.round(clamp01(box.y - padY) * height);
    const right = Math.round(clamp01(box.x + box.width + padX) * width);
    const bottom = Math.round(clamp01(box.y + box.height + padY) * height);

    const cropWidth = Math.min(width - left, Math.max(1, right - left));
    const cropHeight = Math.min(height - top, Math.max(1, bottom - top));

    // Below this there is nothing for a model to read either.
    if (cropWidth < 8 || cropHeight < 8) return null;

    let pipeline = image.extract({ left, top, width: cropWidth, height: cropHeight });

    const longest = Math.max(cropWidth, cropHeight);
    const shortest = Math.min(cropWidth, cropHeight);

    if (longest > maxEdge) {
      pipeline = pipeline.resize(maxEdge, maxEdge, { fit: "inside" });
    } else if (shortest < minEdge) {
      // Enlarge on the short edge; `fit: "inside"` keeps the aspect ratio, and
      // the long edge is still capped because the crop was under `maxEdge`.
      const scale = Math.min(minEdge / shortest, maxEdge / longest);
      pipeline = pipeline.resize(Math.round(cropWidth * scale), Math.round(cropHeight * scale));
    }

    const { data, info } = await pipeline
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    // Occluders, from whole-image fractions into this crop's own fractions. Scale
    // is irrelevant to the transform, so the resize above does not affect it.
    const masks: BoundingBox[] = [];
    for (const region of options.exclude ?? []) {
      const x = (region.x * width - left) / cropWidth;
      const y = (region.y * height - top) / cropHeight;
      const w = (region.width * width) / cropWidth;
      const h = (region.height * height) / cropHeight;

      const clippedX = Math.max(0, x);
      const clippedY = Math.max(0, y);
      const clippedRight = Math.min(1, x + w);
      const clippedBottom = Math.min(1, y + h);

      if (clippedRight <= clippedX || clippedBottom <= clippedY) continue;

      masks.push({
        x: clippedX,
        y: clippedY,
        width: clippedRight - clippedX,
        height: clippedBottom - clippedY,
      });
    }

    return {
      base64: data.toString("base64"),
      mediaType: "image/jpeg",
      width: info.width,
      height: info.height,
      masks,
    };
  } catch {
    return null;
  }
}
