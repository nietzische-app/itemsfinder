import type { Merchant } from "@/types";

/**
 * Merchant badge helpers. Storefront *search* URL builders were removed — CTAs
 * must only open verified product detail pages (see `productUrls.ts`).
 */

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

/**
 * @deprecated Search URLs are banned. Always returns `null` — use
 * `resolveVerifiedPdp` / authored PDPs instead.
 */
export function buildMerchantSearchUrl(
  _merchant: Merchant,
  _query: string,
): string | null {
  return null;
}

/** @deprecated Search URLs are banned. */
export function hasSearchUrl(_merchant: Merchant): boolean {
  return false;
}
