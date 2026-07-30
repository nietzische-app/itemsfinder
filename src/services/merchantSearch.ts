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

/**
 * Readable text colour for the badge, given the retailer's own brand colour.
 *
 * The badge was white-on-brand everywhere, which is fine on Zara black and fails
 * on Trendyol orange — 2.77:1, well under the 4.5:1 the first accessibility audit
 * measured it against. The brand colours are the retailers' and are not ours to
 * change, so the foreground moves instead.
 *
 * Computed rather than tabulated: a new retailer added to `MERCHANT_COLORS` gets a
 * readable badge without anyone remembering to pick one.
 */
export function merchantTextColor(merchant: Merchant): string {
  const hex = MERCHANT_COLORS[merchant].replace("#", "");
  const channels = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  // Contrast against white vs against near-black; whichever is higher wins.
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / (0.0069 + 0.05);
  return againstWhite >= againstBlack ? "#ffffff" : "#111111";
}

/** Short badge text — the first letters of the merchant name. */
export function merchantInitials(merchant: Merchant): string {
  if (merchant === "H&M") return "H&M";
  return merchant.slice(0, 2).toUpperCase();
}
