import "server-only";
import { productUrlOrEmpty } from "@/lib/productUrl";

import ContextDev from "context.dev";

import type { BrandMetadata, ItemCategory } from "@/types";

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
 * Türkiye'den alışverişe uygun mağazalar — aramanın **birinci** katmanı.
 *
 * Liste eskiden tek Türk mağazası olarak Trendyol'u taşıyordu, yani "Türkiye'de
 * bulunamazsa" durumu pratikte hemen her sorguda oluşuyordu. Buradakiler
 * Türkiye'ye satış yapan, TL fiyat gösteren ve yurt içi kargo yapan mağazalar; hepsinin
 * ürün sayfası şekli `productUrl.ts` tarafından tanınıyor ve `eval` tarafından
 * ölçülüyor (`eval/productUrlCases.ts`).
 */
const TURKISH_DOMAINS: Record<ItemCategory, string[]> = {
  clothing: [
    "trendyol.com",
    "boyner.com.tr",
    "lcw.com",
    "defacto.com.tr",
    "mavi.com",
    "koton.com",
    "zara.com",
    "pullandbear.com",
    "stradivarius.com",
    "bershka.com",
    "hm.com",
    "amazon.com.tr",
  ],
  beauty: [
    "sephora.com.tr",
    "trendyol.com",
    "gratis.com",
    "watsons.com.tr",
    "rossmann.com.tr",
    "amazon.com.tr",
  ],
};

/**
 * Yalnızca birinci katman boş dönerse aranan global mağazalar.
 *
 * Sıra kasıtlı: Türkiye'den alışveriş yapan biri için İngiltere'den gelen bir ASOS
 * bağlantısı, aynı ürünü TL fiyatla ve yurt içi kargoyla veren bir bağlantıdan
 * kötüdür — gümrük, kargo süresi ve iade hepsi değişiyor. Ama hiç sonuç
 * olmamasından iyidir, ve bazı ürünler Türkiye'de gerçekten satılmıyor.
 */
const GLOBAL_DOMAINS: Record<ItemCategory, string[]> = {
  clothing: ["asos.com", "shop.mango.com", "amazon.com", "zara.com", "hm.com"],
  beauty: ["sephora.com", "lookfantastic.com", "amazon.com"],
};

/**
 * Global katmana düşmeden önce birinci katmanda aranan en az aday sayısı.
 *
 * Bir tane değil: tek bir sonuç, o mağazanın elinde gerçekten o ürün olduğu
 * anlamına gelmiyor — alakasız bir eşleşme de tek sonuç üretir. İki aday, ikinci
 * aramanın parasını harcamadan önce "Türkiye'de var" demek için makul en düşük
 * kanıt.
 */
const MIN_LOCAL_CANDIDATES = 2;

/** Fallback currency per retailer TLD, used when extraction omits it. */
const DOMAIN_CURRENCY: Array<[RegExp, string]> = [
  /*
   * `.com.tr` çoğunu yakalıyor ama hepsini değil: LCW, Mavi, Koton ve Gratis
   * Türkiye mağazası oldukları hâlde düz `.com` kullanıyor. Birinci katmana
   * eklendiklerinde para birimi düşmüş oluyordu, yani TL fiyat para birimsiz
   * görünüyordu.
   */
  [/\.com\.tr$|trendyol\.com|lcw\.com|mavi\.com|koton\.com|gratis\.com/, "TRY"],
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
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.extractBudgetMs = options.extractBudgetMs ?? 15_000;
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
   * Bir mağaza kümesinde arar ve mağaza başına en fazla bir aday döndürür.
   *
   * Mağaza başına tek sayfa, çünkü en iyi sıralanan mağazadan gelen birbirine
   * benzeyen üç ilan, üç farklı mağazadan gelen üç seçenekten kötü.
   */
  private async searchTier(
    query: string,
    includeDomains: string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    const search = await this.client.web.search(
      {
        query,
        includeDomains,
        numResults: 10,
        timeoutMS: this.requestTimeoutMs,
        tags: ["markas", "product-search"],
      },
      { signal },
    );

    const candidates: string[] = [];
    const seenHosts = new Set<string>();

    for (const result of search.results ?? []) {
      const host = safeHostname(result.url);
      if (!host || seenHosts.has(host)) continue;

      seenHosts.add(host);
      candidates.push(result.url);
      if (candidates.length >= this.extractsPerQuery) break;
    }

    return candidates;
  }

  /**
   * Finds live, buyable products for a detection label.
   *
   * Two stages: `web.search` scoped to our retailer allowlist finds real
   * product URLs, then `web.extract` pulls structured cards off the best few.
   * Extraction is pinned to a single page (`maxDepth: 0`, `maxPages: 1`) so
   * latency and credit cost stay predictable.
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
      /*
       * Önce Türkiye, bulunamazsa global.
       *
       * Tek bir aramada bütün mağazaları taramak, sıralamayı arama motoruna
       * bırakmak demekti — ve o sıralama alışveriş yapanın nerede olduğunu
       * bilmiyor. Türkiye'den bakan biri için TL fiyat ve yurt içi kargo veren bir
       * bağlantı, aynı ürünün İngiltere bağlantısından iyi. Ama global katman da
       * kapalı değil: bazı ürünler Türkiye'de gerçekten satılmıyor ve o durumda
       * sonuçsuz bırakmaktansa gümrüklü bir seçenek göstermek daha faydalı.
       *
       * İkinci arama yalnızca birincisi yetersiz kaldığında yapılıyor, yani
       * sorgu başına maliyet ancak gerektiğinde ikiye çıkıyor.
       */
      const local = await this.searchTier(
        `${query} satın al fiyat`,
        TURKISH_DOMAINS[category],
        signal,
      );

      const candidates = [...local];
      if (candidates.length < MIN_LOCAL_CANDIDATES) {
        const global = await this.searchTier(
          `${query} buy price`,
          GLOBAL_DOMAINS[category],
          signal,
        );
        for (const url of global) {
          if (!candidates.includes(url)) candidates.push(url);
        }
      }

      if (candidates.length === 0) return [];

      const extracted = await Promise.allSettled(
        candidates.map((url) => this.extractProducts(url, signal)),
      );

      const products = extracted.flatMap((outcome) =>
        outcome.status === "fulfilled" ? outcome.value : [],
      );

      const deduped = dedupeByUrl(products);
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

  /*
   * An extracted product URL is trusted only if it stays on the page's host —
   * otherwise a scraped ad or cross-sell could redirect our CTA off-site — and
   * only if it is a product detail page.
   *
   * `pageUrl` is the fallback because it is the page extraction actually ran on,
   * but it gets the same treatment: search scoped to a retailer still lands on
   * listing pages sometimes, and a listing is not a product. Anything that fails
   * both checks yields "", and the caller drops the candidate rather than
   * shipping a link to a results page.
   */
  const extractedUrl = typeof raw.productUrl === "string" ? raw.productUrl : "";
  const onHost =
    isHttpUrl(extractedUrl) && safeHostname(extractedUrl) === host
      ? extractedUrl
      : "";

  const productUrl =
    productUrlOrEmpty(onHost) || productUrlOrEmpty(pageUrl);

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
