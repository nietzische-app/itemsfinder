import "server-only";

import type {
  BoundingBox,
  DetectedItem,
  DetectionResult,
  DetectionSource,
  ExampleId,
  ItemCategory,
} from "@/types";
import {
  boxArea,
  bodyPosition,
  dedupeDetections,
  familyFitsBody,
  intersectionArea,
  type DetectionCandidate,
} from "@/lib/detectionFilter";
import { familyOf } from "@/lib/itemFamily";
import { buildSearchQuery, colorNameFromHex } from "@/lib/searchQuery";
import {
  MOCK_SCENARIOS,
  findProductsForLabel,
  hydrateItems,
  hydrateProduct,
  retargetSearchQuery,
} from "@/services/mockCatalog";
import { ContextDevService } from "@/services/contextDevService";
import { imageSize, regionDominantColor } from "@/services/regionColor";
import {
  ContextDevProductProvider,
  MockProductProvider,
  type ProductProvider,
} from "@/services/productProvider";

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
  /** Cancels in-flight work when the caller gives up on the request. */
  signal?: AbortSignal;
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
    // Detection only ever produces catalogue products; the product provider
    // stage upgrades these fields if it resolves live inventory.
    productSource: "mock",
    liveItemCount: 0,
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
    const scenario = MOCK_SCENARIOS[scenarioKey] ?? MOCK_SCENARIOS.generic;

    return makeResult(
      hydrateItems(scenario),
      this.source,
      startedAt,
      input.imageBase64.slice(0, 256),
    );
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

    const imageDominantHex = toHex(
      annotation?.imagePropertiesAnnotation?.dominantColors?.colors?.[0]?.color,
    );

    const objects = annotation?.localizedObjectAnnotations ?? [];

    /*
     * The "Person" box used to be discarded. It is a free geometric prior: a
     * garment's height relative to the person tells us head / upper / lower /
     * feet, which is enough to throw out contradictions like a "Top" detected at
     * ankle height.
     */
    const personBox = objects
      .filter((object) => /person|human|woman|man|girl|boy/i.test(object.name ?? ""))
      .map((object) => toBoundingBox(object.boundingPoly?.normalizedVertices))
      .filter((box): box is BoundingBox => box !== null)
      .sort((a, b) => boxArea(b) - boxArea(a))[0] ?? null;

    /*
     * Raw detections -> shoppable candidates.
     *
     * Vision reports the same garment at several granularities and each shoe of a
     * pair separately, so a three-piece outfit arrived as eight-plus hotspots.
     * `dedupeDetections` applies a confidence floor, suppresses nested and
     * overlapping boxes, merges same-family neighbours (the two shoes) and caps
     * the result.
     */
    const candidates: DetectionCandidate[] = [];

    for (const object of objects) {
      const name = object.name?.trim();
      if (!name) continue;

      // Person, furniture, plants: not shoppable, and Person has already been
      // harvested above as the geometric frame.
      if (!categorizeLabel(name)) continue;

      const box = toBoundingBox(object.boundingPoly?.normalizedVertices);
      if (!box) continue;

      const family = familyOf(name);

      // A garment cannot be where the body says it is not.
      if (!familyFitsBody(family, bodyPosition(box, personBox))) continue;

      candidates.push({ name, score: object.score ?? 0, box, family });
    }

    const detections = dedupeDetections(candidates, { maxItems: this.maxItems });

    /*
     * Per-region colour.
     *
     * IMAGE_PROPERTIES describes the whole frame, so applying its dominant colour
     * to every detection made the black shorts and the monochrome sneakers both
     * "pudra" on a photo dominated by a pink cardigan — and colour leads the
     * generated query, so every lookup inherited the error. Each box is sampled
     * locally instead, from bytes we already have.
     */
    const imageBuffer = Buffer.from(input.imageBase64, "base64");
    const size = await imageSize(imageBuffer);
    const regionColors = await Promise.all(
      detections.map((detection) =>
        size
          ? regionDominantColor(imageBuffer, detection.box, {
              size,
              // Garments occlude each other; exclude the neighbours that overlap
              // this box so the sample is this item and not the one on top of it.
              exclude: detections
                .filter(
                  (other) =>
                    other !== detection && intersectionArea(other.box, detection.box) > 0,
                )
                .map((other) => other.box),
            })
          : Promise.resolve(null),
      ),
    );

    /*
     * WEB_DETECTION entities describe the *photograph*, not one garment in it —
     * "street fashion", "photo shoot", sometimes a real product name. They used
     * to be handed out first-come-first-served to whichever detection shared a
     * category, which is how "biker jacket" could end up naming a shoe.
     *
     * An entity is now only used when it names the same family as the detection
     * it is attached to. That keeps the genuinely useful case ("biker jacket" on
     * outerwear) and drops the rest instead of inventing a label.
     */
    const webEntities = (annotation?.webDetection?.webEntities ?? [])
      .filter((entity): entity is Required<VisionWebEntity> =>
        Boolean(entity.description && entity.score),
      )
      .sort((a, b) => b.score - a.score);

    const items: DetectedItem[] = [];
    const usedEntities = new Set<string>();

    for (const detection of detections) {
      const { name, box, family } = detection;
      const category = categorizeLabel(name);
      if (!category) continue;

      const entity = webEntities.find(
        (candidate) =>
          !usedEntities.has(candidate.description) &&
          familyOf(candidate.description) === family &&
          family !== "unknown",
      );
      if (entity) usedEntities.add(entity.description);

      const colorHex = regionColors[items.length] ?? imageDominantHex;
      const phrase = entity?.description;
      const colorName = colorNameFromHex(colorHex);
      const label = [colorName, phrase ?? name].filter(Boolean).join(" ");
      const searchQuery = buildSearchQuery({
        itemType: name,
        label: phrase,
        colorHex,
      });

      /*
       * Family comes from Vision's object class, which is the reliable signal
       * for what kind of garment this is; the descriptive phrase and the query
       * only pick the best row *within* that family. The chosen rows then get
       * their text search repointed at this detection.
       */
      const { exactMatch, alternatives } = findProductsForLabel(
        `${phrase ?? name} ${searchQuery}`,
        category,
        family,
      );

      items.push({
        id: `gv-${items.length}-${name.toLowerCase().replace(/\s+/g, "-")}`,
        label,
        itemType: name,
        category,
        attributes: [colorName, name].filter(Boolean).join(" • "),
        description:
          `Görselde "${name}" olarak tespit edildi ` +
          `(%${Math.round(detection.score * 100)} güven). ` +
          `Arama sorgusu: "${searchQuery}".`,
        confidence: detection.score,
        boundingBox: box,
        colorHex,
        exactMatch: exactMatch
          ? hydrateProduct(retargetSearchQuery(exactMatch, searchQuery))
          : null,
        alternatives: alternatives.map((product) =>
          hydrateProduct(retargetSearchQuery(product, searchQuery)),
        ),
      });
    }

    return makeResult(items, this.source, startedAt, input.imageBase64.slice(0, 256));
  }
}

