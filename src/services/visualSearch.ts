import "server-only";

import type {
  BoundingBox,
  DetectedItem,
  DetectionResult,
  DetectionSource,
  ExampleId,
  ItemCategory,
  PrimaryCategory,
} from "@/types";
import { nonMaxSuppression } from "@/lib/boundingBoxNms";
import { cropNormalizedRoi } from "@/lib/imageRoi";
import { colorNameFromHex } from "@/lib/searchQueryColors";
import {
  buildExactMatchQuery,
  extractApparelGender,
  extractMaterialsAndPatterns,
  extractTopsSubtype,
} from "@/lib/searchQueryBuilder";
import {
  familyFromPrimary,
  primaryCategoryOf,
} from "@/lib/primaryCategory";
import {
  LIVE_EXTRACT_BUDGET_MS,
  LIVE_EXTRACT_DEADLINE_MS,
  LIVE_REQUEST_TIMEOUT_MS,
  VISION_DEADLINE_MS,
  raceTimeout,
} from "@/lib/timeouts";
import { passesWhitelistSanitizer } from "@/utils/sanitizer";
import {
  MOCK_SCENARIOS,
  findProductsForLabel,
  hydrateItems,
  hydrateProduct,
  retargetSearchQuery,
} from "@/services/mockCatalog";
import { ContextDevService } from "@/services/contextDevService";
import {
  ContextDevProductProvider,
  MockProductProvider,
  sanitizeDetectedItem,
  type ProductProvider,
} from "@/services/productProvider";
import { pickExactAndRest, BIREBIR_HIGH_CONFIDENCE_TAG } from "@/services/reRanker";
import {
  LOCALIZE_VISION_FEATURES,
  ROI_VISION_FEATURES,
  annotateVisionImage,
  bestLogoBrand,
  parseLogoAnnotations,
  parseWebEntities,
  toHex,
  type VisionAnnotation,
  type VisionWebEntity,
} from "@/services/visionService";

/** Vision score floor — below this the detection is noise, not a garment. */
const MIN_VISION_SCORE = 0.65;

/** Cap after NMS so a 3-piece look stays a 3–4 hotspot scan. */
const MAX_DETECTIONS = 4;
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
      hydrateItems(scenario).map(sanitizeDetectedItem),
      this.source,
      startedAt,
      input.imageBase64.slice(0, 256),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Google Cloud Vision implementation                                        */
/* -------------------------------------------------------------------------- */

type VisionCandidate = {
  name: string;
  score: number;
  boundingBox: BoundingBox;
  category: ItemCategory;
  primaryCategory: PrimaryCategory;
};

type RoiEnrichment = {
  webEntities: Array<Required<VisionWebEntity>>;
  bestGuess: string[];
  dominantHex: string;
  brandLogo: string | null;
  webEntityScore: number | null;
};

/**
 * Converts Vision's normalized vertex polygon into our `BoundingBox`.
 * Vision returns four vertices; we take the axis-aligned extent of them.
 */
