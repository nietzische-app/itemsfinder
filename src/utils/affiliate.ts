import type { Merchant } from "@/types";

/**
 * Affiliate configuration per merchant.
 *
 * `param` is the query parameter the network expects; `value` reads from an
 * env var so tags can be rotated without a code change. Everything falls back
 * to a `markas`-prefixed placeholder so links stay clickable in dev.
 *
 * Merchants without a dedicated programme still get UTM tagging via the
 * `Other`/null path in `buildAffiliateUrl`.
 */
interface AffiliateConfig {
  param: string;
  value: string;
  /** Extra static params some networks require alongside the tag. */
  extra?: Record<string, string>;
}

const FALLBACK_TAG = "markas-mvp";

const utmCampaign = (env: string | undefined): AffiliateConfig => ({
  param: "utm_campaign",
  value: env ?? FALLBACK_TAG,
  extra: { utm_medium: "affiliate" },
});

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
  Zara: utmCampaign(process.env.NEXT_PUBLIC_ZARA_AFFILIATE_ID),
  Sephora: {
    param: "om_mmc",
    value: process.env.NEXT_PUBLIC_SEPHORA_AFFILIATE_ID ?? FALLBACK_TAG,
  },
  Mango: utmCampaign(process.env.NEXT_PUBLIC_MANGO_AFFILIATE_ID),
  "H&M": utmCampaign(process.env.NEXT_PUBLIC_HM_AFFILIATE_ID),
  ASOS: {
    param: "affid",
    value: process.env.NEXT_PUBLIC_ASOS_AFFILIATE_ID ?? FALLBACK_TAG,
  },
  "LC Waikiki": utmCampaign(process.env.NEXT_PUBLIC_LCW_AFFILIATE_ID),
  DeFacto: utmCampaign(process.env.NEXT_PUBLIC_DEFACTO_AFFILIATE_ID),
  Lefties: utmCampaign(process.env.NEXT_PUBLIC_LEFTIES_AFFILIATE_ID),
  "Pull&Bear": utmCampaign(process.env.NEXT_PUBLIC_PULLANDBEAR_AFFILIATE_ID),
  Stradivarius: utmCampaign(process.env.NEXT_PUBLIC_STRADIVARIUS_AFFILIATE_ID),
  Bershka: utmCampaign(process.env.NEXT_PUBLIC_BERSHKA_AFFILIATE_ID),
  Koton: utmCampaign(process.env.NEXT_PUBLIC_KOTON_AFFILIATE_ID),
  Mavi: utmCampaign(process.env.NEXT_PUBLIC_MAVI_AFFILIATE_ID),
  Boyner: utmCampaign(process.env.NEXT_PUBLIC_BOYNER_AFFILIATE_ID),
  Hepsiburada: utmCampaign(process.env.NEXT_PUBLIC_HEPSIBURADA_AFFILIATE_ID),
  N11: utmCampaign(process.env.NEXT_PUBLIC_N11_AFFILIATE_ID),
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
 * Formats a price for Turkish storefront cards — always `₺3.599,90` for TRY/TL.
 * Foreign ISO codes keep their own currency symbol so a GBP/ASOS hit is not
 * mislabelled as lira.
 */
export function formatPrice(amount: number, currency: string): string {
  const code = (currency || "TRY").trim().toUpperCase();
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const fractionDigits = Number.isInteger(safeAmount) ? 0 : 2;

  if (code === "TRY" || code === "TL") {
    const body = new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(safeAmount);
    return `₺${body}`;
  }

  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: fractionDigits,
    }).format(safeAmount);
  } catch {
    return `${safeAmount} ${code}`;
  }
}

/** Percentage saved by an alternative versus the exact match, rounded down. */
export function savingsPercent(exactPrice: number, altPrice: number): number {
  if (exactPrice <= 0 || altPrice >= exactPrice) return 0;
  return Math.floor(((exactPrice - altPrice) / exactPrice) * 100);
}