/* -------------------------------------------------------------------------- */
/*  Factory                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Composition: detector + product provider                                  */
/* -------------------------------------------------------------------------- */

/**
 * Runs a detector, then hands the result to a product provider.
 *
 * Detection and pricing are separate concerns: Cloud Vision decides *what* is
 * in the image, Context.dev decides *what to buy*. Composing them here means
 * either half can be live or mocked independently, and the route stays a
 * single call.
 */
class ComposedVisualSearchService implements VisualSearchService {
  constructor(
    private readonly detector: VisualSearchService,
    private readonly products: ProductProvider,
  ) {}

  get source(): DetectionSource {
    return this.detector.source;
  }

  async analyze(input: VisualSearchInput): Promise<DetectionResult> {
    const detected = await this.detector.analyze(input);

    try {
      return await this.products.enrich(detected, input.signal);
    } catch (error) {
      // The provider is written not to throw, but a bug there must never cost
      // the user their detections — the catalogue products are already valid.
      console.error("[products] provider threw, keeping catalogue products:", error);
      return { ...detected, productSource: "mock", liveItemCount: 0 };
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Factories                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reads the Cloud Vision credential.
 *
 * `GOOGLE_VISION_API_KEY` is accepted as an alias for
 * `GOOGLE_CLOUD_VISION_API_KEY` so either spelling works.
 */
function readVisionApiKey(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ||
    process.env.GOOGLE_VISION_API_KEY?.trim() ||
    undefined
  );
}

/** True when real credentials are present and mocking is not forced on. */
export function isVisionConfigured(): boolean {
  return Boolean(readVisionApiKey()) && process.env.USE_MOCK_VISION !== "true";
}

/** True when live product intelligence is both enabled and credentialled. */
export function isContextDevConfigured(): boolean {
  return (
    Boolean(process.env.CONTEXT_DEV_API_KEY) &&
    process.env.ENABLE_CONTEXT_DEV_LIVE === "true"
  );
}

/**
 * Selects the detector — the engine that decides *what is in the image*.
 *
 * **Google Cloud Vision is the primary engine and always takes precedence
 * when credentialled.** It is the only thing in this codebase that produces
 * bounding boxes, object coordinates and labels from pixels. Context.dev does
 * no detection whatsoever; it runs afterwards, on the labels Vision produced,
 * purely to attach live prices and retailer branding.
 *
 * The mock detector exists as a development fallback only, so a fresh clone
 * runs without credentials. It is never chosen over a configured Vision key.
 */
function getDetector(): VisualSearchService {
  const apiKey = readVisionApiKey();

  if (apiKey && process.env.USE_MOCK_VISION !== "true") {
    return new GoogleVisionSearchService(apiKey);
  }

  if (apiKey && process.env.USE_MOCK_VISION === "true") {
    console.warn(
      "[detect] A Vision key is present but USE_MOCK_VISION=true is forcing the " +
        "mock detector. Unset it to run real detection.",
    );
  } else if (isContextDevConfigured()) {
    // Live prices on mock bounding boxes is a demo configuration, not a
    // production one — say so loudly rather than letting it look complete.
    console.warn(
      "[detect] Live products are enabled but no Cloud Vision key is set, so " +
        "detection is running on the mock engine. Set GOOGLE_VISION_API_KEY " +
        "for real detection.",
    );
  }

  return new MockVisualSearchService();
}

/**
 * Selects the product provider — the engine that decides *what to buy* for
 * labels the detector has already produced. This is a strictly secondary,
 * post-detection enrichment layer.
 *
 * It is chosen independently of the detector so live pricing can be exercised
 * in development without a Vision key; in production both should be live.
 */
function getProductProvider(): ProductProvider {
  const apiKey = process.env.CONTEXT_DEV_API_KEY;

  if (!apiKey || process.env.ENABLE_CONTEXT_DEV_LIVE !== "true") {
    return new MockProductProvider();
  }

  return new ContextDevProductProvider(
    new ContextDevService(apiKey, {
      extractsPerQuery: readInt(process.env.CONTEXT_DEV_EXTRACTS_PER_QUERY, 3),
    }),
    {
      maxLiveItems: readInt(process.env.CONTEXT_DEV_MAX_LIVE_ITEMS, 4),
      deadlineMs: readInt(process.env.CONTEXT_DEV_DEADLINE_MS, 45_000),
    },
  );
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Returns the engine to use for this request.
 *
 * Falls back to mocks whenever credentials are missing, so `npm run dev` on a
 * fresh clone produces a complete, clickable experience.
 */
export function getVisualSearchService(): VisualSearchService {
  return new ComposedVisualSearchService(getDetector(), getProductProvider());
}
