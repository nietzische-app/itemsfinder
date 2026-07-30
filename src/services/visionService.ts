import "server-only";

import {
  parseLogoAnnotations,
  type DetectedLogo,
  type VisionLogoAnnotation,
} from "@/lib/brandLogos";

export {
  bestLogoBrand,
  canonicalizeBrand,
  parseLogoAnnotations,
  type DetectedLogo,
} from "@/lib/brandLogos";

/**
 * Google Cloud Vision helpers — annotate client and ROI enrichment parsing
 * used by the scanning engine. Logo brand canonicalisation lives in
 * `lib/brandLogos.ts` so query builders can share it without `server-only`.
 */

export const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export interface VisionVertex {
  x?: number;
  y?: number;
}

export interface VisionLocalizedObject {
  name?: string;
  score?: number;
  boundingPoly?: { normalizedVertices?: VisionVertex[] };
}

export interface VisionWebEntity {
  description?: string;
  score?: number;
}

export interface VisionColorInfo {
  color?: { red?: number; green?: number; blue?: number };
  pixelFraction?: number;
  score?: number;
}

export interface VisionAnnotation {
  localizedObjectAnnotations?: VisionLocalizedObject[];
  logoAnnotations?: VisionLogoAnnotation[];
  webDetection?: {
    webEntities?: VisionWebEntity[];
    bestGuessLabels?: Array<{ label?: string }>;
  };
  imagePropertiesAnnotation?: {
    dominantColors?: { colors?: VisionColorInfo[] };
  };
  error?: { message?: string };
}

export interface VisionAnnotateResponse {
  responses?: VisionAnnotation[];
}

export function toHex(color: VisionColorInfo["color"]): string {
  const channel = (value: number | undefined) =>
    Math.max(0, Math.min(255, Math.round(value ?? 0)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(color?.red)}${channel(color?.green)}${channel(color?.blue)}`;
}

export function parseWebEntities(
  annotation: VisionAnnotation | null | undefined,
): Array<Required<VisionWebEntity>> {
  return (annotation?.webDetection?.webEntities ?? [])
    .filter((entity): entity is Required<VisionWebEntity> =>
      Boolean(entity.description && entity.score),
    )
    .sort((a, b) => b.score - a.score);
}

export interface VisionFeatureRequest {
  type: string;
  maxResults?: number;
}

/**
 * Features for ROI enrichment: web entities, dominant colour, and logo brand.
 */
export const ROI_VISION_FEATURES: VisionFeatureRequest[] = [
  { type: "WEB_DETECTION", maxResults: 10 },
  { type: "IMAGE_PROPERTIES" },
  { type: "LOGO_DETECTION", maxResults: 5 },
];

export const LOCALIZE_VISION_FEATURES: VisionFeatureRequest[] = [
  { type: "OBJECT_LOCALIZATION", maxResults: 20 },
];

/**
 * Calls Vision images:annotate. Returns the first response or null on abort.
 */
export async function annotateVisionImage(
  apiKey: string,
  imageBase64: string,
  features: VisionFeatureRequest[],
  signal: AbortSignal,
): Promise<VisionAnnotation | null> {
  if (signal.aborted) return null;

  const response = await fetch(`${VISION_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features,
        },
      ],
    }),
    signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Vision API responded ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const payload = (await response.json()) as VisionAnnotateResponse;
  const annotation = payload.responses?.[0];

  if (annotation?.error?.message) {
    throw new Error(`Vision API error: ${annotation.error.message}`);
  }

  return annotation ?? null;
}

/** Convenience: logos from a Vision annotation payload. */
export function logosFromAnnotation(
  annotation: VisionAnnotation | null | undefined,
): DetectedLogo[] {
  return parseLogoAnnotations(annotation?.logoAnnotations);
}
