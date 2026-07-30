import "server-only";

import ContextDev from "context.dev";

import type { BrandMetadata, ItemCategory } from "@/types";
import { isDirectProductUrl } from "@/services/productUrls";
import { isBlockedHost, compareLiveMerchants, retailerRank } from "@/services/retailers";

import {
  LIVE_EXTRACT_BUDGET_MS,
  LIVE_REQUEST_TIMEOUT_MS,
} from "@/lib/timeouts";

/**
 * Context.dev integration — live product intelligence and retailer branding.
 *
 * Two capabilities are used, both from the official `context.dev` SDK:
 *
 *  - `web.search` + `web.extract`  → real product cards (title, price, stock,
 *    image) pulled from live retailer pages, replacing the mock catalogue.
 *  - `brand.retrieveSimplified`    → retailer logo, name and brand colour,
 *    resolved from the product URL's domain rather than hardcoded.
 *
 * Everything here is best-effort: every public method resolves to an empty
 * result rather than throwing, so a failed or slow live lookup degrades to the
 * mock catalogue instead of breaking a scan.
 */

/** A product as returned by the live engine, before affiliate wrapping. */
export interface LiveProductCard {
  title: string;
  price: number;
  currency: string;
  merchantName: string;
  merchantDomain: string;
  productUrl: string;
  imageUrl: string | null;
  inStock: boolean;
  brand: string | null;
}

/**
 * Soft preference list for ranking only — live search is deliberately
 * *not* scoped with `includeDomains`, so LCW / DeFacto / Lefties / any other
 * shoppable host can surface. Blocked social/blog hosts are filtered after
 * the fact; fashion domains are just ranked higher.
 */
const PREFERRED_EXTRACT_COUNT = 5;

/** Fallback currency per retailer TLD, used when extraction omits it. */
const DOMAIN_CURRENCY: Array<[RegExp, string]> = [
  [/\.com\.tr$|trendyol\.com|lcwaikiki\.com|defacto\.com|hepsiburada\.com|n11\.com|boyner\.com|koton\.com|mavi\.com/, "TRY"],
  [/\.co\.uk$|asos\.com/, "GBP"],
  [/\.de$|\.fr$|\.es$|\.it$/, "EUR"],
];

/**
 * JSON Schema handed to `web.extract`. Paired with `factCheck: true` so the
 * model may not invent a price that is not on the page — the whole point of
 * going live is that these numbers are real.
 */
const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      description: "Every distinct purchasable product shown on the page.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product name as displayed." },
          price: {
            type: "number",
            description: "Current selling price as a number, no currency symbol.",
          },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD." },
          brand: { type: "string", description: "Brand or label name." },
          imageUrl: { type: "string", description: "Absolute product image URL." },
          productUrl: { type: "string", description: "Absolute product page URL." },
          inStock: { type: "boolean", description: "False if sold out." },
        },
        required: ["title", "price"],
        additionalProperties: false,
      },
    },
  },
  required: ["products"],
  additionalProperties: false,
} as const;

/** Shape we hope for out of `extract`; every field is re-validated below. */
interface RawProduct {
  title?: unknown;
  price?: unknown;
  currency?: unknown;
  brand?: unknown;
  imageUrl?: unknown;
  productUrl?: unknown;
  inStock?: unknown;
}

