import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { BoundingBox } from "@/types";
import { cropRegion } from "@/services/imageCrop";

/**
 * Garment attribute extraction from region crops.
 *
 * The detector answers *where* and, coarsely, *what*: Cloud Vision returns
 * "Outerwear" with a box. Everything a Turkish shopper would actually type —
 * "fermuarlı triko hırka" — is absent, and the pipeline was filling the gap with
 * a measured dominant colour plus Vision's own class. That produces queries like
 * "Pudra Outerwear", and on four of the fourteen eval items the measured colour is
 * the *background*, because the garment is a minority of its own bounding box
 * (thin sandal straps over a grey floor, a beanie against a studio wall).
 *
 * A threshold cannot separate those cases from a garment that genuinely fills its
 * box — three attempts were measured and rejected, see `regionColor.ts`. Looking
 * at the crop can: the model is asked for the colour *of the named garment*, not
 * the colour of the rectangle.
 *
 * Everything here is best-effort and bounded. Each crop is one independent call,
 * so a refusal, a timeout or a malformed response costs that item its attributes
 * and nothing else — the caller falls back to the measured colour and Vision's
 * class, which is exactly the behaviour that shipped before this existed.
 */

/** One garment as described by the model. Empty strings mean "not determinable". */
export interface GarmentAttributes {
  /** Turkish garment noun a shopper would search, e.g. "triko ceket". */
  garmentType: string;
  /** Turkish colour name for the garment itself. */
  colorName: string;
  /** Approximate sRGB hex of the garment, never of the background. */
  colorHex: string;
  /** "deri", "triko", "denim", "saten"… or null. */
  material: string | null;
  /** "düz", "çizgili", "ekose", "leopar"… or null. */
  pattern: string | null;
  /** Search-worthy details, e.g. ["fermuarlı", "yüksek yaka"]. */
  details: string[];
  /** "oversize", "slim fit", "crop"… or null. */
  fit: string | null;
  /** False when the named garment cannot be identified in the crop. */
  visible: boolean;
  /** The model's own 0..1 confidence in the description. */
  confidence: number;
}

export interface AttributeRequest {
  /** Caller-chosen key used to match the result back to its detection. */
  key: string;
  box: BoundingBox;
  /** Coarse class from the detector, e.g. "Outerwear" or "Footwear". */
  itemType: string;
}

export interface AttributeExtractorOptions {
  /** Model id. Defaults to `claude-opus-5`. */
  model?: string;
  /** Detections to describe per scan. Beyond this, items keep the measured colour. */
  maxItems?: number;
  /** Wall-clock budget for the whole stage. */
  deadlineMs?: number;
  /** Per-call ceiling handed to the SDK. */
  requestTimeoutMs?: number;
  /** Override the API host — used to point the tests at a local stub. */
  baseUrl?: string;
}

/* -------------------------------------------------------------------------- */
/*  Schema                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every field is a required string, and "unknown" is the empty string rather than
 * `null`. `type: ["string", "null"]` is valid JSON Schema but its handling is not
 * something this codebase should be betting a scan on; a required-string schema
 * behaves identically across dialects and the empty string is normalised to `null`
 * below.
 */
