import "server-only";

import type {
  DetectedItem,
  DetectionResult,
  DetectionSource,
  ExampleId,
  ItemCategory,
} from "@/types";
import { MOCK_SCENARIOS, findProductsForLabel } from "@/services/mockCatalog";

/* -------------------------------------------------------------------------- */
/*  Service contract                                                          */
/* -------------------------------------------------------------------------- */

export interface VisualSearchInput {
  /** Raw base64 image payload, *without* the `data:image/...;base64,` prefix. */
  imageBase64: string;
  /** MIME type of the payload, e.g. `image/png`. */
  mimeType: string;
  /** Set when the analysis was kicked off from a built-in example image. */
  exampleId?: ExampleId;
}

/**
 * The single seam between the UI and whatever is doing the actual detection.
 *
 * Any implementation must return items with **normalised** bounding boxes so
 * `BoundingBoxOverlay` can render them without knowing the image dimensions.
 */
export interface VisualSearchService {
  readonly source: DetectionSource;
  analyze(input: VisualSearchInput): Promise<DetectionResult>;
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Cheap deterministic hash so the same upload always yields the same result. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function makeResult(
  items: DetectedItem[],
  source: DetectionSource,
  startedAt: number,
  seed: string,
): DetectionResult {
  return {
    id: `det_${hashString(seed).toString(36)}`,
    source,
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    items,
  };
}

/** Keyword buckets used to route a vision label into one of our two sections. */
const BEAUTY_KEYWORDS = [
  "lip",
  "lipstick",
  "eye",
  "eyeshadow",
  "eyeliner",
  "mascara",
  "brow",
  "blush",
  "highlighter",
  "foundation",
  "makeup",
  "cosmetic",
  "nail",
  "skin",
  "hair",
];

const CLOTHING_KEYWORDS = [
  "jacket",
  "coat",
  "shirt",
  "top",
  "dress",
  "skirt",
  "trousers",
  "pants",
  "jeans",
  "shorts",
  "shoe",
  "sneaker",
  "boot",
  "bag",
  "handbag",
  "hat",
  "glasses",
  "sunglasses",
  "necklace",
  "earring",
  "jewelry",
  "jewellery",
  "watch",
  "belt",
  "scarf",
  "outerwear",
  "footwear",
  "clothing",
];

export function categorizeLabel(label: string): ItemCategory | null {
  const normalized = label.toLowerCase();

  if (BEAUTY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "beauty";
  }

  if (CLOTHING_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "clothing";
  }

  // Anything else (Person, Furniture, Plant, ...) is not shoppable for us.
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Mock implementation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fully functional offline engine. Picks a curated scenario so the product
 * grid, bounding boxes and category split all look realistic without any
 * credentials. Example images map to hand-tuned boxes; user uploads get the
 * generic scenario.
 */
export class MockVisualSearchService implements VisualSearchService {
  readonly source: DetectionSource = "mock";

  /** Artificial latency so the scanning animation is actually visible. */
  constructor(private readonly latencyMs = 1400) {}

  async analyze(input: VisualSearchInput): Promise<DetectionResult> {
    const startedAt = Date.now();

    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));

    const scenarioKey = input.exampleId ?? "generic";
    const items = MOCK_SCENARIOS[scenarioKey] ?? MOCK_SCENARIOS.generic;

    return makeResult(items, this.source, startedAt, input.imageBase64.slice(0, 256));
  }
}

/* -------------------------------------------------------------------------- */
/*  Google Cloud Vision implementation                                        */
/* -------------------------------------------------------------------------- */

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/** Minimal shape of the parts of the Vision response we consume. */
interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionLocalizedObject {
  name?: string;
  score?: number;
  boundingPoly?: { normalizedVertices?: VisionVertex[] };
}

interface VisionWebEntity {
  description?: string;
  score?: number;
}

interface VisionColorInfo {
  color?: { red?: number; green?: number; blue?: number };
  pixelFraction?: number;
  score?: number;
}

interface VisionAnnotateResponse {
  responses?: Array<{
    localizedObjectAnnotations?: VisionLocalizedObject[];
    webDetection?: { webEntities?: VisionWebEntity[] };
    imagePropertiesAnnotation?: {
      dominantColors?: { colors?: VisionColorInfo[] };
    };
    error?: { message?: string };
  }>;
}

