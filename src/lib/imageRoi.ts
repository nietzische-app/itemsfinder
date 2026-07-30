import "server-only";

import sharp from "sharp";

import type { BoundingBox } from "@/types";

/** Pad around a Vision box so edge features (sole, cuff, strap) stay in frame. */
const ROI_PAD = 0.04;

/** Smallest useful crop edge — below this we keep the full frame. */
const MIN_ROI_EDGE = 0.06;

export interface CroppedRoi {
  /** Raw base64 (no data-URL prefix) ready for Vision / Context.dev. */
  base64: string;
  mimeType: "image/jpeg";
  /** Pixel bounds used for the crop (after clamp + pad). */
  pixel: { left: number; top: number; width: number; height: number };
}

/**
 * Crops a normalised Vision bounding box from an in-memory image buffer.
 *
 * Full-body screenshots dilute resolution for shoes, jewellery and makeup —
 * feeding the ROI into WEB_DETECTION / IMAGE_PROPERTIES restores feature density.
 * Returns `null` when the box is unusable or decoding fails (caller keeps full frame).
 */
export async function cropNormalizedRoi(
  imageBase64: string,
  mimeType: string,
  box: BoundingBox,
): Promise<CroppedRoi | null> {
  if (box.width < MIN_ROI_EDGE || box.height < MIN_ROI_EDGE) return null;

  try {
    const input = Buffer.from(imageBase64, "base64");
    const image = sharp(input, { failOn: "none" });
    const meta = await image.metadata();
    const imgW = meta.width ?? 0;
    const imgH = meta.height ?? 0;
    if (imgW < 8 || imgH < 8) return null;

    const x0 = Math.max(0, box.x - ROI_PAD);
    const y0 = Math.max(0, box.y - ROI_PAD);
    const x1 = Math.min(1, box.x + box.width + ROI_PAD);
    const y1 = Math.min(1, box.y + box.height + ROI_PAD);

    const left = Math.max(0, Math.floor(x0 * imgW));
    const top = Math.max(0, Math.floor(y0 * imgH));
    const right = Math.min(imgW, Math.ceil(x1 * imgW));
    const bottom = Math.min(imgH, Math.ceil(y1 * imgH));
    const width = right - left;
    const height = bottom - top;

    if (width < 16 || height < 16) return null;

    // JPEG keeps Vision payloads small; quality 90 preserves footwear texture.
    const buffer = await sharp(input, { failOn: "none" })
      .extract({ left, top, width, height })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return {
      base64: buffer.toString("base64"),
      mimeType: "image/jpeg",
      pixel: { left, top, width, height },
    };
  } catch (error) {
    console.warn("[roi] crop failed, using full frame:", error);
    return null;
  }
}