const ATTRIBUTE_SCHEMA = {
  type: "object",
  properties: {
    visible: {
      type: "boolean",
      description:
        "true only if the garment of the stated class is actually identifiable in " +
        "the crop. false if the crop is mostly background, or shows a different kind " +
        "of item.",
    },
    garmentType: {
      type: "string",
      description:
        "Turkish noun phrase for the garment as a Turkish e-commerce site would " +
        'name it, e.g. "triko ceket", "deri şort", "bilekte sneaker". Two or three ' +
        "words at most. Empty string if not determinable.",
    },
    colorName: {
      type: "string",
      description:
        'Turkish colour name of the GARMENT, e.g. "Siyah", "Pudra", "Lacivert". ' +
        "Never the colour of the background, the skin or a neighbouring garment.",
    },
    colorHex: {
      type: "string",
      description:
        'Approximate sRGB hex of that same garment colour, "#rrggbb". Must be the ' +
        "garment, not the backdrop.",
    },
    material: {
      type: "string",
      description:
        'Turkish material word, e.g. "deri", "triko", "denim", "saten". Empty ' +
        "string if not visually determinable — do not guess from the garment type.",
    },
    pattern: {
      type: "string",
      description:
        'Turkish pattern word, e.g. "düz", "çizgili", "ekose", "leopar". Empty ' +
        "string if not determinable.",
    },
    details: {
      type: "array",
      description:
        "Up to three Turkish detail words a shopper would type, e.g. " +
        '["fermuarlı", "yüksek yaka", "cepli"]. Only details visible in the crop.',
      items: { type: "string" },
      maxItems: 3,
    },
    fit: {
      type: "string",
      description:
        'Turkish fit word, e.g. "oversize", "slim", "crop". Empty string if not ' +
        "determinable.",
    },
    confidence: {
      type: "number",
      description: "Your own confidence in this description, 0 to 1.",
    },
  },
  required: [
    "visible",
    "garmentType",
    "colorName",
    "colorHex",
    "material",
    "pattern",
    "details",
    "fit",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = [
  "Türk e-ticaret siteleri için ürün özniteliği çıkaran bir görsel analiz",
  "sistemisin. Sana bir moda fotoğrafından kesilmiş tek bir bölge ve o bölgede",
  "bulunduğu söylenen kaba ürün sınıfı verilir.",
  "",
  "Kurallar:",
  "1. Yalnızca belirtilen sınıfa uyan parçayı betimle. Kırpımda başka parçalar,",
  "   ten veya arka plan görünüyorsa onları yok say.",
  "2. Renk, parçanın kendi rengidir. Kırpımın baskın rengi sıklıkla arka plandır",
  "   (stüdyo duvarı, zemin, gökyüzü) — o rengi asla verme.",
  "3. Belirtilen sınıfa uyan bir parça kırpımda tanımlanamıyorsa visible=false",
  "   döndür ve diğer alanları boş bırak. Tahmin üretme.",
  "4. Değerler Türkçe ve bir alışveriş sitesinin arama kutusuna yazılacak",
  "   sadelikte olmalı. Marka adı uydurma.",
  "5. Göremediğin bir özelliği boş string olarak bırak; parça tipinden çıkarım",
  '   yapma ("deri ceket" yazıyorsa diye malzemeye "deri" yazma).',
].join("\n");

/* -------------------------------------------------------------------------- */
/*  Extractor                                                                 */
/* -------------------------------------------------------------------------- */

export class ClaudeAttributeExtractor {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxItems: number;
  private readonly deadlineMs: number;

  constructor(apiKey: string, options: AttributeExtractorOptions = {}) {
    this.model = options.model ?? "claude-opus-5";
    this.maxItems = options.maxItems ?? 4;
    this.deadlineMs = options.deadlineMs ?? 15_000;

    this.client = new Anthropic({
      apiKey,
      /*
       * Always explicit. The SDK reads ANTHROPIC_BASE_URL from the environment on
       * its own, and this process may be running somewhere that sets it for an
       * unrelated tool — a scan must not silently post user photographs to
       * whatever host that happens to name.
       */
      baseURL: options.baseUrl ?? "https://api.anthropic.com",
      // A scan is latency-bound and has a working fallback; one retry, then give up.
      maxRetries: 1,
      timeout: options.requestTimeoutMs ?? 15_000,
    });
  }

  /**
   * Describes as many of the requested regions as the budget allows.
   *
   * Requests are honoured in the order given, so callers should pass their most
   * important detections first. Resolves to a map keyed by `request.key`; a key is
   * simply absent when that item could not be described.
   */
  async extract(
    imageBuffer: Buffer,
    requests: AttributeRequest[],
    options: { size?: { width: number; height: number }; signal?: AbortSignal } = {},
  ): Promise<Map<string, GarmentAttributes>> {
    const results = new Map<string, GarmentAttributes>();
    const selected = requests.slice(0, this.maxItems);
    if (selected.length === 0) return results;

    const budget = withDeadline(this.deadlineMs, options.signal);

    try {
      const settled = await Promise.allSettled(
        selected.map(async (request) => {
          const crop = await cropRegion(imageBuffer, request.box, { size: options.size });
          if (!crop) return null;

          const attributes = await this.describe(request, crop, budget.signal);
          return attributes ? ([request.key, attributes] as const) : null;
        }),
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled" && outcome.value) {
          results.set(outcome.value[0], outcome.value[1]);
        } else if (outcome.status === "rejected") {
          logFailure("extract", outcome.reason);
        }
      }
    } finally {
      budget.dispose();
    }

    return results;
  }

  private async describe(
    request: AttributeRequest,
    crop: { base64: string; mediaType: "image/jpeg" },
    signal: AbortSignal,
  ): Promise<GarmentAttributes | null> {
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          /*
           * Attribute extraction from a single crop is perception, not reasoning,
           * and four of these run in parallel inside a 60s function. Thinking buys
           * nothing here and costs the whole scan latency.
           */
          thinking: { type: "disabled" },
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: ATTRIBUTE_SCHEMA },
          },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: crop.mediaType,
                    data: crop.base64,
                  },
                },
                {
                  type: "text",
                  text:
                    `Kaba sınıf: "${request.itemType}".\n` +
                    `Bu kırpım, fotoğrafın ${describePosition(request.box)} bölgesinden alındı.\n` +
                    "Bu sınıfa uyan parçanın özniteliklerini çıkar.",
                },
              ],
            },
          ],
        },
        { signal },
      );

      if (response.stop_reason === "refusal") {
        console.warn(
          `[vlm] refused to describe "${request.itemType}"` +
            (response.stop_details?.explanation
              ? `: ${response.stop_details.explanation}`
              : ""),
        );
        return null;
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      if (!text) return null;

      return normalizeAttributes(JSON.parse(text));
    } catch (error) {
      logFailure(request.itemType, error);
      return null;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Normalisation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Validates one model-generated object into `GarmentAttributes`, or `null`.
 *
 * The schema constrains the shape, not the content: a hex can still come back as
 * "pembe" and a garment type as an empty string. Everything is re-checked, because
 * `colorHex` goes straight into a swatch and `garmentType` goes straight into the
 * search query that decides which products the user is shown.
 */
export function normalizeAttributes(raw: unknown): GarmentAttributes | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  // An explicit "I cannot see it" is a useful answer, but not a usable one.
  if (value.visible === false) return null;

  const garmentType = text(value.garmentType);
  const colorHex = hex(value.colorHex);

  // Without a garment noun there is nothing to search for, and without a colour
  // there is no reason to prefer this over the measured one.
  if (!garmentType || !colorHex) return null;

  const colorName = text(value.colorName);
  if (!colorName) return null;

  const details = Array.isArray(value.details)
    ? value.details
        .map((entry) => text(entry))
        .filter((entry): entry is string => entry !== null)
        .slice(0, 3)
    : [];

  const confidence =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.min(1, Math.max(0, value.confidence))
      : 0.5;

  return {
    garmentType,
    colorName,
    colorHex,
    material: text(value.material),
    pattern: text(value.pattern),
    details,
    fit: text(value.fit),
    visible: true,
    confidence,
  };
}