export interface ContextDevServiceOptions {
  /** Product pages to extract per detected item. More = better spread, more credits. */
  extractsPerQuery?: number;
  /** Per-call ceiling handed to the SDK. */
  requestTimeoutMs?: number;
  /** How long extraction may crawl before returning what it has. */
  extractBudgetMs?: number;
  /** TTL for the in-process caches. */
  cacheTtlMs?: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class ContextDevService {
  private readonly client: ContextDev;
  private readonly extractsPerQuery: number;
  private readonly requestTimeoutMs: number;
  private readonly extractBudgetMs: number;
  private readonly cacheTtlMs: number;

  /**
   * Caches live for the lifetime of the server process. Scans repeat the same
   * labels constantly ("Black Leather Biker Jacket"), and both credits and
   * latency are the scarce resources here.
   */
  private readonly productCache = new Map<string, CacheEntry<LiveProductCard[]>>();
  private readonly brandCache = new Map<string, CacheEntry<BrandMetadata | null>>();

  constructor(apiKey: string, options: ContextDevServiceOptions = {}) {
    this.extractsPerQuery = options.extractsPerQuery ?? 3;
    this.requestTimeoutMs = options.requestTimeoutMs ?? LIVE_REQUEST_TIMEOUT_MS;
    this.extractBudgetMs = options.extractBudgetMs ?? LIVE_EXTRACT_BUDGET_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? 30 * 60_000;

    this.client = new ContextDev({
      apiKey,
      // The SDK retries twice by default; a scan is latency-sensitive and we
      // have a mock fallback, so fail fast instead.
      maxRetries: 1,
      timeout: this.requestTimeoutMs,
    });
  }

  /**
   * Finds live, buyable products for a detection label.
   *
   * Search is web-wide (no `includeDomains` whitelist) so any fashion retailer
   * — LCW, DeFacto, Lefties, Pull&Bear, marketplaces, etc. — can rank. We then
   * keep only direct PDPs, drop blocked hosts, and prefer known fashion domains
   * when picking extract targets.
   *
   * Resolves to `[]` on any failure — callers fall back to the catalogue.
   */
  async searchLiveProducts(
    query: string,
    category: ItemCategory,
    signal?: AbortSignal,
  ): Promise<LiveProductCard[]> {
    const cacheKey = `${category}:${query.toLowerCase()}`;
    const cached = this.readCache(this.productCache, cacheKey);
    if (cached) return cached;

    try {
      const search = await this.client.web.search(
        {
          // Open web: omit includeDomains so the query is not trapped in a
          // small merchant allowlist. PDP + blocked-host filters keep CTAs
          // shoppable.
          query: `${query} satın al ürün`,
          numResults: 15,
          timeoutMS: this.requestTimeoutMs,
          tags: ["markas", "product-search", "web-wide"],
        },
        { signal },
      );

      const candidates: string[] = [];
      const seenHosts = new Set<string>();

      const ranked = [...(search.results ?? [])]
        .map((result) => {
          const host = safeHostname(result.url) ?? "";
          return {
            url: result.url,
            host,
            rank: retailerRank(host, isDirectProductUrl(result.url)),
          };
        })
        .filter((entry) => entry.host && !isBlockedHost(entry.host))
        .sort((a, b) => a.rank - b.rank);

      for (const result of ranked) {
        if (!isDirectProductUrl(result.url)) continue;
        if (seenHosts.has(result.host)) continue;

        seenHosts.add(result.host);
        candidates.push(result.url);
        if (candidates.length >= Math.max(this.extractsPerQuery, PREFERRED_EXTRACT_COUNT)) {
          break;
        }
      }

      // No PDP in the search results — refuse to extract from search pages
      // (those produce search CTAs). Caller falls back to verified catalogue PDPs.
      if (candidates.length === 0) return [];

      const extractLimit = Math.max(this.extractsPerQuery, PREFERRED_EXTRACT_COUNT);
      const extracted = await Promise.allSettled(
        candidates.slice(0, extractLimit).map((url) => this.extractProducts(url, signal)),
      );

      const products = extracted.flatMap((outcome) =>
        outcome.status === "fulfilled" ? outcome.value : [],
      );

      const deduped = dedupeByUrl(products)
        .filter(
          (product) =>
            isDirectProductUrl(product.productUrl) &&
            !isBlockedHost(product.merchantDomain),
        )
        .sort(compareLiveMerchants);
      this.writeCache(this.productCache, cacheKey, deduped);
      return deduped;
    } catch (error) {
      logFailure("searchLiveProducts", query, error);
      return [];
    }
  }

  /**
   * Resolves retailer branding for a domain — logo, display name, brand colour.
   * Resolves to `null` when the brand is unknown or the call fails.
   */
  async enrichBrandMetadata(
    domain: string,
    signal?: AbortSignal,
  ): Promise<BrandMetadata | null> {
    // Brand records are keyed on the registrable domain, so a product URL on
    // `www2.hm.com` or `shop.mango.com` has to be reduced before lookup.
    const normalized = registrableDomain(domain);
    if (!normalized) return null;

    const cached = this.readCache(this.brandCache, normalized);
    if (cached !== undefined) return cached;

    try {
      const response = await this.client.brand.retrieveSimplified(
        {
          domain: normalized,
          // The UI is light-only, so ask for assets picked for a light surface.
          theme: "light",
          timeoutMS: this.requestTimeoutMs,
          tags: ["markas", "brand"],
        },
        { signal },
      );

      const brand = response.brand;
      if (!brand) {
        this.writeCache(this.brandCache, normalized, null);
        return null;
      }

      // Prefer a wordmark over a bare icon, and something that reads on a light
      // background. `has_opaque_background` works on either.
      const logos = brand.logos ?? [];
      const logo =
        logos.find(
          (candidate) =>
            candidate.type === "logo" &&
            (candidate.mode === "light" || candidate.mode === "has_opaque_background"),
        ) ??
        logos.find((candidate) => candidate.type === "logo") ??
        logos.find((candidate) => Boolean(candidate.url));

      const metadata: BrandMetadata = {
        domain: brand.domain ?? normalized,
        name: brand.title?.trim() || merchantNameFromDomain(normalized),
        logoUrl: isHttpUrl(logo?.url) ? logo!.url! : null,
        colorHex: normalizeHex(brand.colors?.[0]?.hex),
      };

      this.writeCache(this.brandCache, normalized, metadata);
      return metadata;
    } catch (error) {
      logFailure("enrichBrandMetadata", normalized, error);
      // Cache the miss too: a domain with no brand record would otherwise be
      // re-queried for every product card on every scan.
      this.writeCache(this.brandCache, normalized, null);
      return null;
    }
  }

  /** Pulls product cards off one page and normalises them. */
  private async extractProducts(
    url: string,
    signal?: AbortSignal,
  ): Promise<LiveProductCard[]> {
    const response = await this.client.web.extract(
      {
        url,
        schema: PRODUCT_SCHEMA as unknown as Record<string, unknown>,
        // No invented prices: every value must be supported by the page.
        factCheck: true,
        maxDepth: 0,
        maxPages: 1,
        stopAfterMs: this.extractBudgetMs,
        timeoutMS: this.requestTimeoutMs,
        tags: ["markas", "product-extract"],
      },
      { signal },
    );

    const raw = (response.data as { products?: unknown })?.products;
    if (!Array.isArray(raw)) return [];

    const host = safeHostname(url) ?? "";

    return raw
      .map((entry) => normalizeProduct(entry as RawProduct, url, host))
      .filter((product): product is LiveProductCard => product !== null);
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }
}

/* -------------------------------------------------------------------------- */
/*  Normalisation helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turns one loosely-typed extraction row into a `LiveProductCard`, or `null`
 * if it is not usable. Extraction output is model-generated, so nothing here
 * is trusted: a card without a real title and a positive finite price is
 * dropped rather than shown with a bogus number.
 */
function normalizeProduct(
  raw: RawProduct,
  pageUrl: string,
  host: string,
): LiveProductCard | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 3) return null;

  const price = toPositiveNumber(raw.price);
  if (price === null) return null;

  // An extracted product URL is only trusted if it stays on the page's host and
  // is a direct PDP — otherwise a scraped ad, cross-sell, or search page could
  // redirect our CTA off a buyable product.
  const extractedUrl = typeof raw.productUrl === "string" ? raw.productUrl : "";
  const preferred =
    isHttpUrl(extractedUrl) &&
    safeHostname(extractedUrl) === host &&
    isDirectProductUrl(extractedUrl)
      ? extractedUrl
      : isDirectProductUrl(pageUrl)
        ? pageUrl
        : null;

  if (!preferred) return null;

  const productUrl = preferred;
  const currency =
    typeof raw.currency === "string" && /^[A-Za-z]{3}$/.test(raw.currency.trim())
      ? raw.currency.trim().toUpperCase()
      : currencyForDomain(host);

  return {
    title,
    price,
    currency,
    merchantName: merchantNameFromDomain(host),
    merchantDomain: host,
    productUrl,
    imageUrl: isHttpUrl(raw.imageUrl) ? (raw.imageUrl as string) : null,
    // Absent stock info means listed-and-buyable, which is the common case.
    inStock: raw.inStock === false ? false : true,
    brand: typeof raw.brand === "string" && raw.brand.trim() ? raw.brand.trim() : null,
  };
}

