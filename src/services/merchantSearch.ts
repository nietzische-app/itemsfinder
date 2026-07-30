import type { Merchant } from "@/types";

/**
 * Storefront search URL builders — last-resort fallback only.
 *
 * Prefer a direct product-detail page (see `productUrls.ts`). Search URLs are
 * kept so a merchant with no verified PDP still yields a clickable CTA rather
 * than a dead button, but the UI labels them as "Mağazada bul".
 *
 * Turkish storefronts first — the app is Turkish — with global Inditex /
 * marketplace coverage for the expanded retailer set.
 */
type SearchUrlBuilder = (query: string) => string;

const SEARCH_URLS: Record<Merchant, SearchUrlBuilder | null> = {
  Trendyol: (q) => `https://www.trendyol.com/sr?q=${q}`,
  Amazon: (q) => `https://www.amazon.com.tr/s?k=${q}`,
  Zara: (q) => `https://www.zara.com/tr/tr/search?searchTerm=${q}`,
  Sephora: (q) => `https://www.sephora.com.tr/search?q=${q}`,
  Mango: (q) => `https://shop.mango.com/tr/search?kw=${q}`,
  "H&M": (q) => `https://www2.hm.com/tr_tr/search-results.html?q=${q}`,
  ASOS: (q) => `https://www.asos.com/search/?q=${q}`,
  "LC Waikiki": (q) => `https://www.lcwaikiki.com/tr-TR/TR/arama?q=${q}`,
  DeFacto: (q) => `https://www.defacto.com.tr/arama?q=${q}`,
  Lefties: (q) => `https://www.lefties.com/tr/tr/search?searchTerm=${q}`,
  "Pull&Bear": (q) => `https://www.pullandbear.com/tr/tr/search?searchTerm=${q}`,
  Stradivarius: (q) => `https://www.stradivarius.com/tr/tr/search?searchTerm=${q}`,
  Bershka: (q) => `https://www.bershka.com/tr/tr/search?searchTerm=${q}`,
  Koton: (q) => `https://www.koton.com/tr/search?q=${q}`,
  Mavi: (q) => `https://www.mavi.com/search?q=${q}`,
  Boyner: (q) => `https://www.boyner.com.tr/search?q=${q}`,
  Hepsiburada: (q) => `https://www.hepsiburada.com/ara?q=${q}`,
  N11: (q) => `https://www.n11.com/arama?q=${q}`,
  // No storefront we can address — the caller keeps whatever URL it had.
  Other: null,
};

/**
 * Builds a storefront search URL for a query, or `null` when we have no search
 * endpoint for that merchant.
 */
export function buildMerchantSearchUrl(
  merchant: Merchant,
  query: string,
): string | null {
  const build = SEARCH_URLS[merchant];
  const trimmed = query.trim();
  if (!build || !trimmed) return null;

  return build(encodeURIComponent(trimmed));
}

/** True when we can produce a search URL for that merchant. */
export function hasSearchUrl(merchant: Merchant): boolean {
  return SEARCH_URLS[merchant] !== null;
}

/**
 * Brand colours for the store badge, so a retailer is recognisable even when
 * the Brand API has not supplied a logo (mock mode, or a live lookup miss).
 * These are the retailers' own well-known brand colours.
 */
const MERCHANT_COLORS: Record<Merchant, string> = {
  Trendyol: "#f27a1a",
  Amazon: "#ff9900",
  Zara: "#000000",
  Sephora: "#000000",
  Mango: "#000000",
  "H&M": "#e50010",
  ASOS: "#2d2d2d",
  "LC Waikiki": "#0054a6",
  DeFacto: "#1a1a1a",
  Lefties: "#e30613",
  "Pull&Bear": "#000000",
  Stradivarius: "#000000",
  Bershka: "#000000",
  Koton: "#000000",
  Mavi: "#0033a0",
  Boyner: "#e30613",
  Hepsiburada: "#ff6000",
  N11: "#7b1fa2",
  Other: "#757575",
};

export function merchantColor(merchant: Merchant): string {
  return MERCHANT_COLORS[merchant];
}

/** Short badge text — the first letters of the merchant name. */
export function merchantInitials(merchant: Merchant): string {
  if (merchant === "H&M") return "H&M";
  if (merchant === "LC Waikiki") return "LCW";
  if (merchant === "Pull&Bear") return "P&B";
  if (merchant === "Hepsiburada") return "HB";
  return merchant.slice(0, 2).toUpperCase();
}
