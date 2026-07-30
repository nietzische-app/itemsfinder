import { colorNameFromHex } from "@/lib/searchQueryColors";
import {
  PRIMARY_CATEGORY_QUERY_LABEL,
  type PrimaryCategory,
} from "@/lib/primaryCategory";
import { normalizeTr } from "@/lib/itemFamily";

/**
 * Google Lens–inspired query builder.
 *
 * Strict Turkish e-commerce phrasing. Vague filler words ("Fabric", "Material",
 * "Style", Vision's "Clothing"/"Footwear") are stripped so storefronts receive
 * shoppable queries like "Taba Deri Bantlı Sandalet".
 */

export interface ExactQueryInput {
  /** Locked primary category — always forced into the query. */
  primaryCategory: PrimaryCategory;
  /** Dominant colour hex from IMAGE_PROPERTIES. */
  colorHex?: string;
  /** Explicit colour name override (e.g. from attributes). */
  colorName?: string | null;
  /** WEB_DETECTION entity / brand-style phrase. */
  webEntity?: string | null;
  /** Vision object class or curated item type ("Sandalet", "Hırka"). */
  itemType?: string | null;
  /** Free-text attributes ("Mat Siyah • Deri"). */
  attributes?: string | null;
  /** Full detection label as a fallback phrase source. */
  label?: string | null;
}

/** Tokens that pollute storefront ranking and must never appear in a query. */
const VAGUE_NOISE = new Set([
  "clothing",
  "outerwear",
  "footwear",
  "cosmetics",
  "person",
  "apparel",
  "top",
  "giyim",
  "kozmetik",
  "ürün",
  "parca",
  "parça",
  "fabric",
  "material",
  "style",
  "kumaş",
  "kumas",
  "materyal",
  "stil",
  "tarz",
  "moda",
  "fashion",
  "item",
  "product",
  "object",
  "wear",
  "clothes",
  "garment",
  "muadili",
  "muadil",
]);

/** Style / material tokens worth keeping when present in attributes. */
const STYLE_KEEP = new Set([
  "triko",
  "deri",
  "suni",
  "fermuarlı",
  "fermuarli",
  "fermuar",
  "platform",
  "yüksek",
  "yuksek",
  "taban",
  "bilekli",
  "bantlı",
  "bantli",
  "crop",
  "oversize",
  "slim",
  "skinny",
  "mom",
  "wide",
  "straight",
  "mini",
  "midi",
  "maxi",
  "mat",
  "kadife",
  "fitilli",
  "örgü",
  "orgu",
  "hırka",
  "hirka",
  "şort",
  "sort",
  "sneaker",
  "sandalet",
  "topuk",
  "ceket",
  "blazer",
  "jean",
  "kot",
  "askılı",
  "askili",
  "yaka",
  "taba",
  "nubuk",
  "süet",
  "suet",
]);

function pushToken(
  tokens: string[],
  seen: Set<string>,
  value: string | null | undefined,
): void {
  if (!value) return;

  for (const word of value.split(/[\s•·,/|_-]+/)) {
    const clean = word
      .trim()
      .replace(
        /^[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+|[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+$/g,
        "",
      );
    if (clean.length < 2) continue;

    const key = normalizeTr(clean);
    if (seen.has(key) || VAGUE_NOISE.has(key)) continue;

    seen.add(key);
    tokens.push(clean);
  }
}

function resolveColor(input: ExactQueryInput): string | null {
  if (input.colorName?.trim()) return input.colorName.trim();
  if (input.colorHex) return colorNameFromHex(input.colorHex);
  return null;
}

/**
 * Stage 1 — Exact visual match query.
 *
 * Shape: `[Color] + [Brand/Style from WEB_DETECTION] + [PrimaryCategory label]`
 * Example: "Taba Deri Kadın Sandalet"
 */
export function buildExactMatchQuery(input: ExactQueryInput): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  pushToken(tokens, seen, resolveColor(input));
  pushToken(tokens, seen, input.webEntity);
  pushToken(tokens, seen, input.attributes);
  pushToken(tokens, seen, input.label);
  pushToken(tokens, seen, input.itemType);

  // Always force a concrete Turkish category word so storefronts cannot
  // reinterpret an ambiguous phrase as home textiles.
  const categoryLabel = PRIMARY_CATEGORY_QUERY_LABEL[input.primaryCategory];
  if (categoryLabel) {
    const alreadyHasCategory = tokens.some((token) => {
      const key = normalizeTr(token);
      return (
        key === normalizeTr(categoryLabel) ||
        key === normalizeTr(input.itemType ?? "") ||
        STYLE_KEEP.has(key)
      );
    });
    if (!alreadyHasCategory) {
      pushToken(tokens, seen, categoryLabel);
    }
  }

  // Prefer a specific item type over the generic category label when both fit.
  if (input.itemType) {
    pushToken(tokens, seen, input.itemType);
  }

  return tokens.slice(0, 6).join(" ");
}

/**
 * Stage 2 — Budget alternative query.
 *
 * Inherits the locked PrimaryCategory and colour from Stage 1; never invents
 * new visual parameters. Appends "muadili" for Turkish lookalike ranking.
 * Example: "Taba Sandalet muadili"
 */
export function buildBudgetAlternativeQuery(input: ExactQueryInput): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  pushToken(tokens, seen, resolveColor(input));

  // Keep only concrete style/material words from attributes.
  if (input.attributes) {
    for (const word of input.attributes.split(/[\s•·,/]+/)) {
      const clean = word.trim();
      const key = normalizeTr(clean);
      if (!STYLE_KEEP.has(key)) continue;
      pushToken(tokens, seen, clean);
    }
  }

  pushToken(tokens, seen, input.itemType);

  const categoryLabel = PRIMARY_CATEGORY_QUERY_LABEL[input.primaryCategory];
  if (categoryLabel) {
    pushToken(tokens, seen, categoryLabel);
  }

  // Prefer the specific type word (Sandalet) over generic (Ayakkabı) when both
  // are present — drop the generic if we already have a STYLE_KEEP type.
  const compact = tokens.filter((token, index, list) => {
    const key = normalizeTr(token);
    if (key !== normalizeTr(categoryLabel)) return true;
    return !list.some(
      (other, otherIndex) =>
        otherIndex !== index && STYLE_KEEP.has(normalizeTr(other)),
    );
  });

  const query = compact.slice(0, 5).join(" ");
  return query ? `${query} muadili` : `${categoryLabel || "ürün"} muadili`;
}

/** @deprecated Prefer buildExactMatchQuery — kept for callers mid-migration. */
export function buildSearchQuery(parts: {
  itemType: string;
  label?: string;
  colorHex?: string;
  attributes?: string;
}): string {
  return buildExactMatchQuery({
    primaryCategory: "UNKNOWN",
    itemType: parts.itemType,
    label: parts.label,
    colorHex: parts.colorHex,
    attributes: parts.attributes,
  });
}

/** @deprecated Prefer buildBudgetAlternativeQuery. */
export function generateAlternativeQuery(parts: {
  itemType: string;
  label?: string;
  colorHex?: string;
  attributes?: string;
}): string {
  return buildBudgetAlternativeQuery({
    primaryCategory: "UNKNOWN",
    itemType: parts.itemType,
    label: parts.label,
    colorHex: parts.colorHex,
    attributes: parts.attributes,
  });
}
