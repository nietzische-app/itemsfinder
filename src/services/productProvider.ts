import "server-only";

import { ContextDevService, type LiveProductCard } from "@/services/contextDevService";
import { getBudgetAlternatives, getExactMatches } from "@/services/matchPipeline";
import { colorNameFromHex } from "@/lib/searchQueryColors";
import {
  familyFromPrimary,
  primaryCategoryOf,
  type PrimaryCategory,
} from "@/lib/primaryCategory";
import { passesWhitelistSanitizer } from "@/utils/sanitizer";
import { LIVE_EXTRACT_DEADLINE_MS } from "@/lib/timeouts";
import { hydrateProduct } from "@/services/mockCatalog";
import { isDirectProductUrl, resolveVerifiedPdp } from "@/services/productUrls";
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
 * Live path uses a Google Lens–inspired two-stage pipeline:
 *   Stage 1 `getExactMatches`     → locked PrimaryCategory + colour PDPs
 *   Stage 2 `getBudgetAlternatives` → cheaper same-category lookalikes only
 *
 * Every card is re-validated by the mandatory category whitelist sanitizer so
 * a FOOTWEAR detection can never surface bedding, home textiles, or wrong colours.
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
 * Sanitises catalogue products already attached at detection time. Drops any
 * exact/alternative card that violates the locked PrimaryCategory.
 */
export class MockProductProvider implements ProductProvider {
  readonly source: ProductSource = "mock";

  async enrich(result: DetectionResult): Promise<DetectionResult> {
    return {
      ...result,
      productSource: "mock",
      liveItemCount: 0,
      items: result.items.map(sanitizeDetectedItem),
    };
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
 * Replaces catalogue products with live inventory via the two-stage pipeline.
 *
 * Fallback is per-detection: if Stage 1 returns nothing usable, the catalogue
 * row (already category-sanitised) is kept.
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
    this.deadlineMs = options.deadlineMs ?? LIVE_EXTRACT_DEADLINE_MS;
    this.maxAlternatives = options.maxAlternatives ?? 3;
  }

  async enrich(result: DetectionResult, signal?: AbortSignal): Promise<DetectionResult> {
    if (result.items.length === 0) {
      return { ...result, productSource: "mock", liveItemCount: 0 };
    }

    const controller = new AbortController();
    const abortOnOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOnOuter, { once: true });
    const deadline = setTimeout(() => controller.abort(), this.deadlineMs);