/** Trimmed non-empty string, or null. Caps length so a runaway answer cannot leak into the UI. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 && trimmed.length <= 60 ? trimmed : null;
}

/** `#rrggbb` or null. Accepts a missing `#` and the three-digit short form. */
function hex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;

  const digits = match[1]!.toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;

  return `#${full}`;
}

/** Coarse position words, so the model knows where in the frame the crop came from. */
function describePosition(box: BoundingBox): string {
  const centreY = box.y + box.height / 2;
  if (centreY < 0.25) return "en üst";
  if (centreY < 0.5) return "üst";
  if (centreY < 0.75) return "alt";
  return "en alt";
}

/**
 * One signal that aborts on the caller's signal or when the stage budget expires,
 * whichever comes first. `AbortSignal.any` would do this in one line but is newer
 * than the runtimes this has to work on.
 */
function withDeadline(
  deadlineMs: number,
  signal?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("VLM deadline exceeded")), deadlineMs);
  const forward = () => controller.abort(signal?.reason);

  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

function logFailure(subject: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[vlm] attribute extraction failed for "${subject}": ${message}`);
}

/* -------------------------------------------------------------------------- */
/*  Factory                                                                   */
/* -------------------------------------------------------------------------- */

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Builds an extractor from explicit credentials — used by the eval recorder. */
export function createAttributeExtractor(
  apiKey: string,
  options: AttributeExtractorOptions = {},
): ClaudeAttributeExtractor {
  return new ClaudeAttributeExtractor(apiKey, options);
}

/**
 * The extractor for this request, or `null` when the stage is off.
 *
 * Both a key and the explicit flag are required, exactly like the live product
 * path: this adds one API call per detected item to every scan, so it must never
 * switch itself on because a key happened to be in the environment.
 */
export function getAttributeExtractor(): ClaudeAttributeExtractor | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (!apiKey || process.env.ENABLE_VLM_ATTRIBUTES !== "true") return null;

  return new ClaudeAttributeExtractor(apiKey, {
    model: process.env.VLM_MODEL?.trim() || undefined,
    maxItems: readInt(process.env.VLM_MAX_ITEMS, 4),
    deadlineMs: readInt(process.env.VLM_DEADLINE_MS, 15_000),
    baseUrl: process.env.VLM_BASE_URL?.trim() || undefined,
  });
}
