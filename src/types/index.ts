/**
 * Shared domain types for Markas.
 *
 * The whole app is built around one flow:
 *   image -> DetectionResult -> DetectedItem[] -> ProductMatch[]
 *
 * Keeping these types in one place means the mock service and any real
 * Vision API implementation are interchangeable at the type level.
 */

import type { ItemFamily } from "@/lib/itemFamily";

export type { ItemFamily };

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
 * Where the *products* came from, independent of which detector ran.
 *
 * `"live"` yerine eskiden `"context-dev"` yazıyordu ve bu, bir satıcının adını
 * bir yeteneğin adı yerine kullanmaktı. Canlı kartların çoğu bugün mağaza
 * aramasından ve ürün işaretlemesinden geliyor; context.dev anahtarı hiç
 * yokken bile log `products: "context-dev"` diyordu. Bir satıcı adı, kanal
 * listesi değiştiğinde yanlışa dönüşür — yetenek adı dönmez.
 */
export type ProductSource = "mock" | "live";

/** Retailer branding resolved from a product URL's domain via the Brand API. */
export interface BrandMetadata {
  domain: string;
  /** Display name, e.g. "Zara". */
  name: string;
  /** CDN-hosted logo, ready to render. */
  logoUrl: string | null;
  /** Primary brand colour, used behind the logo chip. */
  colorHex: string | null;
}

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
  /**
   * 0..1 match score.
   *
   * **Attribute agreement, not visual similarity** — nothing in this codebase
   * compares pixels between the photo and the product image. For live rows it is
   * measured by `scoreTitleAgreement`: how much of the detected colour, garment
   * noun and material the listing actually claims. For catalogue rows it is a
   * curated editorial value. The old name promised a visual comparison and the
   * live path filled it with the constant 0.9, which was worse than either.
   *
   * A real visual score needs an embedding index over a product feed.
   */
  similarity: number;
  /** Optional marketing flag, e.g. "Best value" / "Fast shipping". */
  tag?: string;
  inStock: boolean;
  /** Hostname of `productUrl`, used for affiliate and brand lookups. */
  merchantDomain: string;
  /**
   * Always a product detail page. The union is deliberately a single member:
   * storefront search URLs are banned (`src/lib/productUrl.ts`), so any code
   * that tries to emit a "search" kind fails to compile rather than shipping a
   * CTA that promises a product and lands on a results page. An unverifiable
   * link yields `productUrl: ""` instead.
   */
  urlKind: "product";
  /** True when this row came from live inventory rather than the catalogue. */
  isLive: boolean;
  /** Retailer branding, populated by the Brand API in live mode. */
  brandMetadata?: BrandMetadata;
  /**
   * Mağazanın kendi ürün puanı, 0..5. **Yalnızca canlı satırlarda.**
   *
   * Katalog satırları bu alanı hiç taşımıyor ve taşımamalı: uydurma bir puan,
   * gerçek bir mağaza bağlantısının yanında uydurma bir fiyat kadar yanıltıcı —
   * ikisi de o mağazanın söylediği şey gibi okunuyor. Bu yüzden `CatalogProduct`
   * şemasında karşılığı yok; bir demo satırının puan göstermesi tip düzeyinde
   * mümkün değil, `npm run eval` de ayrıca ölçüyor.
   *
   * Yorum **metni** bilerek taşınmıyor. Metin kullanıcının yazdığı, mağazanın
   * barındırdığı içerik; kopyalayıp burada yayımlamak telif ve kullanım şartları
   * meselesi. Puan ve adet ise sayfada yazan bir olgu, ve `factCheck: true`
   * sayesinde modelin uyduramayacağı bir sayı. Yorumu okumak isteyen mağazaya
   * gidiyor.
   */
  rating?: number;
  /** Puanın kaç değerlendirmeye dayandığı. Puan varsa anlamlı, tek başına değil. */
  reviewCount?: number;
}

