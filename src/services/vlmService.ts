import "server-only";

import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";

import type { BoundingBox } from "@/types";
import { cropRegion } from "@/services/imageCrop";

/**
 * Garment attribute extraction from region crops — Gemini Flash.
 *
 * The detector answers *where* and, coarsely, *what*: Cloud Vision returns
 * "Outerwear" with a box. Everything a Turkish shopper would actually type —
 * "Kadın Siyah Deri Şort" — is absent, and the pipeline was filling the gap with
 * a measured dominant colour plus Vision's own class. That produces queries like
 * "Pudra Outerwear", and on four of the fourteen eval items the measured colour is
 * the *background*, because the garment is a minority of its own bounding box.
 *
 * Looking at the crop can: Gemini Flash is asked for the colour *of the named
 * garment*, a specific subtype (never "Üst" / "Top"), gender, and fit — free,
 * and fast enough to run per detection inside a scan budget.
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

export interface VlmServiceOptions {
  /** Model id. Defaults to `gemini-2.0-flash`. */
  model?: string;
  /** Detections to describe per scan. Beyond this, items keep the measured colour. */
  maxItems?: number;
  /** Wall-clock budget for the whole stage. */
  deadlineMs?: number;
  /** Per-call ceiling for the HTTP request. */
  requestTimeoutMs?: number;
  /** Override the API host — used to point the tests at a local stub. */
  baseUrl?: string;
}

/* -------------------------------------------------------------------------- */
/*  Schema & prompts                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fashion-first instructions: Gemini must return specific Turkish retail terms
 * a shopper would type, never generic Vision classes like "Üst" / "Top".
 */
const FASHION_PROMPT = [
  "Analyze this clothing/fashion item image. Return a precise 4-5 word Turkish",
  "search query. Specify: Gender (Erkek/Kadın/Unisex), Specific Item Subtype",
  "(e.g., Bisiklet Yaka Tişört, Deri Şort, Triko Hırka, Likit Ruj), Dominant",
  "Color, and Fit/Cut. Never use generic terms like 'Üst' or 'Top'.",
].join(" ");

/**
 * Every field is a required string, and "unknown" is the empty string rather than
 * `null`. A required-string schema behaves identically across dialects and the
 * empty string is normalised to `null` below.
 */
const ATTRIBUTE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    visible: {
      type: SchemaType.BOOLEAN,
      description:
        "true only if the garment of the stated class is actually identifiable in " +
        "the crop. false if the crop is mostly background, or shows a different kind " +
        "of item.",
    },
    searchQuery: {
      type: SchemaType.STRING,
      description:
        "Precise 4-5 word Turkish e-commerce search query including Gender " +
        "(Erkek/Kadın/Unisex), specific item subtype, dominant colour, and fit/cut. " +
        "Never generic terms like Üst or Top. Empty string if not determinable.",
    },
    garmentType: {
      type: SchemaType.STRING,
      description:
        "Turkish noun phrase for the garment as a Turkish e-commerce site would " +
        'name it, e.g. "triko ceket", "deri şort", "bilekte sneaker", "bisiklet yaka tişört". ' +
        "Specific subtype, never generic. Two or three words at most. Empty string if not determinable.",
    },
    colorName: {
      type: SchemaType.STRING,
      description:
        'Turkish colour name of the GARMENT, e.g. "Siyah", "Pudra", "Lacivert". ' +
        "Never the colour of the background, the skin or a neighbouring garment.",
    },
    colorHex: {
      type: SchemaType.STRING,
      description:
        'Approximate sRGB hex of that same garment colour, "#rrggbb". Must be the ' +
        "garment, not the backdrop.",
    },
    material: {
      type: SchemaType.STRING,
      description:
        'Turkish material word, e.g. "deri", "triko", "denim", "saten". Empty ' +
        "string if not visually determinable — do not guess from the garment type.",
    },
    pattern: {
      type: SchemaType.STRING,
      description:
        'Turkish pattern word, e.g. "düz", "çizgili", "ekose", "leopar". Empty ' +
        "string if not determinable.",
    },
    details: {
      type: SchemaType.ARRAY,
      description:
        "Up to three Turkish detail words a shopper would type, e.g. " +
        '["fermuarlı", "yüksek yaka", "cepli"]. Only details visible in the crop. ' +
        "May include gender (Erkek/Kadın/Unisex) when visually clear.",
      items: { type: SchemaType.STRING },
      maxItems: 3,
    },
    fit: {
      type: SchemaType.STRING,
      description:
        'Turkish fit/cut word, e.g. "oversize", "slim", "crop". Empty string if not ' +
        "determinable.",
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Your own confidence in this description, 0 to 1.",
    },
  },
  required: [
    "visible",
    "searchQuery",
    "garmentType",
    "colorName",
    "colorHex",
    "material",
    "pattern",
    "details",
    "fit",
    "confidence",
  ],
};

