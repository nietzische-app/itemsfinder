/**
 * Verified product detail page (PDP) URLs for the demo catalogue.
 *
 * Keyed by the product id in `src/services/mockCatalog.ts`. A product with no
 * entry here renders **without a CTA** — that is the intended behaviour, not a
 * gap to paper over. Storefront search links are banned (`src/lib/productUrl.ts`),
 * so "no verified link" beats "a link to a results page".
 *
 * ## Why this file is empty
 *
 * These have to be real, live URLs, and they cannot be generated. A PDP path
 * encodes a retailer's internal SKU (`-p-123456789`, `/dp/B0XXXXXXXX`,
 * `-p04387042.html`); there is no way to derive one, and an invented id is a
 * guaranteed 404 — the catalogue previously shipped fabricated PDP paths and
 * every single one of them broke, which is what search URLs were introduced to
 * fix. Verifying a link means fetching it, which this environment cannot do:
 * there is no network route to any retailer.
 *
 * ## How to fill it
 *
 * 1. Open the store, find the product, copy the address bar URL.
 * 2. Strip tracking parameters (`?boutiqueId=`, `?utm_*`, `&merchantId=`) — the
 *    affiliate builder adds its own, and stale tracking ids can redirect.
 * 3. Paste it against the product id below.
 *
 * Every value is validated on import: anything that is not PDP-shaped, or that
 * looks like a search/listing URL, throws at startup rather than shipping a bad
 * link. `npm run typecheck` will not catch a wrong-but-well-shaped URL — only a
 * human opening it can confirm the product is the right one and still in stock.
 *
 * Product ids to fill, highest value first (the landing-page showcase looks):
 *
 *   pink-outfit    po-cardigan-exact, po-shorts-exact, po-sneakers-exact
 *                  po-cardigan-alt-1..3, po-shorts-alt-1..3, po-sneakers-alt-1..3
 *   biker-look     bk-jacket-exact, bk-body-exact, bk-jeans-exact, bk-sunglasses-exact (+ alts)
 *   long-coat      lc-coat-exact, lc-beanie-exact, lc-jeans-exact, lc-sandals-exact (+ alts)
 *   black-blazer   bb-blazer-exact, bb-lip-exact, bb-heels-exact (+ alts)
 *
 * `npm run check:pdp` lists every id that is still missing.
 */
import { isDirectProductUrl, isSearchUrl } from "@/lib/productUrl";

/**
 * productId -> live PDP URL.
 *
 * Example of the expected shape (commented out because it is illustrative, not
 * a verified link):
 *
 *   "po-cardigan-exact": "https://www.trendyol.com/markafoni/fermuarli-triko-hirka-p-987654321",
 *   "po-shorts-exact":   "https://www.zara.com/tr/tr/deri-gorunumlu-sort-p04387042.html",
 *   "po-sneakers-exact": "https://www.amazon.com.tr/dp/B08N5WRWNW",
 */
export const VERIFIED_PDP_URLS: Readonly<Record<string, string>> = {};

/**
 * Fails loudly at import time on a malformed entry.
 *
 * A bad product link is worse than a missing one: it costs the shopper a tap and
 * their trust. Better to break the build.
 */
for (const [productId, url] of Object.entries(VERIFIED_PDP_URLS)) {
  if (isSearchUrl(url)) {
    throw new Error(
      `verifiedProductUrls: "${productId}" is a search/listing URL, which is banned: ${url}`,
    );
  }
  if (!isDirectProductUrl(url)) {
    throw new Error(
      `verifiedProductUrls: "${productId}" is not a product detail page URL: ${url}`,
    );
  }
}

/** Verified PDP for a catalogue product, or "" when none has been supplied. */
export function verifiedPdpUrl(productId: string): string {
  return VERIFIED_PDP_URLS[productId] ?? "";
}