/** One thing the vision engine found in the screenshot. */
export interface DetectedItem {
  id: string;
  /** Short human label, e.g. "Oversized Black Leather Biker Jacket". */
  label: string;
  /** Coarse type used for chips and copy, e.g. "Jacket", "Lipstick". */
  itemType: string;
  category: ItemCategory;
  /** Short attribute line for the compact panel card, e.g. "Matte Grey • Heavyweight". */
  attributes: string;
  description: string;
  /** 0..1 detector confidence. */
  confidence: number;
  boundingBox: BoundingBox;
  /** Dominant colour of the region, used for the swatch dot. */
  colorHex: string;
  /**
   * Wardrobe family this detection was gated on.
   *
   * Carried on the item rather than recomputed downstream: the detector decides it
   * (from Vision's object class, which is tied to the box it drew), and the live
   * product stage has to reject rows against *that* decision. Recomputing it from
   * the label can disagree — the label is a description, the family is a ruling —
   * and two stages disagreeing about what was detected is how a shoe ends up
   * offered a jacket. Optional because the mock scenarios predate it and their
   * labels are precise enough to classify on sight.
   */
  family?: ItemFamily;
  /** Highest-confidence match; null when nothing crossed the threshold. */
  exactMatch: ProductMatch | null;
  /** Cheaper look-alikes, ordered by price ascending. */
  alternatives: ProductMatch[];
}

import type { ScanTrace } from "@/lib/scanTrace";

/** Where a given result came from — surfaced in the UI as a small badge. */
export type DetectionSource = "mock" | "google-vision";

/** Full response for one analysed screenshot. */
export interface DetectionResult {
  id: string;
  /** Which engine found the items. */
  source: DetectionSource;
  /** Which engine supplied the products — orthogonal to `source`. */
  productSource: ProductSource;
  /** How many detections carry live product data (0 when fully mocked). */
  liveItemCount: number;
  /** ISO timestamp of when the analysis finished. */
  processedAt: string;
  /** Milliseconds spent in the detection engine. */
  durationMs: number;
  items: DetectedItem[];
  /**
   * What happened during the scan — see `lib/scanTrace.ts`.
   *
   * Optional because every offline path (the eval, the mock engine used directly,
   * the fixtures) produces a result without one. Timings and degradation notes
   * always travel when the API produced it; the box-by-box detail only when
   * `ENABLE_SCAN_DETAIL` is on.
   */
  trace?: ScanTrace;
}

/** Payload accepted by `POST /api/detect`. */
export interface DetectRequestBody {
  /** Data URL (`data:image/png;base64,...`) of the uploaded screenshot. */
  image: string;
  /** Optional hint from the "try an example" buttons. */
  exampleId?: ExampleId;
  /**
   * Kimin için alışveriş yapıldığı — kullanıcının seçimi, «kadın» ya da «erkek».
   *
   * İsteğe bağlı ve varsayılanı yok: yokluğu «fark etmez» demek. Fotoğraftan
   * çıkarılmıyor, çünkü görünüşten cinsiyet tahmin etmek hem güvenilmez hem de
   * yapılmaması gereken bir şey.
   */
  gender?: "kadın" | "erkek";
}

/** Discriminated response so the client can narrow on `ok`. */
export type DetectResponse =
  | { ok: true; result: DetectionResult }
  | { ok: false; error: string };

/** Built-in demo looks shipped in `public/examples`. */
export type ExampleId =
  /** The landing page's live-scan showcase look — see `src/lib/showcase.ts`. */
  | "pink-outfit"
  | "biker-look"
  | "long-coat"
  | "black-blazer"
  | "streetwear"
  | "glam-makeup"
  | "tailoring"
  | "soft-minimal";

export interface ExampleImage {
  id: ExampleId;
  /** Editorial name shown on the card, e.g. "Modern Nomad". */
  title: string;
  /** Uppercase eyebrow above the title, e.g. "STREETWEAR". */
  category: string;
  description: string;
  src: string;
  /** Renders taller in the masonry grid, for a staggered Pinterest rhythm. */
  tall?: boolean;
}

/** The image the user is currently analysing, persisted across navigation. */
export interface UploadedImage {
  dataUrl: string;
  fileName: string;
  /** Present when the image came from a "try an example" button. */
  exampleId?: ExampleId;
}