    try {
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

      const items = result.items.map(
        (item) => resolved.get(item.id) ?? sanitizeDetectedItem(item),
      );
      const liveItemCount = items.filter((item) =>
        targetIds.has(item.id) && resolved.has(item.id) ? true : false,
      ).length;

      return {
        ...result,
        items,
        productSource: liveItemCount > 0 ? "context-dev" : "mock",
        liveItemCount,
      };
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abortOnOuter);
    }
  }

  /**
   * Two-stage resolution for one detection.
   *
   * Stage 1 must return a validated primary product before Stage 2 runs.
   * Stage 2 inherits PrimaryCategory + colour and never mutates them.
   */
  private async resolveItem(
    item: DetectedItem,
    signal: AbortSignal,
  ): Promise<DetectedItem | null> {
    const primary =
      item.primaryCategory && item.primaryCategory !== "UNKNOWN"
        ? item.primaryCategory
        : primaryCategoryOf(`${item.itemType} ${item.label} ${item.attributes}`);

    if (primary === "UNKNOWN") return null;

    const stageInput = {
      primaryCategory: primary,
      itemCategory: item.category,
      colorHex: item.colorHex,
      colorName: colorNameFromHex(item.colorHex),
      webEntity: item.webEntity ?? null,
      webEntityScore: item.webEntityScore ?? null,
      brandLogo: item.brandLogo ?? null,
      itemType: item.itemType,
      attributes: item.attributes,
      label: item.label,
      materials: item.materials ?? null,
      patterns: item.patterns ?? null,
      signal,
    };

    // --- Stage 1: Exact visual match (re-ranked, ≥85% for Birebir) ----------
    const exact = await getExactMatches(this.context, stageInput);
    const best = exact.cards.find((card) => card.isExact) ?? null;
    if (!best) return null;

    // --- Stage 2: Budget alternatives (only after Stage 1 Exact Match) -----
    const budget = await getBudgetAlternatives(this.context, {
      ...stageInput,
      primaryProduct: best,
      maxAlternatives: this.maxAlternatives,
    });

    const domains = Array.from(
      new Set(
        [best, ...budget.cards].map((card) => card.merchantDomain).filter(Boolean),
      ),
    );
    const brands = new Map<string, BrandMetadata | null>();

    await Promise.all(
      domains.map(async (domain) => {
        brands.set(domain, await this.context.enrichBrandMetadata(domain, signal));
      }),
    );

    const exactMatch = toProductMatch(best, {
      id: `${item.id}-live-exact`,
      matchType: "exact",
      similarity: best.matchScore,
      tag: "Birebir Eşleşme",
      brand: brands.get(best.merchantDomain) ?? null,
      lockedPrimary: primary,
      colorHex: item.colorHex,
      colorName: stageInput.colorName,
    });

    // Final guard — if the exact card somehow fails, abort live enrichment.
    if (!exactMatch) return null;

    const alternatives = budget.cards
      .map((card, index) =>
        toProductMatch(card, {
          id: `${item.id}-live-alt-${index}`,
          matchType: "alternative",
          similarity: card.matchScore,
          tag: "Bütçe Dostu Muadil",
          brand: brands.get(card.merchantDomain) ?? null,
          lockedPrimary: primary,
          colorHex: item.colorHex,
          colorName: stageInput.colorName,
        }),
      )
      .filter((product): product is ProductMatch => product !== null);

    return {
      ...item,
      primaryCategory: primary,
      exactMatch,
      alternatives,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Sanitisation                                                              */
/* -------------------------------------------------------------------------- */

/** Drops catalogue cards that fail the whitelist / colour sanitizer. */
export function sanitizeDetectedItem(item: DetectedItem): DetectedItem {
  const primary =
    item.primaryCategory && item.primaryCategory !== "UNKNOWN"
      ? item.primaryCategory
      : primaryCategoryOf(`${item.itemType} ${item.label} ${item.attributes}`);

  const colorOpts = {
    colorHex: item.colorHex,
    colorName: colorNameFromHex(item.colorHex),
    enforceColor: true as const,
  };

  const exactMatch =
    item.exactMatch &&
    passesWhitelistSanitizer(
      primary,
      {
        title: item.exactMatch.title,
        productUrl: item.exactMatch.productUrl,
        brand: item.exactMatch.brand,
      },
      colorOpts,
    )
      ? item.exactMatch
      : null;

  const alternatives = item.alternatives.filter((product) =>
    passesWhitelistSanitizer(
      primary,
      {
        title: product.title,
        productUrl: product.productUrl,
        brand: product.brand,
      },
      colorOpts,
    ),
  );

  return {
    ...item,
    primaryCategory: primary,
    exactMatch,
    alternatives,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mapping                                                                   */
/* -------------------------------------------------------------------------- */

/** Domains we recognise, mapped to their `Merchant` for badges + affiliates. */
const DOMAIN_TO_MERCHANT: Array<[RegExp, Merchant]> = [
  [/(^|\.)zara\.com$/, "Zara"],
  [/(^|\.)trendyol\.com$/, "Trendyol"],
  [/(^|\.)mango\.com$/, "Mango"],
  [/(^|\.)sephora\.com$/, "Sephora"],
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)hm\.com$/, "H&M"],
  [/(^|\.)asos\.com$/, "ASOS"],
  [/(^|\.)lcwaikiki\.com$/, "LC Waikiki"],
  [/(^|\.)defacto\.com/, "DeFacto"],
  [/(^|\.)lefties\.com$/, "Lefties"],
  [/(^|\.)pullandbear\.com$/, "Pull&Bear"],
  [/(^|\.)stradivarius\.com$/, "Stradivarius"],
  [/(^|\.)bershka\.com$/, "Bershka"],
  [/(^|\.)koton\.com$/, "Koton"],
  [/(^|\.)mavi\.com$/, "Mavi"],
  [/(^|\.)boyner\.com/, "Boyner"],
  [/(^|\.)hepsiburada\.com$/, "Hepsiburada"],
  [/(^|\.)n11\.com$/, "N11"],
];

/**
 * Maps a live domain onto a known merchant so `buildAffiliateUrl` can attach
 * the right tracking tag. Unknown retailers fall through to `Other`.
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
  lockedPrimary: PrimaryCategory;
  colorHex?: string;
  colorName?: string | null;
}

/** Absolute http(s) only — never hand the CTA anything else. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Maps a live card to a ProductMatch, or `null` when it fails the category
 * guard or lacks a usable PDP URL.
 */
function toProductMatch(
  card: LiveProductCard,
  overrides: ProductMatchOverrides,
): ProductMatch | null {
  const colorOpts = {
    colorHex: overrides.colorHex,
    colorName: overrides.colorName,
    enforceColor: Boolean(overrides.colorHex || overrides.colorName),
  };

  if (
    !passesWhitelistSanitizer(
      overrides.lockedPrimary,
      {
        title: card.title,
        productUrl: card.productUrl,
        brand: card.brand,
      },
      colorOpts,
    )
  ) {
    return null;
  }

  const merchant = merchantForDomain(card.merchantDomain);

  let productUrl = isDirectProductUrl(card.productUrl) ? card.productUrl : "";
  if (!productUrl) {
    const family = familyFromPrimary(overrides.lockedPrimary);
    productUrl = resolveVerifiedPdp(merchant, family) ?? "";
  }

  // Re-check after PDP fallback — curated URLs must still agree with primary.
  if (
    productUrl &&
    !passesWhitelistSanitizer(
      overrides.lockedPrimary,
      {
        title: card.title,
        productUrl,
        brand: card.brand,
      },
      colorOpts,
    )
  ) {
    return null;
  }

  const isUsableUrl = Boolean(productUrl) && isSafeHttpUrl(productUrl);
  if (!isUsableUrl) return null;

  return {
    id: overrides.id,
    title: card.title,
    brand: card.brand ?? overrides.brand?.name ?? card.merchantName,
    merchant,
    price: card.price,
    currency: card.currency,
    productUrl,
    urlKind: isDirectProductUrl(productUrl) ? "product" : "search",
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
        console.warn("[products] live resolution failed:", error);
      }
    }
  });

  await Promise.all(runners);
}

/** Re-exported so the Vision path can hydrate catalogue lookups. */
export { hydrateProduct };