const SYSTEM_PROMPT = [
  FASHION_PROMPT,
  "",
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
  "   sadelikte olmalı. Marka adı uydurma. Genel terimler yasak: Üst, Top,",
  "   Clothing, Outerwear yerine somut alt tip kullan (Bisiklet Yaka Tişört,",
  "   Deri Şort, Triko Hırka, Likit Ruj…).",
  "5. Göremediğin bir özelliği boş string olarak bırak; parça tipinden çıkarım",
  '   yapma ("deri ceket" yazıyorsa diye malzemeye "deri" yazma).',
  "6. searchQuery alanı 4-5 kelimelik Türkçe arama sorgusu olmalı: Cinsiyet,",
  "   spesifik ürün alt tipi, baskın renk, kalıp/kesim.",
].join("\n");

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_API_HOST = "https://generativelanguage.googleapis.com";

/* -------------------------------------------------------------------------- */
/*  Service                                                                   */
/* -------------------------------------------------------------------------- */

export class GeminiVlmService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxItems: number;
  private readonly deadlineMs: number;
  private readonly requestTimeoutMs: number;
  private readonly baseUrl: string;
  private readonly client: GoogleGenerativeAI | null;

  constructor(apiKey: string, options: VlmServiceOptions = {}) {
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxItems = options.maxItems ?? 4;
    this.deadlineMs = options.deadlineMs ?? 15_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    /*
     * Always explicit. A scan must not silently post user photographs to
     * whatever host an unrelated tool happened to name in the environment.
     */
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_HOST).replace(/\/$/, "");
    // SDK only for the official host; stubs and custom bases use raw fetch.
    this.client = this.baseUrl === DEFAULT_API_HOST ? new GoogleGenerativeAI(apiKey) : null;
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
      const userText =
        `${FASHION_PROMPT}\n\n` +
        `Kaba sınıf: "${request.itemType}".\n` +
        `Bu kırpım, fotoğrafın ${describePosition(request.box)} bölgesinden alındı.\n` +
        "Bu sınıfa uyan parçanın özniteliklerini çıkar.";

      const text = this.client
        ? await this.describeWithSdk(crop, userText, signal)
        : await this.describeWithFetch(crop, userText, signal);

      if (!text) return null;

      return normalizeAttributes(JSON.parse(text));
    } catch (error) {
      logFailure(request.itemType, error);
      return null;
    }
  }

  private async describeWithSdk(
    crop: { base64: string; mediaType: "image/jpeg" },
    userText: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const model = this.client!.getGenerativeModel({
      model: this.model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: ATTRIBUTE_SCHEMA,
      },
    });

    const result = await model.generateContent(
      {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: crop.mediaType, data: crop.base64 } },
              { text: userText },
            ],
          },
        ],
      },
      { signal, timeout: this.requestTimeoutMs },
    );

    const response = result.response;
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      console.warn(`[vlm] gemini blocked prompt: ${blockReason}`);
      return null;
    }

    const finish = response.candidates?.[0]?.finishReason;
    if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
      console.warn(`[vlm] gemini finishReason=${finish}`);
      return null;
    }

    return response.text()?.trim() || null;
  }

  /**
   * Raw REST call for custom hosts (eval stubs via `VLM_BASE_URL`).
   *
   * The official SDK hard-codes the Google host; stubs need a local server that
   * speaks the same `generateContent` shape.
   */
  private async describeWithFetch(
    crop: { base64: string; mediaType: "image/jpeg" },
    userText: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      // Node's fetch does not take a timeout option; the stage deadline aborts `signal`.
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: crop.mediaType, data: crop.base64 } },
              { text: userText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      promptFeedback?: { blockReason?: string };
    };

    if (payload.promptFeedback?.blockReason) {
      console.warn(`[vlm] gemini blocked prompt: ${payload.promptFeedback.blockReason}`);
      return null;
    }

    const candidate = payload.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
      console.warn(`[vlm] gemini finishReason=${finish}`);
      return null;
    }

    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    return text || null;
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
 *
 * When Gemini returns a usable `searchQuery` but a thin `garmentType`, the query's
 * product words are preferred — that is the 4–5 word fashion string the model was
 * asked for.
 */
