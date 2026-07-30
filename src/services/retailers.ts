/**
 * Fashion / marketplace hosts used for ranking and soft preference — not as a
 * hard search whitelist. Live search runs web-wide; these domains only bias
 * candidate ordering so priority TR storefronts surface first in the card list.
 */

/**
 * Preferred merchants for visual output ranking (lower = higher priority).
 * Trendyol → Zara → LCW → DeFacto → H&M → Sephora → Amazon TR, then peers.
 */
const PRIORITY_RETAILER_RULES: Array<{ match: RegExp; rank: number }> = [
  { match: /(^|\.)trendyol\.com$/i, rank: 0 },
  { match: /(^|\.)zara\.com$/i, rank: 1 },
  { match: /(^|\.)lcwaikiki\.com$/i, rank: 2 },
  { match: /(^|\.)defacto\.com(\.tr)?$/i, rank: 3 },
  { match: /(^|\.)hm\.com$/i, rank: 4 },
  { match: /(^|\.)sephora\.com(\.tr)?$/i, rank: 5 },
  { match: /(^|\.)amazon\.com\.tr$/i, rank: 6 },
  { match: /(^|\.)amazon\./i, rank: 8 },
  { match: /(^|\.)lefties\.com$/i, rank: 10 },
  { match: /(^|\.)pullandbear\.com$/i, rank: 11 },
  { match: /(^|\.)stradivarius\.com$/i, rank: 12 },
  { match: /(^|\.)bershka\.com$/i, rank: 13 },
  { match: /(^|\.)mango\.com$/i, rank: 14 },
  { match: /(^|\.)asos\.com$/i, rank: 15 },
  { match: /(^|\.)koton\.com$/i, rank: 16 },
  { match: /(^|\.)mavi\.com$/i, rank: 17 },
  { match: /(^|\.)boyner\.com(\.tr)?$/i, rank: 18 },
  { match: /(^|\.)hepsiburada\.com$/i, rank: 19 },
  { match: /(^|\.)n11\.com$/i, rank: 20 },
];

/** Known fashion and marketplace registrable domains (Turkey + global). */
export const FASHION_RETAILER_DOMAINS = [
  // Priority TR / beauty set
  "trendyol.com",
  "zara.com",
  "lcwaikiki.com",
  "defacto.com.tr",
  "hm.com",
  "sephora.com",
  "sephora.com.tr",
  "amazon.com.tr",
  "amazon.com",
  // Peers
  "shop.mango.com",
  "mango.com",
  "asos.com",
  "lefties.com",
  "pullandbear.com",
  "stradivarius.com",
  "bershka.com",
  "koton.com",
  "mavi.com",
  "boyner.com.tr",
  "hepsiburada.com",
  "n11.com",
  "lookfantastic.com",
  "farfetch.com",
  "uniqlo.com",
  "gap.com",
  "nike.com",
  "adidas.com",
] as const;

/** Hosts that never yield a shoppable PDP for our CTAs. */
const BLOCKED_HOST_FRAGMENTS = [
  "pinterest.",
  "youtube.",
  "youtu.be",
  "wikipedia.",
  "instagram.",
  "facebook.",
  "twitter.",
  "x.com",
  "tiktok.",
  "reddit.",
  "medium.com",
  "blogspot.",
  "wordpress.",
  "tumblr.",
  "linkedin.",
  "google.",
  "bing.com",
  "duckduckgo.",
];

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

/** True when the host is a known fashion / marketplace retailer. */
export function isFashionRetailerHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return FASHION_RETAILER_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

/** True when the host is a social/blog/search surface we should never extract. */
export function isBlockedHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return BLOCKED_HOST_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Fine-grained preference among shoppable hosts. Lower is better.
 * Unknown fashion peers land at 40; non-fashion PDPs at 60.
 */
export function merchantPriority(host: string): number {
  const normalized = normalizeHost(host);
  for (const rule of PRIORITY_RETAILER_RULES) {
    if (rule.match.test(normalized)) return rule.rank;
  }
  if (isFashionRetailerHost(normalized)) return 40;
  return 60;
}

/**
 * Sort key for search hits and card lists: priority merchant PDPs first,
 * then other fashion PDPs, then everything else. Lower is better.
 */
export function retailerRank(host: string, isPdp: boolean): number {
  if (isBlockedHost(host)) return 1000;
  const priority = merchantPriority(host);
  if (isPdp) return priority;
  // Non-PDP search pages are demoted hard so extract never prefers them.
  return 100 + priority;
}

/** Stable comparator for live cards — priority merchant, then cheaper. */
export function compareLiveMerchants(
  a: { merchantDomain: string; price: number },
  b: { merchantDomain: string; price: number },
): number {
  const rankDelta =
    retailerRank(a.merchantDomain, true) - retailerRank(b.merchantDomain, true);
  if (rankDelta !== 0) return rankDelta;
  return a.price - b.price;
}