/**
 * Parses a price that may arrive as a number or as a localised string.
 *
 * Retailer pages write prices as "49,90" (TR/EU), "1.299,00" (EU) and
 * "1,299.00" (US/UK) alike. Naively stripping punctuation turns "49,90" into
 * 4990 — a 100x overcharge on the card — so the separators have to be read
 * rather than deleted.
 */
function toPositiveNumber(value: unknown): number | null {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    parsed = parsePriceString(value);
  } else {
    return null;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function parsePriceString(input: string): number {
  // Keep digits and separators only; drops currency symbols, spaces, NBSPs.
  const cleaned = input.replace(/[^0-9.,]/g, "");
  if (!cleaned) return Number.NaN;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  // Whichever separator comes last is the decimal point; the other groups
  // thousands. If only one kind appears, it is decimal only when it separates
  // a trailing group of one or two digits ("49,90"), otherwise it is a
  // thousands separator ("1,299").
  let decimalAt = -1;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const only = Math.max(lastComma, lastDot);
    const trailing = cleaned.length - only - 1;
    const isSingleSeparator = cleaned.indexOf(cleaned[only]!) === only;
    if (isSingleSeparator && trailing > 0 && trailing <= 2) decimalAt = only;
  }

  const whole = (decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned).replace(
    /[.,]/g,
    "",
  );
  const fraction = decimalAt >= 0 ? cleaned.slice(decimalAt + 1).replace(/[.,]/g, "") : "";

  return Number(fraction ? `${whole}.${fraction}` : whole);
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;

  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function currencyForDomain(host: string): string {
  for (const [pattern, currency] of DOMAIN_CURRENCY) {
    if (pattern.test(host)) return currency;
  }
  return "USD";
}

/** Second-level domains that are really public suffixes, e.g. `amazon.co.uk`. */
const COMPOUND_SUFFIXES = new Set(["co", "com", "net", "org", "ac", "gov", "edu"]);

/**
 * Reduces a hostname to the domain a brand record is keyed on:
 * `www2.hm.com` -> `hm.com`, `shop.mango.com` -> `mango.com`,
 * `www.amazon.co.uk` -> `amazon.co.uk`.
 */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");

  const secondLast = parts[parts.length - 2]!;
  const keep = COMPOUND_SUFFIXES.has(secondLast) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

/** "shop.mango.com" -> "Mango". Only a display fallback; Brand API wins. */
export function merchantNameFromDomain(host: string): string {
  const parts = registrableDomain(host).split(".");
  const core = parts[0] ?? host;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function dedupeByUrl(products: LiveProductCard[]): LiveProductCard[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = `${product.merchantDomain}|${product.title.toLowerCase()}`;
    if (seen.has(key) || seen.has(product.productUrl)) return false;
    seen.add(key);
    seen.add(product.productUrl);
    return true;
  });
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

function logFailure(operation: string, subject: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[context.dev] ${operation} failed for "${subject}": ${message}`);
}