export function normalizeAttributes(raw: unknown): GarmentAttributes | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  // An explicit "I cannot see it" is a useful answer, but not a usable one.
  if (value.visible === false) return null;

  const searchQuery = text(value.searchQuery);
  let garmentType = text(value.garmentType);
  const colorHex = hex(value.colorHex);

  // Prefer the fashion search query's specificity when garmentType is missing or
  // still a generic Vision-style class.
  if (searchQuery && (!garmentType || isGenericGarment(garmentType))) {
    garmentType = garmentTypeFromSearchQuery(searchQuery) ?? garmentType;
  }

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

  // Fold gender from the search query into details when the model put it only there.
  if (searchQuery) {
    const gender = searchQuery.match(/\b(Erkek|Kadın|Unisex)\b/i)?.[1];
    if (gender && !details.some((d) => d.toLocaleLowerCase("tr") === gender.toLocaleLowerCase("tr"))) {
      details.unshift(gender);
      if (details.length > 3) details.length = 3;
    }
  }

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

const GENERIC_GARMENTS = new Set([
  "üst",
  "top",
  "clothing",
  "outerwear",
  "footwear",
  "apparel",
  "giyim",
  "kozmetik",
  "ürün",
  "parça",
]);

function isGenericGarment(value: string): boolean {
  return GENERIC_GARMENTS.has(value.toLocaleLowerCase("tr"));
}

/** Drop gender/colour filler words so what remains can stand as garmentType. */
function garmentTypeFromSearchQuery(query: string): string | null {
  const skip = new Set([
    "erkek",
    "kadın",
    "unisex",
    "siyah",
    "beyaz",
    "gri",
    "bej",
    "kahverengi",
    "kırmızı",
    "mavi",
    "lacivert",
    "yeşil",
    "pembe",
    "pudra",
    "mor",
    "sarı",
    "turuncu",
    "camel",
    "bordo",
    "haki",
    "antrasit",
    "altın",
    "gümüş",
    "oversize",
    "slim",
    "crop",
    "regular",
    "fitted",
  ]);

  const words = query
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !skip.has(w.toLocaleLowerCase("tr")));

  if (words.length === 0) return null;
  return words.slice(0, 3).join(" ");
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

/** Builds a VLM service from explicit credentials — used by the eval recorder. */
export function createVlmService(apiKey: string, options: VlmServiceOptions = {}): GeminiVlmService {
  return new GeminiVlmService(apiKey, options);
}

/**
 * The VLM service for this request, or `null` when the stage is off.
 *
 * Both a key and the explicit flag are required, exactly like the live product
 * path: this adds one API call per detected item to every scan, so it must never
 * switch itself on because a key happened to be in the environment.
 *
 * When `GEMINI_API_KEY` is absent the caller falls back to Vision local labels
 * without crashing — that is the measured-colour / detector-class path.
 */
export function getVlmService(): GeminiVlmService | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey || process.env.ENABLE_VLM_ATTRIBUTES !== "true") return null;

  return new GeminiVlmService(apiKey, {
    model: process.env.VLM_MODEL?.trim() || undefined,
    maxItems: readInt(process.env.VLM_MAX_ITEMS, 4),
    deadlineMs: readInt(process.env.VLM_DEADLINE_MS, 15_000),
    baseUrl: process.env.VLM_BASE_URL?.trim() || undefined,
  });
}

/** @deprecated Prefer `createVlmService` — kept for eval/recorder call sites. */
export function createAttributeExtractor(
  apiKey: string,
  options: VlmServiceOptions = {},
): GeminiVlmService {
  return createVlmService(apiKey, options);
}

/** @deprecated Prefer `getVlmService`. */
export function getAttributeExtractor(): GeminiVlmService | null {
  return getVlmService();
}
