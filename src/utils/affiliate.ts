import type { Merchant } from "@/types";

/**
 * Affiliate configuration per merchant.
 *
 * `param` is the query parameter the network expects; `value` reads from an
 * env var so tags can be rotated without a code change. Everything falls back
 * to a `markas`-prefixed placeholder so links stay clickable in dev.
 */
interface AffiliateConfig {
  param: string;
  value: string;
  /** Extra static params some networks require alongside the tag. */
  extra?: Record<string, string>;
}

const FALLBACK_TAG = "markas-mvp";

/**
 * Env vars are read at module scope on purpose: in the Next.js server runtime
 * this file is evaluated once per process, and `NEXT_PUBLIC_*` values are
 * inlined at build time so the helper also works in client components.
 */
const AFFILIATE_CONFIG: Record<Merchant, AffiliateConfig | null> = {
  Amazon: {
    param: "tag",
    value: process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG ?? `${FALLBACK_TAG}-20`,
    extra: { linkCode: "ll1" },
  },
  Trendyol: {
    param: "adjust_campaign",
    value: process.env.NEXT_PUBLIC_TRENDYOL_AFFILIATE_ID ?? FALLBACK_TAG,
    extra: { utm_medium: "affiliate" },
  },
  Zara: {
    param: "utm_campaign",
    value: process.env.NEXT_PUBLIC_ZARA_AFFILIATE_ID ?? FALLBACK_TAG,
    extra: { utm_medium: "affiliate" },
  },
  Sephora: {
    param: "om_mmc",
    value: process.env.NEXT_PUBLIC_SEPHORA_AFFILIATE_ID ?? FALLBACK_TAG,
  },
  Mango: {
    param: "utm_campaign",
    value: process.env.NEXT_PUBLIC_MANGO_AFFILIATE_ID ?? FALLBACK_TAG,
    extra: { utm_medium: "affiliate" },
  },
  "H&M": {
    param: "utm_campaign",
    value: process.env.NEXT_PUBLIC_HM_AFFILIATE_ID ?? FALLBACK_TAG,
    extra: { utm_medium: "affiliate" },
  },
  ASOS: {
    param: "affid",
    value: process.env.NEXT_PUBLIC_ASOS_AFFILIATE_ID ?? FALLBACK_TAG,
  },
  // Unknown merchants get UTM tagging only — see `buildAffiliateUrl`.
  Other: null,
};

/** Params we always attach so analytics can attribute the click back to us. */
const BASE_UTM: Record<string, string> = {
  utm_source: "markas",
  utm_content: "visual-search",
};

/**
 * Rewrites a merchant product URL into a trackable affiliate URL.
 *
 * Rules:
 *  - existing query params on the original URL are preserved;
 *  - a param we set overwrites an existing one with the same key, so repeated
 *    calls are idempotent (important because cards re-render on filter change);
 *  - anything that is not a valid absolute http(s) URL is returned untouched,
 *    which keeps the CTA safe when a backend hands us a relative path.
 */
export function buildAffiliateUrl(
  originalUrl: string,
  merchant: Merchant,
  options: { subId?: string } = {},
): string {
  let url: URL;

  try {
    url = new URL(originalUrl);
  } catch {
    // Not parseable (relative path, empty string, mailto:, ...) — leave as-is.
    return originalUrl;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return originalUrl;
  }

  for (const [key, value] of Object.entries(BASE_UTM)) {
    url.searchParams.set(key, value);
  }

  const config = AFFILIATE_CONFIG[merchant];

  if (config) {
    url.searchParams.set(config.param, config.value);

    for (const [key, value] of Object.entries(config.extra ?? {})) {
      url.searchParams.set(key, value);
    }
  }

  // `subId` lets us attribute a click to a specific detection/product pair.
  if (options.subId) {
    url.searchParams.set("utm_term", options.subId);
  }

  return url.toString();
}

/** True when we have a real affiliate programme wired up for this merchant. */
export function hasAffiliateProgram(merchant: Merchant): boolean {
  return AFFILIATE_CONFIG[merchant] !== null;
}

/**
 * Formats a price in Turkish convention — "₺3.599,90". The currency comes from
 * the product, not the locale: live results may be priced in USD or GBP by a
 * foreign retailer, and showing those as lira would be a lie.
 */
export function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Percentage saved by an alternative versus the exact match, rounded down. */
export function savingsPercent(exactPrice: number, altPrice: number): number {
  if (exactPrice <= 0 || altPrice >= exactPrice) return 0;
  return Math.floor(((exactPrice - altPrice) / exactPrice) * 100);
}
