import type { Merchant } from "@/types";

/**
 * Retailer branding helpers.
 *
 * This module used to build storefront *search* URLs as the catalogue's link
 * fallback. Those are banned now — a product CTA goes to a product detail page
 * or nowhere (`src/lib/productUrl.ts`) — so the builders are gone rather than
 * left behind a flag someone could flip back on by accident. Product links come
 * from `src/data/verifiedProductUrls.ts` in demo mode and from Context.dev
 * extraction in live mode, both gated by `isDirectProductUrl`.
 *
 * Merchant *domains* still matter for affiliate tagging and brand lookups, so
 * they stay here alongside the colours.
 */

/** Canonical storefront host per merchant, used for domain-based lookups. */
const MERCHANT_HOSTS: Record<Merchant, string> = {
  Trendyol: "trendyol.com",
  Amazon: "amazon.com.tr",
  Zara: "zara.com",
  Sephora: "sephora.com.tr",
  Mango: "shop.mango.com",
  "H&M": "www2.hm.com",
  ASOS: "asos.com",
  Other: "",
};

export function merchantHost(merchant: Merchant): string {
  return MERCHANT_HOSTS[merchant];
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
