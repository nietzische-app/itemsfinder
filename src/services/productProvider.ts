import "server-only";

import { ContextDevService, type LiveProductCard } from "@/services/contextDevService";
import { hydrateProduct } from "@/services/mockCatalog";
import type {
  BrandMetadata,
  DetectedItem,
  DetectionResult,
  Merchant,
  ProductMatch,
  ProductSource,
} from "@/types";

/**
 * Product resolution — the stage that decides *what to buy* for each detection.
 *
 * This is deliberately separate from detection. Which engine found the items
 * (mock or Cloud Vision) and which engine priced them (mock catalogue or
 * Context.dev) are independent choices, and the UI reports both.
 *
 * Every provider must be total: a detection that cannot be resolved keeps the
 * products it arrived with, so the UI never loses a card.
 */
export interface ProductProvider {
  readonly source: ProductSource;
  /** Returns the result with products filled in, plus provenance counters. */
  enrich(result: DetectionResult, signal?: AbortSignal): Promise<DetectionResult>;
}

/* -------------------------------------------------------------------------- */
/*  Mock provider                                                             */
/* -------------------------------------------------------------------------- */

/**
 * No-op provider: detections already arrive carrying catalogue products, so
 * there is nothing to fetch. Exists so the composition has a uniform shape.
 */
export class MockProductProvider implements ProductProvider {
  readonly source: ProductSource = "mock";

  async enrich(result: DetectionResult): Promise<DetectionResult> {
    return { ...result, productSource: "mock", liveItemCount: 0 };
  }
}

/* -------------------------------------------------------------------------- */
/*  Context.dev provider                                                      */
/* -------------------------------------------------------------------------- */

export interface ContextDevProductProviderOptions {
  /**
   * Detections to resolve live, highest-confidence first. Each one costs a
   * search plus a few extracts, so this bounds both latency and credits.
   */
  maxLiveItems?: number;
  /** Detections resolved in parallel. Kept low for the 30 req/min rate limit. */
  concurrency?: number;
  /** Wall-clock budget for the whole live stage; anything unfinished stays mock. */
  deadlineMs?: number;
  /** Alternatives kept per detection. */
  maxAlternatives?: number;
}

/**
 * Replaces catalogue products with live inventory from Context.dev.
 *
 * Fallback is per-detection, not all-or-nothing: if the jacket resolves live
 * but the lipstick times out, the jacket goes live and the lipstick keeps its
 * catalogue row. `liveItemCount` reports exactly how many went live so the UI
 * can tell the truth rather than claiming a blanket "live".
 */
export class ContextDevProductProvider implements ProductProvider {
  readonly source: ProductSource = "context-dev";

  private readonly maxLiveItems: number;
  private readonly concurrency: number;
  private readonly deadlineMs: number;
  private readonly maxAlternatives: number;

  constructor(
    private readonly context: ContextDevService,
    options: ContextDevProductProviderOptions = {},
  ) {
    this.maxLiveItems = options.maxLiveItems ?? 4;
    this.concurrency = options.concurrency ?? 2;
    this.deadlineMs = options.deadlineMs ?? 45_000;
    this.maxAlternatives = options.maxAlternatives ?? 3;
  }

  async enrich(result: DetectionResult, signal?: AbortSignal): Promise<DetectionResult> {
    if (result.items.length === 0) {
      return { ...result, productSource: "mock", liveItemCount: 0 };
    }

    // A deadline for the stage as a whole. Individual SDK calls have their own
    // timeouts; this stops a slow tail from holding the whole scan hostage.
    const controller = new AbortController();
    const abortOnOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOnOuter, { once: true });
    const deadline = setTimeout(() => controller.abort(), this.deadlineMs);

    try {
      // Spend the budget on the detections the user is most likely to act on.
      const priority = [...result.items]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.maxLiveItems);
      const targetIds = new Set(priority.map((item) => item.id));

      const resolved = new Map<string, DetectedItem>();

      await runWithConcurrency(priority, this.concurrency, async (item) => {
        if (controller.signal.aborted) return;

        const live = await this.resolveItem(item, controller.signal);
        if (live) resolved.set(item.id, live);
      });

      const items = result.items.map((item) => resolved.get(item.id) ?? item);
      const liveItemCount = items.filter((item) =>
        targetIds.has(item.id) && resolved.has(item.id) ? true : false,
      ).length;

