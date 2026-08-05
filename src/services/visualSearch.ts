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
import { familyOf, tokenize, type ItemFamily } from "@/lib/itemFamily";
import { attributeSearchQuery, buildSearchQuery, colorNameFromHex } from "@/lib/searchQuery";
import {
  MOCK_SCENARIOS,
  findProductsForLabel,
  hydrateItems,
  hydrateProduct,
  retargetSearchQuery,
} from "@/services/mockCatalog";
import { ContextDevService } from "@/services/contextDevService";
import {
  getAttributeExtractor,
  type GarmentAttributes,
} from "@/services/attributeExtractor";
import { createTrace, type TraceCollector } from "@/lib/scanTrace";
import { foregroundFilter, learnBackdrop } from "@/services/foreground";
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
  /**
   * Run without the paid enrichment stages.
   *
   * Set when the daily budget is nearly spent (`rateLimit.ts`). Detection still
   * runs and the answer is real; the model attribute pass and the live product
   * lookup — where most of the per-scan cost is — are skipped, so the last scans
   * of a day are cheap rather than the ceiling arriving with no warning.
   */
  budgetConstrained?: boolean;
  /**
   * Where this scan records what it did — see `lib/scanTrace.ts`.
   *
   * Optional so every existing caller (the eval, the tests, the mock engine)
   * keeps working untouched; a scan with no collector simply is not observed.
   */
  trace?: TraceCollector;
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

/**
 * Families that belong to each section of the results pane.
 *
 * The routing is delegated to `familyOf` rather than kept as a second keyword
 * list, because there was a second keyword list and it matched on **substrings**:
 *
 *     "Chair"      -> contains "hair"  -> beauty
 *     "Flip-flops" -> contains "lip"   -> beauty
 *     "Eyewear"    -> contains "eye"   -> beauty
 *
 * A room photograph produced a cosmetics hotspot on a chair. This is the same
 * defect that was fixed in `itemFamily.ts` — "coated" reading as coat, "crossbody"
 * as a bodysuit — and this function was simply missed in that pass. One taxonomy,
 * token-aware, is the fix for both.
 */
const BEAUTY_FAMILIES = new Set<ItemFamily>(["lips", "eyes", "face"]);

const CLOTHING_FAMILIES = new Set<ItemFamily>([
  "footwear",
  "outerwear",
  "top",
  "bottom",
  "dress",
  "bag",
  "headwear",
  "accessory",
]);

/**
 * Whole-token fallbacks for labels the family classifier has no opinion on.
 *
 * Vision's coarse classes ("Clothing") and the person-attribute labels ("Hair",
 * "Skin") are not garments, so they have no family — but they are still the right
 * section, and the generic ones have to survive as candidates for
 * `dedupeDetections` to suppress against the specific boxes inside them.
 */
const GENERIC_BEAUTY = new Set([
  "cosmetics",
  "cosmetic",
  "makeup",
  "skin",
  "hair",
  "nail",
  "nails",
]);

const GENERIC_CLOTHING = new Set([
  "clothing",
  "apparel",
  "garment",
  "outfit",
  "swimwear",
  "underwear",
]);

export function categorizeLabel(label: string): ItemCategory | null {
  const family = familyOf(label);
  if (BEAUTY_FAMILIES.has(family)) return "beauty";
  if (CLOTHING_FAMILIES.has(family)) return "clothing";

  const tokens = new Set(tokenize(label));
  for (const word of Array.from(GENERIC_BEAUTY)) if (tokens.has(word)) return "beauty";
  for (const word of Array.from(GENERIC_CLOTHING)) if (tokens.has(word)) return "clothing";

  // Furniture, plants, people, everything else: not shoppable for us.
  return null;
}

