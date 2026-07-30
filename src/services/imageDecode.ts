import "server-only";

import sharp, { type Sharp } from "sharp";

/**
 * The one place image bytes are allowed to become pixels.
 *
 * Everything that decodes an image goes through `openImage`, because a pixel
 * ceiling set in three of four call sites is not a ceiling. The fourth was the
 * upload route, which bounded the *encoded* size and nothing else — and encoded
 * size does not bound pixels:
 *
 *     9000×9000 PNG  =  248 KB compressed
 *
 * That passed a 10 MB limit with four decimal places to spare, and 81 megapixels
 * is roughly 243 MB per decode. The scan pipeline decodes the same upload several
 * times over — once per detection for the colour measurement, once per detection
 * for the crop, once for the visual descriptor — so a single request could take
 * the function out. With no rate limit in front of it (see `docs/ROADMAP.md`),
 * that was free to trigger.
 */

/**
 * Pixel ceiling for anything this app decodes.
 *
 * 50 MP is far above a phone camera (a 48 MP sensor writes ~12 MP by default) and
 * far below what it takes to exhaust a serverless function. `prepareImage` already
 * downscales uploads to 1600px in the browser, so a legitimate request arrives at
 * about 2 MP; this bound exists for requests that did not come from our client.
 */
export const MAX_PIXELS = 50_000_000;

/** Neither edge may exceed this, however few total pixels that implies. */
export const MAX_EDGE = 12_000;

/**
 * Opens image bytes with the pixel ceiling applied.
 *
 * `failOn: "none"` keeps a slightly corrupt but readable JPEG usable — those are
 * common from phone galleries — while `limitInputPixels` is the part that is not
 * negotiable. sharp raises on the limit at decode *and* at `metadata()`.
 */
export function openImage(buffer: Buffer): Sharp {
  return sharp(buffer, { failOn: "none", limitInputPixels: MAX_PIXELS });
}

/* -------------------------------------------------------------------------- */
/*  Format sniffing                                                           */
/* -------------------------------------------------------------------------- */

/** Raster formats we can decode. SVG is deliberately absent — see `inspectUpload`. */
export type ImageFormat =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif"
  | "image/heic"
  | "image/tiff"
  | "image/bmp";

function matches(buffer: Buffer, offset: number, bytes: number[]): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer: Buffer, offset: number, length: number): string {
  if (buffer.length < offset + length) return "";
  return buffer.subarray(offset, offset + length).toString("latin1");
}

/**
 * The format the bytes actually are, or `null` if it is not a raster image we
 * decode.
 *
 * A declared MIME type is a claim by the caller; this is the file. They are
 * compared rather than one being trusted, because "it says image/jpeg" is exactly
 * what a payload that is not a JPEG would also say.
 */
export function sniffImageFormat(buffer: Buffer): ImageFormat | null {
  if (matches(buffer, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(buffer, 0, 4) === "GIF8") return "image/gif";
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 4) === "WEBP") return "image/webp";
  if (matches(buffer, 0, [0x42, 0x4d])) return "image/bmp";
  if (matches(buffer, 0, [0x49, 0x49, 0x2a, 0x00])) return "image/tiff";
  if (matches(buffer, 0, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";

  // ISO base media: a `ftyp` box whose brand names the codec.
  if (ascii(buffer, 4, 4) === "ftyp") {
    const brand = ascii(buffer, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) return "image/heic";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Upload inspection                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Formats accepted from a client.
 *
 * Narrower than what `sniffImageFormat` recognises, and narrower than what sharp
 * can decode. Two exclusions are deliberate:
 *
 *  - **SVG.** It is not an image, it is a document with a scripting and external-
 *    entity surface, handed to librsvg. The four bundled demo looks were the only
 *    reason it was ever accepted, and they are JPEGs now.
 *  - **TIFF/BMP/GIF.** Nothing produces these from a phone or a screenshot, and
 *    every accepted format is another decoder exposed to strangers.
 */
const ACCEPTED_UPLOAD_FORMATS = new Set<ImageFormat>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Spellings a browser may send for a format we accept. */
const MIME_ALIASES: Record<string, ImageFormat> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/png": "image/png",
  "image/x-png": "image/png",
  "image/webp": "image/webp",
};

export type UploadRejection =
  | "unreadable"
  | "unsupported-format"
  | "declared-mismatch"
  | "too-many-pixels";

export type UploadInspection =
  | { ok: true; format: ImageFormat; width: number; height: number }
  | { ok: false; reason: UploadRejection; detail: string };

/**
 * Decides whether an upload may enter the pipeline.
 *
 * Three checks, in the order that fails cheapest first: what the bytes are, then
 * whether that matches what was claimed, then how large it decodes to. The
 * dimension read uses sharp's *default* ceiling on purpose — reading a header does
 * not allocate the image, and opening at our own ceiling would throw instead of
 * telling us the size, which turns a precise "too large" into a generic failure.
 */
export async function inspectUpload(
  buffer: Buffer,
  declaredMimeType: string,
): Promise<UploadInspection> {
  const format = sniffImageFormat(buffer);

  if (!format) {
    return {
      ok: false,
      reason: "unreadable",
      detail: "bytes are not a raster image",
    };
  }

  if (!ACCEPTED_UPLOAD_FORMATS.has(format)) {
    return {
      ok: false,
      reason: "unsupported-format",
      detail: `${format} is not accepted`,
    };
  }

  const declared = MIME_ALIASES[declaredMimeType.toLowerCase()];
  if (declared !== format) {
    return {
      ok: false,
      reason: "declared-mismatch",
      detail: `declared ${declaredMimeType}, bytes are ${format}`,
    };
  }

  let width = 0;
  let height = 0;

  try {
    const metadata = await sharp(buffer, { failOn: "none" }).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch (error) {
    // Above sharp's own default limit, or a header we cannot parse at all. Either
    // way it is not something to hand the pipeline.
    return {
      ok: false,
      reason: "too-many-pixels",
      detail: error instanceof Error ? error.message : "header unreadable",
    };
  }

  if (width <= 0 || height <= 0) {
    return { ok: false, reason: "unreadable", detail: "no dimensions in header" };
  }

  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
    return {
      ok: false,
      reason: "too-many-pixels",
      detail: `${width}×${height} = ${(width * height / 1e6).toFixed(1)}MP`,
    };
  }

  return { ok: true, format, width, height };
}
