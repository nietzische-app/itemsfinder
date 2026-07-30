import { buildMerchantSearchUrl } from "@/services/merchantSearch";
import type { BoundingBox, ExampleId, Merchant } from "@/types";

/**
 * Data for the landing-page "Live Scan" showcase.
 *
 * Deliberately standalone rather than imported from `mockCatalog.ts`: the
 * catalogue is ~1500 lines and this runs in a client component on the landing
 * page, so pulling it in would ship the whole thing to every visitor for the
 * sake of three cards.
 *
 * The prices and titles here are illustrative, exactly like the rest of the
 * demo data — the card says so, so nobody reads them as live retailer prices.
 */

/** Aspect ratio the showcase frame is built for: portrait 2:3 (e.g. 1333x2000). */
export const SHOWCASE_ASPECT = "2 / 3";

/**
 * Scenario this look maps to in `mockCatalog.ts`. Opening the scan sends this
 * id to `/api/detect`, which returns the three items below with these boxes.
 */
export const SHOWCASE_EXAMPLE_ID: ExampleId = "pink-outfit";

export const SHOWCASE_IMAGE = {
  /**
   * The street-style reference shot. Drop the photo at this path and the
   * showcase picks it up with no code change — see `public/examples/README.md`.
   */
  src: "/examples/pink-outfit.jpg",
  /**
   * Shown when the photo above is missing, so the hero never renders a broken
   * image. The placeholder's zones are drawn at the same coordinates as the
   * boxes below, which keeps the hotspots meaningful either way.
   */
  fallbackSrc: "/examples/showcase-fallback.svg",
  alt: "Pembe triko ceket, siyah deri şort ve bilekli sneaker giyen model — örnek tarama görseli",
  /** The placeholder shows zones, not a look, so it needs its own description. */
  fallbackAlt: "Örnek tarama görseli için ayrılmış alan — üst, alt ve ayakkabı bölgeleri",
};

export interface ShowcaseMatch {
  title: string;
  merchant: Merchant;
  price: number;
  currency: string;
  /** Storefront search URL — a real, resolvable link, not an invented product id. */
  url: string;
  /** 0..1 visual similarity, shown as a percentage. */
  similarity: number;
  /** How many look-alikes the scan turned up for this item. */
  alternativeCount: number;
}

export interface ShowcaseItem {
  id: string;
  /** Full detection label, e.g. "Pembe Fermuarlı Triko Ceket". */
  label: string;
  /** Coarse type for the eyebrow chip, e.g. "Ceket". */
  itemType: string;
  /** Attribute line under the title. */
  attributes: string;
  /** Dominant colour of the region — drives the swatch dot. */
  colorHex: string;
  /** 0..1 detector confidence. */
  confidence: number;
  /**
   * Normalised (0..1) region, top-left origin, relative to the full image.
   *
   * Calibrated against the reference photo by eye, so treat them as ±0.02 and
   * worth a glance once the real JPG is in place. The brief specified slightly
   * looser boxes — top (0.35, 0.30, 0.30, 0.28), bottom (0.35, 0.48, 0.28,
   * 0.15), shoes (0.37, 0.76, 0.26, 0.18) — which overshot the garments on the
   * right and below; these are pulled in to the clothing itself.
   */
  box: BoundingBox;
  match: ShowcaseMatch;
}

/** Search URL or empty string — the CTA degrades to a disabled state on "". */
function searchUrl(merchant: Merchant, query: string): string {
  return buildMerchantSearchUrl(merchant, query) ?? "";
}

export const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: "showcase-top",
    label: "Pembe Fermuarlı Triko Ceket",
    itemType: "Ceket",
    attributes: "Pastel pembe • İnce triko • Fermuarlı",
    colorHex: "#f0a0b4",
    confidence: 0.96,
    box: { x: 0.355, y: 0.3, width: 0.25, height: 0.27 },
    match: {
      title: "Fermuarlı Yüksek Yaka Triko Ceket",
      merchant: "Trendyol",
      price: 549,
      currency: "TRY",
      url: searchUrl("Trendyol", "pembe fermuarlı triko ceket"),
      similarity: 0.94,
      alternativeCount: 12,
    },
  },
  {
    id: "showcase-bottom",
    label: "Siyah Deri Mini Şort",
    itemType: "Şort",
    attributes: "Mat siyah • Deri görünümlü • Yüksek bel",
    colorHex: "#16181c",
    confidence: 0.93,
    box: { x: 0.36, y: 0.495, width: 0.235, height: 0.1 },
    match: {
      title: "Deri Görünümlü Yüksek Bel Mini Şort",
      merchant: "Zara",
      price: 899,
      currency: "TRY",
      url: searchUrl("Zara", "deri görünümlü mini şort"),
      similarity: 0.89,
      alternativeCount: 9,
    },
  },
  {
    id: "showcase-shoes",
    label: "Siyah Beyaz Bilekli Sneaker",
    itemType: "Sneaker",
    attributes: "Siyah/beyaz • Bilekli • Deri detay",
    colorHex: "#1b1b1b",
    confidence: 0.95,
    box: { x: 0.372, y: 0.785, width: 0.24, height: 0.12 },
    match: {
      title: "Bilekli Retro Basketbol Sneaker",
      merchant: "Amazon",
      price: 2499,
      currency: "TRY",
      url: searchUrl("Amazon", "siyah beyaz bilekli sneaker"),
      similarity: 0.91,
      alternativeCount: 15,
    },
  },
];

/** How long each item holds focus in the auto-play cycle, in ms. */
export const SHOWCASE_INTERVAL_MS = 3000;