function toBoundingBox(vertices: { x?: number; y?: number }[] | undefined) {
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
 * Pipeline (hard deadline {@link VISION_DEADLINE_MS}):
 *   1. OBJECT_LOCALIZATION on the full frame → boxes + coarse labels
 *   2. Auto-crop each box ROI in memory
 *   3. WEB_DETECTION + IMAGE_PROPERTIES + LOGO_DETECTION on each ROI
 *
 * Product resolution stays behind `findProductsForLabel` / the live provider.
 */
export class GoogleVisionSearchService implements VisualSearchService {
  readonly source: DetectionSource = "google-vision";

  constructor(
    private readonly apiKey: string,
    private readonly maxItems = MAX_DETECTIONS,
    private readonly minScore = MIN_VISION_SCORE,
  ) {}

  async analyze(input: VisualSearchInput): Promise<DetectionResult> {
    const startedAt = Date.now();
    const budget = raceTimeout(VISION_DEADLINE_MS, input.signal);

    try {
      const candidates = await this.localizeObjects(input, budget.signal);
      const fallbackColor = "#808080";

      const enrichments = await this.enrichRois(
        input,
        candidates,
        budget.signal,
      );

      const items: DetectedItem[] = [];
      const usedEntities = new Set<string>();

      for (let index = 0; index < candidates.length; index += 1) {
        const object = candidates[index]!;
        const roi = enrichments[index];
        const webEntities = roi?.webEntities ?? [];
        const bestGuess = roi?.bestGuess ?? [];
        const dominantHex = roi?.dominantHex ?? fallbackColor;
        const brandLogo = roi?.brandLogo ?? null;

        const entity =
          webEntities.find((candidate) => {
            if (usedEntities.has(candidate.description)) return false;
            return primaryCategoryOf(candidate.description) === object.primaryCategory;
          }) ??
          webEntities.find((candidate) => {
            if (usedEntities.has(candidate.description)) return false;
            return categorizeLabel(candidate.description) === object.category;
          });

        if (entity) usedEntities.add(entity.description);

        const phrase =
          entity?.description ??
          bestGuess.find((guess) => primaryCategoryOf(guess) === object.primaryCategory) ??
          undefined;

        const colorName = colorNameFromHex(dominantHex);
        const featureSource = [phrase, object.name, bestGuess.join(" ")]
          .filter(Boolean)
          .join(" ");
        const { materials, patterns } = extractMaterialsAndPatterns(featureSource);
        const topsSubtype =
          object.primaryCategory === "TOPS"
            ? extractTopsSubtype(featureSource)
            : null;
        const gender = extractApparelGender(featureSource);

        const label = [brandLogo, colorName, phrase ?? object.name]
          .filter(Boolean)
          .join(" ");

        const searchQuery = buildExactMatchQuery({
          primaryCategory: object.primaryCategory,
          itemType: object.name,
          webEntity: phrase,
          label,
          colorHex: dominantHex,
          colorName,
          brandLogo,
          materials,
          patterns,
          topsSubtype,
          gender,
        });

        const { exactMatch, alternatives } = findProductsForLabel(
          `${brandLogo ?? ""} ${phrase ?? object.name} ${searchQuery}`,
          object.category,
          familyFromPrimary(object.primaryCategory),
        );

        const colorOpts = {
          colorHex: dominantHex,
          colorName,
          enforceColor: true as const,
          topsSubtype,
          gender,
        };

        const pool = [
          ...(exactMatch
            ? [hydrateProduct(retargetSearchQuery(exactMatch, searchQuery))]
            : []),
          ...alternatives.map((product) =>
            hydrateProduct(retargetSearchQuery(product, searchQuery)),
          ),
        ].filter((product) =>
          passesWhitelistSanitizer(
            object.primaryCategory,
            {
              title: product.title,
              productUrl: product.productUrl,
              brand: product.brand,
            },
            colorOpts,
          ),
        );

        const ranked = pickExactAndRest(
          {
            primaryCategory: object.primaryCategory,
            colorHex: dominantHex,
            colorName,
            webEntity: phrase,
            webEntityScore: entity?.score ?? roi?.webEntityScore,
            brandLogo,
            attributes: [colorName, ...materials, ...patterns].filter(Boolean).join(" • "),
            label,
            itemType: object.name,
            materials,
            patterns,
            topsSubtype,
            gender,
          },
          pool.map((product) => ({
            ...product,
            priorSimilarity: product.similarity,
          })),
        );

        const hydratedExact = ranked.exact
          ? {
              ...ranked.exact.candidate,
              matchType: "exact" as const,
              similarity: ranked.exact.score,
              tag: ranked.exact.forcedBasicExact
                ? BIREBIR_HIGH_CONFIDENCE_TAG
                : ranked.exact.score >= 0.95
                  ? BIREBIR_HIGH_CONFIDENCE_TAG
                  : "Birebir Eşleşme",
            }
          : null;

        const hydratedAlts = ranked.rest
          .filter((entry) => entry.candidate.price < (hydratedExact?.price ?? Infinity))
          .slice(0, 3)
          .map((entry) => ({
            ...entry.candidate,
            matchType: "alternative" as const,
            similarity: entry.score,
            tag: "Bütçe Dostu Muadil",
          }));

        const attrParts = [
          brandLogo,
          colorName,
          ...materials,
          ...patterns,
          object.name,
        ].filter(Boolean);

        items.push(
          sanitizeDetectedItem({
            id: `gv-${items.length}-${object.name.toLowerCase().replace(/\s+/g, "-")}`,
            label,
            itemType: object.name,
            category: object.category,
            primaryCategory: object.primaryCategory,
            attributes: attrParts.join(" • "),
            description:
              `Görselde "${object.name}" olarak tespit edildi ` +
              `(%${Math.round(object.score * 100)} güven, ${object.primaryCategory}` +
              `${brandLogo ? `, logo: ${brandLogo}` : ""}). ` +
              `Arama sorgusu: "${searchQuery}".`,
            confidence: object.score,
            boundingBox: object.boundingBox,
            colorHex: dominantHex,
            webEntity: phrase,
            webEntityScore: entity?.score ?? roi?.webEntityScore ?? undefined,
            brandLogo: brandLogo ?? undefined,
            materials,
            patterns,
            topsSubtype: topsSubtype ?? undefined,
            gender: gender ?? undefined,
            exactMatch: hydratedExact,
            alternatives: hydratedAlts,
          }),
        );
      }

      return makeResult(items, this.source, startedAt, input.imageBase64.slice(0, 256));
    } finally {
      budget.clear();
    }
  }

  /** Pass 1 — localize shoppable objects on the full frame. */
  private async localizeObjects(
    input: VisualSearchInput,
    signal: AbortSignal,
  ): Promise<VisionCandidate[]> {
    const annotation = await annotateVisionImage(
      this.apiKey,
      input.imageBase64,
      LOCALIZE_VISION_FEATURES,
      signal,
    );

    const rawCandidates: VisionCandidate[] = [];

    for (const object of annotation?.localizedObjectAnnotations ?? []) {
      const name = object.name?.trim();
      if (!name) continue;

      const score = object.score ?? 0;
      if (score < this.minScore) continue;

      const category = categorizeLabel(name);
      if (!category) continue;

      const boundingBox = toBoundingBox(object.boundingPoly?.normalizedVertices);
      if (!boundingBox) continue;

      const primary = primaryCategoryOf(name);
      if (primary === "UNKNOWN") continue;

      rawCandidates.push({
        name,
        score,
        boundingBox,
        category,
        primaryCategory: primary,
      });
    }

    return nonMaxSuppression(rawCandidates, {
      iouThreshold: 0.4,
      centerRadius: 0.08,
      maxItems: this.maxItems,
    });
  }

  /**
   * Pass 2 — crop each box and run WEB_DETECTION + IMAGE_PROPERTIES + LOGO_DETECTION.
   * Falls back to empty enrichment (caller uses coarse label + grey) on timeout.
   */
  private async enrichRois(
    input: VisualSearchInput,
    candidates: VisionCandidate[],
    signal: AbortSignal,
  ): Promise<Array<RoiEnrichment | null>> {
    if (candidates.length === 0 || signal.aborted) {
      return candidates.map(() => null);
    }

    return Promise.all(
      candidates.map(async (candidate) => {
        if (signal.aborted) return null;

        try {
          const cropped = await cropNormalizedRoi(
            input.imageBase64,
            input.mimeType,
            candidate.boundingBox,
          );
          const content = cropped?.base64 ?? input.imageBase64;

          const annotation = await annotateVisionImage(
            this.apiKey,
            content,
            ROI_VISION_FEATURES,
            signal,
          );

          if (!annotation) return null;

          return this.parseRoiAnnotation(annotation);
        } catch (error) {
          if (signal.aborted) return null;
          console.warn("[vision] ROI enrichment failed:", error);
          return null;
        }
      }),
    );
  }

  private parseRoiAnnotation(annotation: VisionAnnotation): RoiEnrichment {
    const webEntities = parseWebEntities(annotation);
    const logos = parseLogoAnnotations(annotation.logoAnnotations);

    return {
      webEntities,
      bestGuess:
        annotation.webDetection?.bestGuessLabels
          ?.map((entry) => entry.label?.trim())
          .filter((label): label is string => Boolean(label)) ?? [],
      dominantHex: toHex(
        annotation.imagePropertiesAnnotation?.dominantColors?.colors?.[0]?.color,
      ),
      brandLogo: bestLogoBrand(logos),
      webEntityScore: webEntities[0]?.score ?? null,
    };
  }
}

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
      requestTimeoutMs: readInt(
        process.env.CONTEXT_DEV_REQUEST_TIMEOUT_MS,
        LIVE_REQUEST_TIMEOUT_MS,
      ),
      extractBudgetMs: readInt(
        process.env.CONTEXT_DEV_EXTRACT_BUDGET_MS,
        LIVE_EXTRACT_BUDGET_MS,
      ),
    }),
    {
      maxLiveItems: readInt(process.env.CONTEXT_DEV_MAX_LIVE_ITEMS, 4),
      deadlineMs: readInt(process.env.CONTEXT_DEV_DEADLINE_MS, LIVE_EXTRACT_DEADLINE_MS),
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