      return {
        ...result,
        items,
        // Claiming "live" with zero live rows would be a lie; say mock instead.
        productSource: liveItemCount > 0 ? "context-dev" : "mock",
        liveItemCount,
      };
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abortOnOuter);
    }
  }

  /** Resolves one detection, or `null` to keep its catalogue products. */
  private async resolveItem(
    item: DetectedItem,
    signal: AbortSignal,
  ): Promise<DetectedItem | null> {
    const cards = await this.context.searchLiveProducts(
      item.label,
      item.category,
      signal,
    );

    if (cards.length === 0) return null;

    // The best-matching product is the exact match; everything cheaper than it
    // becomes a budget alternative, cheapest first. If nothing is cheaper we
    // still show the rest as alternatives — they are real options either way.
    const [best, ...rest] = cards;
    if (!best) return null;

    const cheaper = rest
      .filter((card) => card.price < best.price)
      .sort((a, b) => a.price - b.price);
    const others = rest
      .filter((card) => card.price >= best.price)
      .sort((a, b) => a.price - b.price);

    const alternatives = [...cheaper, ...others].slice(0, this.maxAlternatives);

    // One brand lookup per distinct retailer in this detection's result set.
    const domains = Array.from(
      new Set(
        [best, ...alternatives].map((card) => card.merchantDomain).filter(Boolean),
      ),
    );
    const brands = new Map<string, BrandMetadata | null>();

    await Promise.all(
      domains.map(async (domain) => {
        brands.set(domain, await this.context.enrichBrandMetadata(domain, signal));
      }),
    );

    return {
      ...item,
      exactMatch: toProductMatch(best, {
        id: `${item.id}-live-exact`,
        matchType: "exact",
        // Live results carry no similarity score of their own; rank order from
        // the search is the only signal, so state it conservatively.
        similarity: 0.9,
        tag: "Live match",
        brand: brands.get(best.merchantDomain) ?? null,
      }),
      alternatives: alternatives.map((card, index) =>
        toProductMatch(card, {
          id: `${item.id}-live-alt-${index}`,
          matchType: "alternative",
          similarity: Math.max(0.6, 0.86 - index * 0.05),
          tag: index === 0 && card.price < best.price ? "Best value" : undefined,
          brand: brands.get(card.merchantDomain) ?? null,
        }),
      ),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapping                                                                   */
/* -------------------------------------------------------------------------- */

/** Domains we have an affiliate programme for, mapped to their `Merchant`. */
const DOMAIN_TO_MERCHANT: Array<[RegExp, Merchant]> = [
  [/(^|\.)zara\.com$/, "Zara"],
  [/(^|\.)trendyol\.com$/, "Trendyol"],
  [/(^|\.)mango\.com$/, "Mango"],
  [/(^|\.)sephora\.com$/, "Sephora"],
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)hm\.com$/, "H&M"],
  [/(^|\.)asos\.com$/, "ASOS"],
];

/**
 * Maps a live domain onto a known merchant so `buildAffiliateUrl` can attach
 * the right tracking tag. Unknown retailers fall through to `Other`, which
 * still gets UTM parameters — just no affiliate tag.
 */
export function merchantForDomain(domain: string): Merchant {
  for (const [pattern, merchant] of DOMAIN_TO_MERCHANT) {
    if (pattern.test(domain)) return merchant;
  }
  return "Other";
}

interface ProductMatchOverrides {
  id: string;
  matchType: ProductMatch["matchType"];
  similarity: number;
  tag?: string;
  brand: BrandMetadata | null;
}

function toProductMatch(
  card: LiveProductCard,
  overrides: ProductMatchOverrides,
): ProductMatch {
  const merchant = merchantForDomain(card.merchantDomain);

  return {
    id: overrides.id,
    title: card.title,
    brand: card.brand ?? overrides.brand?.name ?? card.merchantName,
    merchant,
    price: card.price,
    currency: card.currency,
    productUrl: card.productUrl,
    // Live listings without an image fall back to the neutral placeholder the
    // catalogue uses, so cards never render an empty box.
    imageUrl: card.imageUrl ?? placeholderImage(card.title),
    matchType: overrides.matchType,
    similarity: overrides.similarity,
    tag: overrides.tag,
    inStock: card.inStock,
    merchantDomain: card.merchantDomain,
    isLive: true,
    brandMetadata: overrides.brand ?? undefined,
  };
}

/** Mirrors the catalogue's inline SVG thumbnail for live rows with no image. */
function placeholderImage(title: string): string {
  const initials = title
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
  <rect width="400" height="500" fill="#eae7e7"/>
  <text x="200" y="272" font-family="Inter, Helvetica, Arial, sans-serif" font-size="86"
        font-weight="700" fill="#747878" text-anchor="middle">${initials}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

/** Runs `worker` over `items`, at most `limit` at a time. Never rejects. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      try {
        await worker(item);
      } catch (error) {
        // A single failed detection must not abort the others; it simply keeps
        // its catalogue products.
        console.warn("[products] live resolution failed:", error);
      }
    }
  });

  await Promise.all(runners);
}

/** Re-exported so the Vision path can hydrate catalogue lookups. */
export { hydrateProduct };
