"use client";

import type { UploadedImage } from "@/types";

/**
 * The uploaded screenshot is handed from `/` to `/analyze` through
 * sessionStorage rather than a query param or a server upload: the image never
 * leaves the browser until the user actually triggers a scan, and a refresh on
 * `/analyze` keeps working.
 */
const STORAGE_KEY = "markas:pending-image";

/**
 * Persists the pending image. Returns `false` when sessionStorage rejects the
 * write (quota / private mode) so the caller can surface an error instead of
 * navigating to an empty `/analyze`.
 */
export function saveUploadedImage(image: UploadedImage): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(image));
    return true;
  } catch {
    return false;
  }
}

export function readUploadedImage(): UploadedImage | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<UploadedImage>;
    if (typeof parsed?.dataUrl !== "string" || !parsed.dataUrl.startsWith("data:image/")) {
      return null;
    }

    return {
      dataUrl: parsed.dataUrl,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : "screenshot",
      exampleId: parsed.exampleId,
    };
  } catch {
    return null;
  }
}

export function clearUploadedImage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — a stale entry is harmless.
  }
}

/**
 * Longest edge we keep. Well above what detection needs, and far below what a
 * modern phone camera produces.
 */
const MAX_DIMENSION = 1600;

/** Progressive downscale steps when a single pass still exceeds quota. */
const DIMENSION_LADDER = [1600, 1280, 1024, 800, 640] as const;

/** JPEG quality ladder — prefer sharper when it still fits. */
const QUALITY_LADDER = [0.82, 0.7, 0.55, 0.4] as const;

/**
 * Data-URL length ceiling. sessionStorage caps out between 4 and 5 MB, and the
 * payload also has to survive a JSON round-trip, so this leaves headroom.
 */
const MAX_DATA_URL_CHARS = 2_500_000;

function readAsDataUrl(blob: Blob, errorMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(errorMessage));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode that image."));
    image.src = src;
  });
}

function encodeJpeg(
  image: HTMLImageElement,
  maxEdge: number,
  quality: number,
): string | null {
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maxEdge / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/**
 * Shrinks an image so it fits in sessionStorage and travels cheaply to the
 * detection API.
 *
 * A real photo — the demo looks, or a phone screenshot — is routinely 3–8 MB,
 * which as base64 blows past the sessionStorage quota. The write then fails
 * silently and `/analyze` finds nothing to scan. Downscaling here keeps the
 * whole flow well inside budget, and also cuts what we upload to Cloud Vision.
 *
 * Throws when the image cannot be compressed under the storage ceiling so the
 * upload UI can show a recoverable error instead of an empty analyze screen.
 */
export async function prepareImage(dataUrl: string): Promise<string> {
  // Bundled illustrations are a few KB; nothing to gain, and rasterising them
  // would only lose fidelity.
  if (dataUrl.startsWith("data:image/svg+xml")) return dataUrl;

  if (dataUrl.length <= MAX_DATA_URL_CHARS) {
    // Still decode to confirm dimensions — oversized pixels with a small payload
    // are rare, but Vision benefits from the dimension cap.
    try {
      const image = await loadImage(dataUrl);
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      if (longestEdge <= MAX_DIMENSION) return dataUrl;
    } catch {
      return dataUrl;
    }
  }

  let image: HTMLImageElement;
  try {
    image = await loadImage(dataUrl);
  } catch {
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
    throw new Error("Görsel okunamadı. Daha küçük bir dosya dene.");
  }

  let best: string | null = null;

  for (const maxEdge of DIMENSION_LADDER) {
    for (const quality of QUALITY_LADDER) {
      const encoded = encodeJpeg(image, maxEdge, quality);
      if (!encoded) continue;

      if (!best || encoded.length < best.length) best = encoded;
      if (encoded.length <= MAX_DATA_URL_CHARS) return encoded;
    }
  }

  if (best && best.length <= MAX_DATA_URL_CHARS) return best;

  throw new Error(
    "Görsel tarayıcı belleğine sığmadı. Daha küçük bir ekran görüntüsü dene.",
  );
}

/** Reads a `File` from the dropzone into a size-bounded data URL. */
export async function fileToDataUrl(file: File): Promise<string> {
  const raw = await readAsDataUrl(file, "Could not read that file.");
  return prepareImage(raw);
}

/** Fetches a bundled demo look and converts it to a size-bounded data URL. */
export async function exampleToDataUrl(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not load the example image.");

  const raw = await readAsDataUrl(
    await response.blob(),
    "Could not read the example image.",
  );
  return prepareImage(raw);
}
