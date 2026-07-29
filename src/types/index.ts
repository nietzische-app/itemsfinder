/**
 * Shared domain types for "Get The Look".
 *
 * The whole app is built around one flow:
 *   image -> DetectionResult -> DetectedItem[] -> ProductMatch[]
 *
 * Keeping these types in one place means the mock service and any real
 * Vision API implementation are interchangeable at the type level.
 */

/** Top-level grouping used to split the results pane into two sections. */
export type ItemCategory = "clothing" | "beauty";

/** Retailers we currently know how to build affiliate links for. */
export type Merchant =
  | "Trendyol"
  | "Zara"
  | "Sephora"
  | "Amazon"
  | "Mango"
  | "H&M"
  | "ASOS"
  | "Other";

/** How close a product is to the thing we detected in the screenshot. */
export type MatchType = "exact" | "alternative";

/**
 * Normalised bounding box, all values in the 0..1 range relative to the
 * displayed image. Normalised (rather than pixel) coordinates let the overlay
 * scale with any container size without recalculating anything.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A single buyable product suggested for a detected item. */
export interface ProductMatch {
  id: string;
  title: string;
  brand: string;
  merchant: Merchant;
  price: number;
  currency: string;
  /** Original (non-affiliate) product URL as returned by the search backend. */
  productUrl: string;
  imageUrl: string;
  matchType: MatchType;
  /** 0..1 visual similarity score. */
  similarity: number;
  /** Optional marketing flag, e.g. "Best value" / "Fast shipping". */
  tag?: string;
  inStock: boolean;
}

/** One thing the vision engine found in the screenshot. */
export interface DetectedItem {
  id: string;
  /** Short human label, e.g. "Oversized Black Leather Biker Jacket". */
  label: string;
  /** Coarse type used for chips and copy, e.g. "Jacket", "Lipstick". */
  itemType: string;
  category: ItemCategory;
  description: string;
  /** 0..1 detector confidence. */
  confidence: number;
  boundingBox: BoundingBox;
  /** Dominant colour of the region, used for the swatch dot. */
  colorHex: string;
  /** Highest-confidence match; null when nothing crossed the threshold. */
  exactMatch: ProductMatch | null;
  /** Cheaper look-alikes, ordered by price ascending. */
  alternatives: ProductMatch[];
}

/** Where a given result came from — surfaced in the UI as a small badge. */
export type DetectionSource = "mock" | "google-vision";

/** Full response for one analysed screenshot. */
export interface DetectionResult {
  id: string;
  source: DetectionSource;
  /** ISO timestamp of when the analysis finished. */
  processedAt: string;
  /** Milliseconds spent in the detection engine. */
  durationMs: number;
  items: DetectedItem[];
}

/** Payload accepted by `POST /api/detect`. */
export interface DetectRequestBody {
  /** Data URL (`data:image/png;base64,...`) of the uploaded screenshot. */
  image: string;
  /** Optional hint from the "try an example" buttons. */
  exampleId?: ExampleId;
}

/** Discriminated response so the client can narrow on `ok`. */
export type DetectResponse =
  | { ok: true; result: DetectionResult }
  | { ok: false; error: string };

/** Built-in demo images shipped in `public/examples`. */
export type ExampleId = "streetwear" | "glam-makeup";

export interface ExampleImage {
  id: ExampleId;
  label: string;
  description: string;
  src: string;
}

/** The image the user is currently analysing, persisted across navigation. */
export interface UploadedImage {
  dataUrl: string;
  fileName: string;
  /** Present when the image came from a "try an example" button. */
  exampleId?: ExampleId;
}
