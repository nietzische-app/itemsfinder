/**
 * The one place that decides whether a URL may be shown as a product link.
 *
 * Policy: a product CTA navigates to a product detail page (PDP) or it does not
 * navigate at all. Storefront search URLs are rejected — not de-prioritised,
 * rejected — no matter which layer produced them.
 *
 * Everything that can put a link in front of a shopper routes through
 * `isDirectProductUrl`: the Context.dev extractor, the live product provider and
 * the demo catalogue. There is deliberately no second path.
 */

/**
 * Search / listing / category shapes. A hit here drops the candidate outright.
 *
 * Written against the storefronts this app targets: Trendyol `sr?q=`, Zara
 * `search?searchTerm=`, Amazon `s?k=`, Mango `search?kw=`, H&M
 * `search-results.html?q=`, ASOS `search/?q=`, plus the generic Turkish
 * `/arama` and category listings.
 */
const SEARCH_PATTERNS: RegExp[] = [
  /\/search\b/i,
  /search-results/i,
  /\/arama\b/i,
  /\/sr\b/i,
  /[?&]searchTerm=/i,
  /[?&]q=/i,
  /[?&]k=/i,
  /[?&]kw=/i,
  /[?&]query=/i,
  /[?&]text=/i,
  /\/s\?/i,
  /\/kategori\//i,
  /\/c\/[\w-]+$/i,
];

/**
 * PDP shapes. A product URL must match at least one — a bare hostname or a
 * category path is not a product page.
 *
 *   Trendyol   /kadin-triko-hirka-p-123456789
 *   Zara       /tr/tr/...-p04387042.html
 *   Amazon     /dp/B08XYZ1234
 *   Mango/H&M  /p/12345678 , /productpage.0123456789.html
 *   Generic    /product/... , /urun/...
 */
const PDP_PATTERNS: RegExp[] = [
  /-p-\d{4,}/i,
  /-p\d{6,}\.html?/i,
  /\/dp\/[A-Z0-9]{10}/i,
  /\/gp\/product\/[A-Z0-9]{10}/i,
  /productpage\.\d{6,}/i,
  /\/p\/[\w.-]{3,}/i,
  /\/product(?:s)?\/[\w.-]{3,}/i,
  /\/urun\/[\w.-]{3,}/i,
  /\/prd\/\d{4,}/i,
  /\.html?(?:$|[?#])/i,
];

/** True when the URL is a search, listing or category page. */
export function isSearchUrl(url: string): boolean {
  if (!url) return false;
  return SEARCH_PATTERNS.some((pattern) => pattern.test(url));
}

/** Parses and rejects anything that is not a plain http(s) URL. */
function safeUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * True only for a URL that resolves to a single product.
 *
 * The order matters: search shapes are rejected before PDP shapes are
 * considered, because `search-results.html?q=x` matches `.html` and would
 * otherwise sneak through as a product page.
 */
export function isDirectProductUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  if (isSearchUrl(url)) return false;

  const path = `${parsed.pathname}${parsed.search}`;
  return PDP_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Returns the URL when it is a usable product link, otherwise "".
 *
 * Callers store the result directly; an empty string is the signal for the UI to
 * render the card without a CTA rather than sending someone to a listing page.
 */
export function productUrlOrEmpty(url: string | null | undefined): string {
  if (!url) return "";
  return isDirectProductUrl(url) ? url : "";
}