/** Human-readable one-liner for the detail panel, e.g. "pudra triko fermuarlı ceket". */
function describeAttributes(attrs: GarmentAttributes): string {
  return [
    attrs.colorName,
    attrs.pattern,
    attrs.material,
    ...attrs.details,
    attrs.fit,
    attrs.garmentType,
  ]
    .filter(Boolean)
    .join(" ");
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

/**
 * Vision adresi, sahte bir sunucuya çevrilebilsin diye.
 *
 * `VLM_BASE_URL`, `CONTEXT_DEV_BASE_URL` ve `LINK_CHECK_BASE_URL` ile aynı desen.
 * Buradaki gerekçe ayrıca somut: dedektör çöktüğünde uygulamanın hata vermek
 * yerine kataloğa düşmesi tasarımın en kritik davranışlarından biri ve hiç
 * sürülmemişti — sürmenin tek yolu gerçek bir Vision kesintisi beklemekti.
 * Üretimde boş, yani davranış değişmiyor.
 */
const VISION_BASE_URL = (
  process.env.VISION_BASE_URL?.trim().replace(/\/$/, "") || "https://vision.googleapis.com"
);
const VISION_ENDPOINT = `${VISION_BASE_URL}/v1/images:annotate`;

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
    // A collector is always present inside the method so the instrumentation reads
    // straight-line; a caller that supplied none just never asks for the result.
    const trace = input.trace ?? createTrace({ detail: false });

    const response = await trace.stage("vision", () =>
      fetch(`${VISION_ENDPOINT}?key=${this.apiKey}`, {
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
      }),
    );

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

      const box = toBoundingBox(object.boundingPoly?.normalizedVertices);
      if (!box) continue;

      const score = object.score ?? 0;

      // Person, furniture, plants: not shoppable, and Person has already been
      // harvested above as the geometric frame.
      if (!categorizeLabel(name)) {
        trace.drop({ name, score, box, reason: "alışverişlik sınıf değil" });
        continue;
      }

      const family = familyOf(name);

      // A garment cannot be where the body says it is not.
      if (!familyFitsBody(family, bodyPosition(box, personBox))) {
        trace.drop({
          name,
          score,
          box,
          reason: `vücut kuralı: ${family} parçası ${bodyPosition(box, personBox)} bölgesinde olamaz`,
        });
        continue;
      }

      candidates.push({ name, score, box, family });
    }

    const detections = dedupeDetections(candidates, { maxItems: this.maxItems });

    /*
     * What the cleanup removed, by difference.
     *
     * `dedupeDetections` does not report reasons and should not have to — it is a
     * pure function over boxes, and threading a log through it would make it harder
     * to test than the thing it explains. Diffing its input against its output says
     * which candidates went, which is the question anyone reading this actually has.
     */
    const kept = new Set(detections.map((detection) => detection.box));
    for (const candidate of candidates) {
      if (!kept.has(candidate.box)) {
        trace.drop({
          name: candidate.name,
          score: candidate.score,
          box: candidate.box,
          reason: "temizlikte elendi (güven eşiği, örtüşme, içerme ya da parça sınırı)",
        });
      }
    }

    trace.count("rawDetections", objects.length);
    trace.count("keptDetections", detections.length);

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

    /*
     * Foreground separation — see `services/foreground.ts`.
     *
     * The backdrop is learned from pixels lying outside every detection *and*
     * outside the person, which makes them background by construction rather than
     * by assumption; skin comes from the standard chrominance rules. Both are what
     * a rectangle cannot tell apart from the garment inside it, and both are why
     * four items on the eval set were measuring the studio wall.
     *
     * It abstains rather than guesses: on a street photograph the area outside the
     * boxes is a scene and not a backdrop, and treating a scene's colours as
     * removable deletes a black jacket that matches the wall behind it. Measured on
     * the eval set the two street looks come back bit-identical, which is the point.
     */
    const backdrop = size
      ? await trace.stage("foreground", () =>
          learnBackdrop(imageBuffer, {
            size,
            boxes: [
              ...detections.map((detection) => detection.box),
              ...(personBox ? [personBox] : []),
            ],
          }),
        )
      : null;
    const foreground = foregroundFilter(backdrop);

    if (!backdrop) {
      // Not a failure — the abstention is the feature. Recorded because "the wall
      // was not removed" explains a colour that reads as background, and that is
      // the first thing to check when a swatch looks wrong.
      trace.degrade("foreground", "fon öğrenilemedi (sahne, fon değil) — yalnızca ten çıkarıldı");
    }

    const regionColors = await trace.stage("regionColor", () => Promise.all(
      detections.map((detection) =>
        size
          ? regionDominantColor(imageBuffer, detection.box, {
              size,
              foreground,
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
    ));

    /*
     * Garment attributes from the crops.
     *
     * The measured colour above is a property of a *rectangle*; this is a
     * description of the garment inside it. Where the two disagree — the beanie
     * whose box is mostly studio wall — the model's answer is the one a shopper
     * would recognise. Off unless `ENABLE_VLM_ATTRIBUTES=true` and a key is set;
     * every item that fails to be described keeps the measured colour and Vision's
     * class, which is exactly what shipped before this stage existed.
     */
    const extractor = input.budgetConstrained ? null : getAttributeExtractor();
    if (input.budgetConstrained) {
      trace.degrade("vlm", "günlük bütçe eşiğinde — ücretli aşama atlandı");
    } else if (!extractor) {
      /*
       * Kapalı bir aşama, sessiz bir aşama olmamalı.
       *
       * Üretimde `describedItems: 0` görüldü ve `degraded` bu konuda **tek kelime**
       * etmiyordu: aşağıdaki uyarı `extractor &&` ile korumalı olduğu için, aşama
       * hiç kurulmadığında hiçbir not düşülmüyordu. Sonuç, panelde ayırt edilemeyen
       * iki bambaşka durum — «aşama kapalı» ile «aşama çalıştı ama betimleyemedi».
       * İlki bir yapılandırma eksiği, ikincisi bir doğruluk sorunu; ikisine
       * bakarken yapılacak iş de farklı.
       *
       * Hangi koşulun eksik olduğu ayrı ayrı yazılıyor, çünkü «kapalı» demek
       * kullanıcıyı iki ayrı ortam değişkenini de kontrol etmeye gönderirdi.
       */
      const reason = !process.env.ANTHROPIC_API_KEY?.trim()
        ? "ANTHROPIC_API_KEY yok"
        : "ENABLE_VLM_ATTRIBUTES=true değil";

      trace.degrade(
        "vlm",
        `öznitelik betimlemesi kapalı (${reason}) — ölçülen renge ve Vision sınıfına düşüldü`,
      );
    }

    const attributes =
      extractor && size
        ? await trace.stage("vlm", () =>
            extractor.extract(
              imageBuffer,
              // In `dedupeDetections`' own order — named families before "unknown",
              // then confidence — so if the item budget truncates the list it drops
              // the least identifiable detections rather than an arbitrary slice.
              detections.map((detection, index) => ({
                key: String(index),
                box: detection.box,
                itemType: detection.name,
              })),
              { size, signal: input.signal },
            ),
          )
        : new Map<string, GarmentAttributes>();

    trace.count("describedItems", attributes.size);
    if (extractor && attributes.size < detections.length) {
      trace.degrade(
        "vlm",
        `${detections.length - attributes.size}/${detections.length} parça betimlenemedi — ` +
          "ölçülen renge ve Vision sınıfına düşüldü",
      );
    }

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

    /*
     * Indexed rather than pushed-and-counted: `regionColors` is built from
     * `detections`, so reading it at `items.length` only worked because nothing in
     * this loop can `continue`. That is a coincidence one guard away from silently
     * shifting every colour by one.
     */
    for (const [index, detection] of Array.from(detections.entries())) {
      const { name, box } = detection;
      const category = categorizeLabel(name);
      if (!category) continue;

      const attrs = attributes.get(String(index)) ?? null;

      /*
       * Family stays Vision's, with one exception: when Vision could only manage a
       * generic class ("Clothing") and the model named something specific, the
       * specific name is adopted — but only if it is not physically contradicted by
       * where the box sits on the body. A *conflict* between the two is resolved in
       * Vision's favour, because the family gates which catalogue rows are eligible
       * and Vision's class is tied to the box it drew.
       */
      const attrFamily = attrs ? familyOf(attrs.garmentType) : "unknown";
      const family =
        detection.family === "unknown" &&
        attrFamily !== "unknown" &&
        familyFitsBody(attrFamily, bodyPosition(box, personBox))
          ? attrFamily
          : detection.family;

      /*
       * The web entity is only consulted when the crop was not described. It names
       * the photograph, not the garment; once something has actually looked at this
       * region, that reading wins.
       */
      const entity = attrs
        ? undefined
        : webEntities.find(
            (candidate) =>
              !usedEntities.has(candidate.description) &&
              familyOf(candidate.description) === family &&
              family !== "unknown",
          );
      if (entity) usedEntities.add(entity.description);

      // Measured colour is the fallback; the crop reading is preferred, because the
      // measurement describes the rectangle and this describes the garment.
      const colorHex = attrs?.colorHex ?? regionColors[index] ?? imageDominantHex;
      const colorName = attrs?.colorName ?? colorNameFromHex(colorHex);
      const phrase = entity?.description;
      const itemName = attrs?.garmentType ?? name;

      const label = [colorName, attrs?.garmentType ?? phrase ?? name]
        .filter(Boolean)
        .join(" ");

      /*
       * Two paths, because they are genuinely different questions. With a described
       * crop the query is built from what was seen in it — that assembly lives in
       * `attributeSearchQuery` so the eval can score the query the user actually
       * gets. Without one, all there is to work with is the detector's class, the
       * web entity and a measured colour.
       */
      const searchQuery = attrs
        ? attributeSearchQuery(attrs)
        : buildSearchQuery({
            itemType: itemName,
            label: phrase,
            colorName: colorName ?? undefined,
            colorHex,
          });

      /*
       * The descriptive phrase and the query only pick the best row *within* the
       * family; the family itself is the gate. The chosen rows then get their text
       * search repointed at this detection.
       */
      const { exactMatch, alternatives } = findProductsForLabel(
        `${attrs?.garmentType ?? phrase ?? name} ${searchQuery}`,
        category,
        family,
      );

      items.push({
        id: `gv-${index}-${name.toLowerCase().replace(/\s+/g, "-")}`,
        label,
        itemType: itemName,
        category,
        attributes: [colorName, attrs?.material, attrs?.pattern, itemName]
          .filter(Boolean)
          .join(" • "),
        description:
          `Görselde "${name}" olarak tespit edildi ` +
          `(%${Math.round(detection.score * 100)} güven). ` +
          (attrs ? `Kırpım analizi: ${describeAttributes(attrs)}. ` : "") +
          `Arama sorgusu: "${searchQuery}".`,
        confidence: detection.score,
        boundingBox: box,
        colorHex,
        // The same ruling the catalogue was gated on, so the live stage rejects
        // rows against it rather than re-deriving a possibly different answer.
        family,
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

    // Budget-constrained scans keep their catalogue products: the live lookup is a
    // search plus several extracts per detection, which is the expensive half.
    if (input.budgetConstrained) {
      input.trace?.degrade("products", "günlük bütçe eşiğinde — canlı ürün araması atlandı");
      return { ...detected, productSource: "mock", liveItemCount: 0 };
    }

    try {
      /*
       * The pixels travel with the detections. Product resolution compares a
       * retailer's photo against the region that was actually scanned, so it needs
       * the upload — decoded once here rather than in each stage.
       */
      const buffer = Buffer.from(input.imageBase64, "base64");

      const image = { buffer, size: (await imageSize(buffer)) ?? undefined };
      const enrich = () =>
        this.products.enrich(detected, { signal: input.signal, image, trace: input.trace });

      const enriched = input.trace
        ? await input.trace.stage("products", enrich)
        : await enrich();

      /*
       * Only a degradation when a live provider was actually asked. The mock
       * provider returning catalogue rows is the design, not a fallback, and
       * logging it as one would make every offline scan look broken — which is the
       * fastest way to teach everyone to ignore the field.
       */
      if (
        this.products.source !== "mock" &&
        enriched.liveItemCount === 0 &&
        detected.items.length > 0
      ) {
        input.trace?.degrade("products", "canlı satır bulunamadı — katalog fiyatlarında kalındı");
      }

      return enriched;
    } catch (error) {
      // The provider is written not to throw, but a bug there must never cost
      // the user their detections — the catalogue products are already valid.
      console.error("[products] provider threw, keeping catalogue products:", error);
      input.trace?.degrade("products", "sağlayıcı hata verdi — katalog ürünleri korundu");
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
      visualCandidates: readInt(process.env.VISUAL_RERANK_CANDIDATES, 4),
      // On by default: it costs no credits, only a few small image fetches, and
      // without it the match score on a live card is text agreement alone.
      visualRerank: process.env.VISUAL_RERANK !== "false",
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
  warnIfOverBudget();
  return new ComposedVisualSearchService(getDetector(), getProductProvider());
}

/**
 * Vercel kills `/api/detect` at `maxDuration = 60`, and the stages are
 * sequential: Vision, then the attribute pass, then live products. Each has its
 * own deadline, and each deadline produces a *working* page — a platform kill
 * produces an error page. So the sum has to stay under the limit, and the
 * attribute stage arriving after the Context.dev budget was set means the two can
 * now add up past it without anyone noticing until a scan dies in production.
 */
function warnIfOverBudget(): void {
  if (process.env.ENABLE_VLM_ATTRIBUTES !== "true") return;

  const vlm = readInt(process.env.VLM_DEADLINE_MS, 15_000);
  const products = isContextDevConfigured()
    ? readInt(process.env.CONTEXT_DEV_DEADLINE_MS, 45_000)
    : 0;

  // ~15s of headroom for Vision itself plus serialising the response.
  const budget = 45_000;

  if (vlm + products > budget) {
    console.warn(
      `[detect] VLM_DEADLINE_MS (${vlm}) + CONTEXT_DEV_DEADLINE_MS (${products}) = ` +
        `${vlm + products}ms, which leaves too little of the 60s function budget for ` +
        "Vision. Lower CONTEXT_DEV_DEADLINE_MS, or a slow scan will be killed by the " +
        "platform instead of degrading gracefully.",
    );
  }
}
