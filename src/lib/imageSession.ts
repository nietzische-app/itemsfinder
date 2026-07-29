"use client";

import type { UploadedImage } from "@/types";

/**
 * The uploaded screenshot is handed from `/` to `/analyze` through
 * sessionStorage rather than a query param or a server upload: the image never
 * leaves the browser until the user actually triggers a scan, and a refresh on
 * `/analyze` keeps working.
 */
const STORAGE_KEY = "getthelook:pending-image";

export function saveUploadedImage(image: UploadedImage): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(image));
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

/** Reads a `File` from the dropzone into a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** Fetches a bundled example image and converts it to a data URL. */
export async function exampleToDataUrl(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not load the example image.");

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the example image."));
    reader.readAsDataURL(blob);
  });
}
