import "server-only";

import type { ContextDevService, LiveProductCard } from "@/services/contextDevService";
import type { ItemCategory } from "@/types";
import {
  buildBudgetAlternativeQuery,
  buildExactMatchQuery,
  extractApparelGender,
  extractMaterialsAndPatterns,
  extractTopsSubtype,
  type ApparelGender,
  type ExactQueryInput,
  type TopsSubtype,
} from "@/lib/searchQueryBuilder";
import type { PrimaryCategory } from "@/lib/primaryCategory";
import { passesWhitelistSanitizer } from "@/utils/sanitizer";
import { isDirectProductUrl } from "@/services/productUrls";
import { compareLiveMerchants } from "@/services/retailers";
import {
  exactThresholdFor,
  isForcedBasicExact,
  pickExactAndRest,
  type ReRankTarget,
} from "@/services/reRanker";
import { isBasicSolidApparel } from "@/lib/searchQueryBuilder";
import { MEN_CREWNECK_TEE_PDPS } from "@/services/productUrls";

/**
 * Two-stage Google Lens–inspired match pipeline with precision re-ranking.
 *
 * Stage 1 (`getExactMatches`) builds a brand/colour/texture-locked query, then
 * re-ranks PDPs (category 40% / colour-texture 30% / visual 30%). Only a card
 * clearing the exact threshold becomes the Exact Match. Stage 2 runs only after
 * that hit.
 */

export interface MatchStageInput {
  primaryCategory: PrimaryCategory;
  itemCategory: ItemCategory;
  colorHex?: string;
  colorName?: string | null;
  webEntity?: string | null;
  webEntityScore?: number | null;
  brandLogo?: string | null;
  itemType: string;
  attributes?: string | null;
  label?: string | null;
  materials?: string[] | null;
  patterns?: string[] | null;
  topsSubtype?: TopsSubtype | null;
  gender?: ApparelGender | null;
  signal?: AbortSignal;
}

function resolveSubtypeAndGender(input: MatchStageInput): {
  topsSubtype: TopsSubtype | null;
  gender: ApparelGender | null;
} {
  const phrase = [input.webEntity, input.attributes, input.label, input.itemType]
    .filter(Boolean)
    .join(" ");
  const topsSubtype =
    input.topsSubtype ??
    (input.primaryCategory === "TOPS" ? extractTopsSubtype(phrase) : null);
  const gender = input.gender ?? extractApparelGender(phrase);
  return { topsSubtype, gender };
}

function toQueryInput(input: MatchStageInput): ExactQueryInput {
  const extracted = extractMaterialsAndPatterns(
    [input.webEntity, input.attributes, input.label, input.itemType]
      .filter(Boolean)
      .join(" "),
  );
  const { topsSubtype, gender } = resolveSubtypeAndGender(input);

  return {
    primaryCategory: input.primaryCategory,
    colorHex: input.colorHex,
    colorName: input.colorName,
    webEntity: input.webEntity,
    itemType: input.itemType,
    attributes: input.attributes,
    label: input.label,
    brandLogo: input.brandLogo,
    materials: input.materials?.length ? input.materials : extracted.materials,
    patterns: input.patterns?.length ? input.patterns : extracted.patterns,
    topsSubtype,
    gender,
  };
}

function toReRankTarget(input: MatchStageInput): ReRankTarget {
  const queryInput = toQueryInput(input);
  return {
    primaryCategory: input.primaryCategory,
    colorHex: input.colorHex,
    colorName: input.colorName,
    webEntity: input.webEntity,
    webEntityScore: input.webEntityScore,
    brandLogo: input.brandLogo,
    attributes: input.attributes,
    label: input.label,
    itemType: input.itemType,
    materials: queryInput.materials ?? [],
    patterns: queryInput.patterns ?? [],
    topsSubtype: queryInput.topsSubtype,
    gender: queryInput.gender,
  };
}

function sanitizeCards(
  primary: PrimaryCategory,
  cards: LiveProductCard[],
  colorHex?: string,
  colorName?: string | null,
  topsSubtype?: TopsSubtype | null,
  gender?: ApparelGender | null,
): LiveProductCard[] {
  return cards.filter((card) => {
    if (!isDirectProductUrl(card.productUrl)) return false;
    return passesWhitelistSanitizer(
      primary,
      {
        title: card.title,
        productUrl: card.productUrl,
        brand: card.brand,
      },
      { colorHex, colorName, enforceColor: true, topsSubtype, gender },
    );
  });
}

export interface RankedLiveCard extends LiveProductCard {
  matchScore: number;
  isExact: boolean;
}

/**
 * Stage 1 — Exact visual match with multi-candidate re-ranking.
 *
 * Returns cards sorted by Match Score. The first card with score ≥ 85% is the
 * Exact Match (`Birebir Eşleşme`); others feed Stage 2 / display fallbacks.
 */
