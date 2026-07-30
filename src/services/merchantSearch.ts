import type { Merchant } from "@/types";

/**
 * Storefront search URL builders — last-resort fallback only.
 *
 * Prefer a direct product-detail page (see `productUrls.ts`). Search URLs are
 * kept so a merchant with no verified PDP still yields a clickable CTA rather
 * than a dead button, but the UI labels them as "Mağazada bul".
 *
 * Turkish storefronts, because the app is Turkish.
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

/** True when we can produce a search URL for this merchant. */
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
  Other: "#757575",
};

export function merchantColor(merchant: Merchant): string {
  return MERCHANT_COLORS[merchant];
}

/** Short badge text — the first letters of the merchant name. */
export function merchantInitials(merchant: Merchant): string {
  if (merchant === "H&M") return "H&M";
  return merchant.slice(0, 2).toUpperCase();
}
