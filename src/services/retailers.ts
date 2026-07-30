/**
 * Fashion / marketplace hosts used for ranking and soft preference — not as a
 * hard search whitelist. Live search runs web-wide; these domains only bias
 * candidate ordering so LCW/DeFacto/Lefties compete with Zara/Trendyol.
 */

/** Known fashion and marketplace registrable domains (Turkey + global). */
export const FASHION_RETAILER_DOMAINS = [
  // Core
  "trendyol.com",
  "zara.com",
  "shop.mango.com",
  "mango.com",
  "hm.com",
  "asos.com",
  "amazon.com",
  "amazon.com.tr",
  "sephora.com",
  "sephora.com.tr",
  // Turkey high-street + marketplaces
  "lcwaikiki.com",
  "defacto.com.tr",
  "lefties.com",
  "pullandbear.com",
  "stradivarius.com",
  "bershka.com",
  "koton.com",
  "mavi.com",
  "boyner.com.tr",
  "hepsiburada.com",
  "n11.com",
  // Global fashion extras that often rank well
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

/** True when the host is a known fashion / marketplace retailer. */
export function isFashionRetailerHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "").toLowerCase();
  return FASHION_RETAILER_DOMAINS.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`),
  );
}

/** True when the host is a social/blog/search surface we should never extract. */
export function isBlockedHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "").toLowerCase();
  return BLOCKED_HOST_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Sort key for search hits: known fashion PDPs first, then other PDPs, then
 * everything else. Lower is better.
 */
export function retailerRank(host: string, isPdp: boolean): number {
  if (isBlockedHost(host)) return 1000;
  if (isFashionRetailerHost(host) && isPdp) return 0;
  if (isPdp) return 1;
  if (isFashionRetailerHost(host)) return 2;
  return 10;
}