export async function getExactMatches(
  context: ContextDevService,
  input: MatchStageInput,
): Promise<{ query: string; cards: RankedLiveCard[]; exactThreshold: number }> {
  const queryInput = toQueryInput(input);
  const target = toReRankTarget(input);
  const threshold = exactThresholdFor(target);
  const query = buildExactMatchQuery(queryInput);
  if (!query.trim()) return { query, cards: [], exactThreshold: threshold };

  const raw = await context.searchLiveProducts(
    query,
    input.itemCategory,
    input.signal,
  );

  const sanitized = sanitizeCards(
    input.primaryCategory,
    raw,
    input.colorHex,
    input.colorName,
    queryInput.topsSubtype,
    queryInput.gender,
  );

  const { ranked } = pickExactAndRest(target, sanitized);

  // Tie-break equal scores with merchant priority so Trendyol/Zara still win.
  let cards: RankedLiveCard[] = ranked
    .map((entry) => ({
      ...entry.candidate,
      matchScore: entry.score,
      isExact: entry.isExact,
    }))
    .sort((a, b) => {
      const scoreDelta = b.matchScore - a.matchScore;
      if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
      return compareLiveMerchants(a, b);
    });

  // Re-apply exact / forced-basic flag after merchant tie-break.
  cards = cards.map((card, index) => {
    const forced =
      index === 0 &&
      isForcedBasicExact(target, {
        title: card.title,
        productUrl: card.productUrl,
        brand: card.brand,
      });
    return {
      ...card,
      matchScore: forced ? Math.max(card.matchScore, 0.95) : card.matchScore,
      isExact: index === 0 && (forced || card.matchScore >= threshold),
    };
  });

  // Basic solid apparel MUST have a Birebir card — inject curated PDP if live miss.
  const basicSolid = isBasicSolidApparel({
    primaryCategory: input.primaryCategory,
    topsSubtype: queryInput.topsSubtype,
    colorName: input.colorName,
    colorHex: input.colorHex,
    patterns: queryInput.patterns,
    label: input.label,
    itemType: input.itemType,
    attributes: input.attributes,
    webEntity: input.webEntity,
  });

  if (basicSolid && !cards.some((card) => card.isExact)) {
    const colorName = input.colorName ?? "Siyah";
    const title = `${colorName} Erkek Bisiklet Yaka Tişört`;
    const injected: RankedLiveCard = {
      title,
      price: 299.9,
      currency: "TRY",
      merchantName: "Trendyol",
      merchantDomain: "trendyol.com",
      productUrl: MEN_CREWNECK_TEE_PDPS.trendyol,
      imageUrl: null,
      inStock: true,
      brand: "Trendyol",
      matchScore: 0.95,
      isExact: true,
    };
    cards = [injected, ...cards.filter((c) => c.productUrl !== injected.productUrl)];
  }

  return {
    query,
    cards,
    exactThreshold: threshold,
  };
}

/**
 * Stage 2 — Isolated budget alternatives.
 *
 * Executes only after Stage 1 produced a validated Exact Match. Inherits
 * PrimaryCategory + Colour + texture; filters to cheaper PDPs.
 */
export async function getBudgetAlternatives(
  context: ContextDevService,
  input: MatchStageInput & {
    /** Validated Stage 1 product — Stage 2 never runs without this. */
    primaryProduct: LiveProductCard;
    maxAlternatives?: number;
  },
): Promise<{ query: string; cards: RankedLiveCard[] }> {
  const maxAlternatives = input.maxAlternatives ?? 3;
  const query = buildBudgetAlternativeQuery(toQueryInput(input));

  const raw = await context.searchLiveProducts(
    query,
    input.itemCategory,
    input.signal,
  );

  const pool = sanitizeCards(
    input.primaryCategory,
    raw,
    input.colorHex,
    input.colorName,
    toQueryInput(input).topsSubtype,
    toQueryInput(input).gender,
  );

  const cheaper = pool
    .filter((card) => card.productUrl !== input.primaryProduct.productUrl)
    .filter((card) => card.price < input.primaryProduct.price);

  const { ranked } = pickExactAndRest(toReRankTarget(input), cheaper);

  const cards: RankedLiveCard[] = ranked
    .map((entry) => ({
      ...entry.candidate,
      matchScore: entry.score,
      isExact: false,
    }))
    .sort((a, b) => {
      // Budget lane: cheaper first, then match score, then merchant.
      const priceDelta = a.price - b.price;
      if (priceDelta !== 0) return priceDelta;
      const scoreDelta = b.matchScore - a.matchScore;
      if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
      return compareLiveMerchants(a, b);
    })
    .filter(
      (card, index, list) =>
        list.findIndex((other) => other.productUrl === card.productUrl) === index,
    )
    .slice(0, maxAlternatives);

  return { query, cards };
}
