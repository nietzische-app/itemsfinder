import "server-only";

import type { ContextDevService, LiveProductCard } from "@/services/contextDevService";
import type { ItemCategory } from "@/types";
import {
  buildBudgetAlternativeQuery,
  buildExactMatchQuery,
  type ExactQueryInput,
} from "@/lib/searchQueryBuilder";
import type { PrimaryCategory } from "@/lib/primaryCategory";
import { passesWhitelistSanitizer } from "@/utils/sanitizer";
import { isDirectProductUrl } from "@/services/productUrls";

/**
 * Two-stage Google Lens–inspired match pipeline.
 *
 * Stage 1 (`getExactMatches`) locks colour + primary category from Vision and
 * fetches high-confidence PDPs. Stage 2 (`getBudgetAlternatives`) runs only
 * after a validated Stage 1 hit, inheriting those parameters and filtering by
 * price — it never mutates Stage 1 visual descriptors.
 */

export interface MatchStageInput {
  primaryCategory: PrimaryCategory;
  itemCategory: ItemCategory;
  colorHex?: string;
  colorName?: string | null;
  webEntity?: string | null;
  itemType: string;
  attributes?: string | null;
  label?: string | null;
  signal?: AbortSignal;
}

function toQueryInput(input: MatchStageInput): ExactQueryInput {
  return {
    primaryCategory: input.primaryCategory,
    colorHex: input.colorHex,
    colorName: input.colorName,
    webEntity: input.webEntity,
    itemType: input.itemType,
    attributes: input.attributes,
    label: input.label,
  };
}

function sanitizeCards(
  primary: PrimaryCategory,
  cards: LiveProductCard[],
  colorHex?: string,
  colorName?: string | null,
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
      { colorHex, colorName, enforceColor: true },
    );
  });
}

/**
 * Stage 1 — Exact visual match.
 *
 * Builds `[Color] + [WEB_DETECTION style] + [PrimaryCategory]` and returns only
 * PDPs that survive the hard category guard.
 */
export async function getExactMatches(
  context: ContextDevService,
  input: MatchStageInput,
): Promise<{ query: string; cards: LiveProductCard[] }> {
  const query = buildExactMatchQuery(toQueryInput(input));
  if (!query.trim()) return { query, cards: [] };

  const raw = await context.searchLiveProducts(
    query,
    input.itemCategory,
    input.signal,
  );

  return {
    query,
    cards: sanitizeCards(
      input.primaryCategory,
      raw,
      input.colorHex,
      input.colorName,
    ),
  };
}

/**
 * Stage 2 — Isolated budget alternatives.
 *
 * Executes only after Stage 1 produced a validated primary product. Inherits
 * PrimaryCategory + Colour; filters to cheaper PDPs in the same locked category.
 */
export async function getBudgetAlternatives(
  context: ContextDevService,
  input: MatchStageInput & {
    /** Validated Stage 1 product — Stage 2 never runs without this. */
    primaryProduct: LiveProductCard;
    maxAlternatives?: number;
  },
): Promise<{ query: string; cards: LiveProductCard[] }> {
  const maxAlternatives = input.maxAlternatives ?? 3;
  const query = buildBudgetAlternativeQuery(toQueryInput(input));

  const raw = await context.searchLiveProducts(
    query,
    input.itemCategory,
    input.signal,
  );

  // Also reconsider Stage 1 leftovers that were same-category but not chosen,
  // so we do not burn an extra extract when cheaper siblings already exist.
  const pool = sanitizeCards(
    input.primaryCategory,
    raw,
    input.colorHex,
    input.colorName,
  );

  const cheaper = pool
    .filter((card) => card.productUrl !== input.primaryProduct.productUrl)
    .filter((card) => card.price < input.primaryProduct.price)
    .sort((a, b) => a.price - b.price)
    .filter(
      (card, index, list) =>
        list.findIndex((other) => other.productUrl === card.productUrl) === index,
    )
    .slice(0, maxAlternatives);

  return { query, cards: cheaper };
}