function toHex(color: VisionColorInfo["color"]): string {
  const channel = (value: number | undefined) =>
    Math.max(0, Math.min(255, Math.round(value ?? 0)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(color?.red)}${channel(color?.green)}${channel(color?.blue)}`;
}

/**
 * Converts Vision's normalized vertex polygon into our `BoundingBox`.
 * Vision returns four vertices; we take the axis-aligned extent of them.
 */
function toBoundingBox(vertices: VisionVertex[] | undefined) {
  if (!vertices || vertices.length === 0) return null;

  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);

  const minX = Math.max(0, Math.min(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxX = Math.min(1, Math.max(...xs));
  const maxY = Math.min(1, Math.max(...ys));

  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0.01 || height <= 0.01) return null;

  return { x: minX, y: minY, width, height };
}

/**
 * Real integration against Google Cloud Vision.
 *
 * Pipeline:
 *   OBJECT_LOCALIZATION -> what & where (bounding boxes)
 *   WEB_DETECTION       -> richer, brand-aware naming for those objects
 *   IMAGE_PROPERTIES    -> dominant colour used for the swatch + colour filter
 *
 * Product resolution is deliberately left behind `findProductsForLabel`: that
 * is the one call to replace when a live merchant feed / embedding index is
 * available. Everything above it is production-shaped already.
 */
export class GoogleVisionSearchService implements VisualSearchService {
  readonly source: DetectionSource = "google-vision";

  constructor(
    private readonly apiKey: string,
    private readonly maxItems = 8,
  ) {}

  async analyze(input: VisualSearchInput): Promise<DetectionResult> {
    const startedAt = Date.now();

    const response = await fetch(`${VISION_ENDPOINT}?key=${this.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: input.imageBase64 },
            features: [
              { type: "OBJECT_LOCALIZATION", maxResults: 20 },
              { type: "WEB_DETECTION", maxResults: 10 },
              { type: "IMAGE_PROPERTIES" },
            ],
          },
        ],
      }),
      // Vision is a slow-ish call; fail fast rather than hanging the request.
      signal: AbortSignal.timeout(20_000),
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

    const dominantHex = toHex(
      annotation?.imagePropertiesAnnotation?.dominantColors?.colors?.[0]?.color,
    );

    /**
     * Web entities give us fashion-savvy phrasing ("biker jacket") that object
     * localisation alone lacks ("Outerwear"). We pair the highest-scoring
     * entity that shares a category with each detected object.
     */
    const webEntities = (annotation?.webDetection?.webEntities ?? [])
      .filter((entity): entity is Required<VisionWebEntity> =>
        Boolean(entity.description && entity.score),
      )
      .sort((a, b) => b.score - a.score);

    const items: DetectedItem[] = [];
    const usedEntities = new Set<string>();

    for (const object of annotation?.localizedObjectAnnotations ?? []) {
      if (items.length >= this.maxItems) break;

      const name = object.name?.trim();
      if (!name) continue;

      const category = categorizeLabel(name);
      if (!category) continue;

      const boundingBox = toBoundingBox(object.boundingPoly?.normalizedVertices);
      if (!boundingBox) continue;

      const entity = webEntities.find(
        (candidate) =>
          !usedEntities.has(candidate.description) &&
          categorizeLabel(candidate.description) === category,
      );

      if (entity) usedEntities.add(entity.description);

      const label = entity?.description ?? name;
      const { exactMatch, alternatives } = findProductsForLabel(label, category);

      items.push({
        id: `gv-${items.length}-${name.toLowerCase().replace(/\s+/g, "-")}`,
        label,
        itemType: name,
        category,
        attributes: `${name} • ${Math.round((object.score ?? 0) * 100)}% match`,
        description: `Detected as "${name}" with ${Math.round((object.score ?? 0) * 100)}% confidence.`,
        confidence: object.score ?? 0,
        boundingBox,
        colorHex: dominantHex,
        exactMatch,
        alternatives,
      });
    }

    return makeResult(items, this.source, startedAt, input.imageBase64.slice(0, 256));
  }
}

/* -------------------------------------------------------------------------- */
/*  Factory                                                                   */
/* -------------------------------------------------------------------------- */

/** True when real credentials are present and mocking is not forced on. */
export function isVisionConfigured(): boolean {
  return (
    Boolean(process.env.GOOGLE_CLOUD_VISION_API_KEY) &&
    process.env.USE_MOCK_VISION !== "true"
  );
}

/**
 * Returns the engine to use for this request.
 *
 * Falls back to the mock whenever credentials are missing, so `npm run dev`
 * on a fresh clone produces a complete, clickable experience.
 */
export function getVisualSearchService(): VisualSearchService {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (apiKey && process.env.USE_MOCK_VISION !== "true") {
    return new GoogleVisionSearchService(apiKey);
  }

  return new MockVisualSearchService();
}
