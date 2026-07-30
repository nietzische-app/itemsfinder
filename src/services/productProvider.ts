import "server-only";

import { ContextDevService, type LiveProductCard } from "@/services/contextDevService";
import { productUrlOrEmpty } from "@/lib/productUrl";
import { familyOf } from "@/lib/itemFamily";
import {
  ALTERNATIVE_FLOOR,
  EXACT_MATCH_FLOOR,
  expectedAttributesOf,
  scoreTitleAgreement,
} from "@/lib/attributeMatch";
import { rejectProductTitle } from "@/lib/retailVocabulary";
import { buildSearchQuery } from "@/lib/searchQuery";
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
    // Search on the enriched query — colour plus descriptors plus type —
    // rather than the bare label, which is often too generic to rank well.
    const query = buildSearchQuery({
      itemType: item.itemType,
      label: item.label,
      colorHex: item.colorHex,
      attributes: item.attributes,
    });

    const cards = await this.context.searchLiveProducts(
      query || item.label,
      item.category,
      signal,
    );

    if (cards.length === 0) return null;

    /*
     * Storefront search does not only return the thing you asked for. A query for
     * a black coat also returns the toddler's version, a coat hanger, and a phone
     * case that happens to be black — and this stage used to hand the top-ranked
     * row straight to the user as the "exact match". The catalogue path has always
     * been family-gated; live rows were the hole in that guarantee.
     *
     * The family is the detector's own ruling, carried on the item, not a fresh
     * guess from the label.
     */
    const family = item.family ?? familyOf(`${item.itemType} ${item.label}`);
    const rejected: string[] = [];
    const usable = cards.filter((card) => {
      const reason = rejectProductTitle(card.title, family);
      if (reason) rejected.push(`"${card.title}" (${reason})`);
      return reason === null;
    });

    if (rejected.length > 0) {
      // One line per detection, not per row: a noisy query can reject ten.
      console.warn(
        `[products] ${rejected.length}/${cards.length} canlı satır «${item.itemType}» ` +
          `(${family}) için elendi: ${rejected.slice(0, 3).join("; ")}`,
      );
    }

    // Everything plausible was filtered out, so there is nothing live to show.
    // The catalogue row is a worse price but a correct product.
    if (usable.length === 0) return null;

    /*
     * Rank by measured attribute agreement, not by what the search engine ranked
     * first. The family gate says a row is the right *kind* of product; it still
     * leaves a beige linen blazer eligible for a black leather blazer, and search
     * rank has no opinion about that. `scoreTitleAgreement` does, and the number it
     * returns is the one shown on the card — so the match percentage finally
     * corresponds to something instead of being a constant.
     */
    const expected = expectedAttributesOf(item);
    const ranked = usable
      .map((card) => ({ card, agreement: scoreTitleAgreement(card.title, expected) }))
      .sort(
        (a, b) => b.agreement.score - a.agreement.score || a.card.price - b.card.price,
      );

    const leader = ranked[0];
    if (!leader) return null;

    /*
     * The exact-match slot is a promise. A row only holds it if it clears the floor
     * *and* does not contradict the detected colour — a shopper who scanned a black
     * jacket and is shown a beige one as the "birebir eşleşme" has been lied to,
     * however well the rest of the words line up. Otherwise the catalogue row keeps
     * the slot: a worse price for a product that is actually what they scanned, and
     * the live rows are still offered as alternatives.
     */
    const leaderQualifies =
      leader.agreement.score >= EXACT_MATCH_FLOOR && leader.agreement.color !== "conflict";

    if (!leaderQualifies) {
      console.warn(
        `[products] «${item.itemType}» için canlı birebir eşleşme yok: en iyi satır ` +
          `"${leader.card.title}" %${Math.round(leader.agreement.score * 100)} ` +
          `(${leader.agreement.reason}); katalog satırı korunuyor`,
      );
    }

    const best = leaderQualifies ? leader : null;
    const rest = leaderQualifies ? ranked.slice(1) : ranked;

    // Alternatives keep agreement order too — a cheaper row that is the wrong
    // colour is not a better deal, it is a different product. Rows below the
    // alternative floor are dropped rather than shown under a near-zero score.
    const alternatives = rest
      .filter((entry) => entry.agreement.score >= ALTERNATIVE_FLOOR)
      .slice(0, this.maxAlternatives);

    // Nothing survived either floor, so there is no live data for this detection.
    if (!best && alternatives.length === 0) return null;
    const cheapest = alternatives.reduce<number>(
      (min, entry) => Math.min(min, entry.card.price),
      Number.POSITIVE_INFINITY,
    );

    // One brand lookup per distinct retailer in this detection's result set.
    const domains = Array.from(
      new Set(
        [...(best ? [best] : []), ...alternatives]
          .map((entry) => entry.card.merchantDomain)
          .filter(Boolean),
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
      exactMatch: best
        ? toProductMatch(best.card, {
            id: `${item.id}-live-exact`,
            matchType: "exact",
            // The measured agreement, not a constant. This is what the card shows.
            similarity: best.agreement.score,
            tag: "Canlı",
            brand: brands.get(best.card.merchantDomain) ?? null,
          })
        : item.exactMatch,
      alternatives: alternatives.map((entry, index) =>
        toProductMatch(entry.card, {
          id: `${item.id}-live-alt-${index}`,
          matchType: "alternative",
          similarity: entry.agreement.score,
          tag: entry.card.price === cheapest ? "En uygun" : undefined,
          brand: brands.get(entry.card.merchantDomain) ?? null,
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
  // Product detail page or no link at all — the extractor already applies this,
  // and applying it again here means no future caller can bypass the ban by
  // constructing a LiveProductCard directly.
  const productUrl = productUrlOrEmpty(card.productUrl);
  const isUsableUrl = productUrl.length > 0;

  return {
    id: overrides.id,
    title: card.title,
    brand: card.brand ?? overrides.brand?.name ?? card.merchantName,
    merchant,
    price: card.price,
    currency: card.currency,
    productUrl,
    // Live rows are real product pages, not storefront searches.
    urlKind: "product",
    // Live listings without an image fall back to the neutral placeholder the
    // catalogue uses, so cards never render an empty box.
    imageUrl: card.imageUrl ?? placeholderImage(card.title),
    matchType: overrides.matchType,
    similarity: overrides.similarity,
    tag: overrides.tag,
    // A row we cannot link to is not buyable, whatever the page claimed.
    inStock: card.inStock && isUsableUrl,
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
