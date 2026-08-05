"use client";

import type { UploadedImage } from "@/types";

/**
 * The uploaded screenshot is handed from `/` to `/analyze` through
 * sessionStorage rather than a query param or a server upload: the image never
 * leaves the browser until the user actually triggers a scan, and a refresh on
 * `/analyze` keeps working.
 */
const STORAGE_KEY = "markas:pending-image";

/** Keys cleared before every new upload so a previous scan cannot bleed through. */
const SCAN_STORAGE_KEYS = [STORAGE_KEY, "markas:last-result", "markas:active-scan"] as const;

function newScanId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds an `UploadedImage` with a fresh `scanId`. */
export function createUploadedImage(
  input: Omit<UploadedImage, "scanId"> & { scanId?: string },
): UploadedImage {
  return {
    dataUrl: input.dataUrl,
    fileName: input.fileName,
    exampleId: input.exampleId,
    scanId: input.scanId ?? newScanId(),
  };
}

/** Drops every scan-related session key. Safe to call when storage is unavailable. */
export function clearScanSession(): void {
  try {
    for (const key of SCAN_STORAGE_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing to do — a stale entry is handled by the readers below.
  }
}

/**
 * Persists a fresh upload for `/analyze`.
 *
 * Always clears previous scan state first, then writes under a new `scanId`.
 * If the write fails (quota / private mode), storage stays empty rather than
 * leaving the previous photograph in place — that was how a female-outfit scan
 * could reappear after a male-shirt upload.
 */
export function saveUploadedImage(image: Omit<UploadedImage, "scanId"> & { scanId?: string }): void {
  clearScanSession();

  const payload = createUploadedImage(image);

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private-mode / quota errors: /analyze will show its empty state instead.
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
      // Legacy entries written before scanId existed still need an id so the
      // analyze page can isolate in-flight responses.
      scanId: typeof parsed.scanId === "string" && parsed.scanId.length > 0 ? parsed.scanId : newScanId(),
    };
  } catch {
    return null;
  }
}

export function clearUploadedImage(): void {
  clearScanSession();
}

/**
 * Longest edge we keep. Well above what detection needs, and far below what a
 * modern phone camera produces.
 */
const MAX_DIMENSION = 1600;

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

/**
 * Shrinks an image so it fits in sessionStorage and travels cheaply to the
 * detection API.
 *
 * A real photo — the demo looks, or a phone screenshot — is routinely 3–8 MB,
 * which as base64 blows past the sessionStorage quota. The write then fails
 * silently and `/analyze` finds nothing to scan. Downscaling here keeps the
 * whole flow well inside budget, and also cuts what we upload to Cloud Vision.
 *
 * Returns the input unchanged if it is already small enough, or if anything about
 * the canvas round-trip fails: shipping the original is always better than losing
 * the image.
 *
 * Downscaling here is a convenience, not a control. The API enforces its own pixel
 * ceiling (`inspectUpload`) because nothing that arrives at a server was
 * necessarily produced by its own client.
 */
export async function prepareImage(dataUrl: string): Promise<string> {
  let image: HTMLImageElement;
  try {
    image = await loadImage(dataUrl);
  } catch {
    return dataUrl;
  }

  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  if (longestEdge <= MAX_DIMENSION && dataUrl.length <= MAX_DATA_URL_CHARS) {
    return dataUrl;
  }

  const scale = Math.min(1, MAX_DIMENSION / longestEdge);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return dataUrl;

    context.drawImage(image, 0, 0, width, height);
    const encoded = canvas.toDataURL("image/jpeg", 0.82);

    // Guard against a pathological re-encode coming out larger.
    return encoded.length < dataUrl.length ? encoded : dataUrl;
  } catch {
    return dataUrl;
  }
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
