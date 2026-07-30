import {
  colorBucketFromHex,
  colorBucketFromName,
  colorBucketQueryToken,
  colorNameFromHex,
} from "@/lib/searchQueryColors";
import {
  PRIMARY_CATEGORY_QUERY_LABEL,
  type PrimaryCategory,
} from "@/lib/primaryCategory";
import { normalizeTr } from "@/lib/itemFamily";

/**
 * Google Lens–inspired query builder with a Turkish Fashion NLP dictionary.
 *
 * Strict e-commerce phrasing for Trendyol, Zara, LCW, DeFacto, H&M, Amazon TR.
 * Vague filler and literal English Vision labels are normalised before ranking.
 */

export interface ExactQueryInput {
  /** Locked primary category — always forced into the query. */
  primaryCategory: PrimaryCategory;
  /** Dominant colour hex from IMAGE_PROPERTIES (ROI when available). */
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

/** Multi-word English → Turkish fashion phrases (order: longer first). */
const FASHION_PHRASES: Array<[RegExp, string]> = [
  [/\bzip\s*knit\s*cardigan\b/gi, "Fermuarlı Triko Hırka"],
  [/\bknit\s*cardigan\b/gi, "Triko Hırka"],
  [/\bzip\s*cardigan\b/gi, "Fermuarlı Hırka"],
  [/\bleather\s*shorts?\b/gi, "Deri Şort"],
  [/\bhigh[\s-]*top\s*sneakers?\b/gi, "Yüksek Taban Sneaker"],
  [/\bchunky\s*sneakers?\b/gi, "Kalın Taban Sneaker"],
  [/\bmatt?\s*liquid\s*lipstick\b/gi, "Mat Likit Ruj"],
  [/\bliquid\s*lipstick\b/gi, "Likit Ruj"],
  [/\bmatte?\s*lipstick\b/gi, "Mat Ruj"],
  [/\bbiker\s*jacket\b/gi, "Biker Deri Ceket"],
  [/\bleather\s*jacket\b/gi, "Deri Ceket"],
  [/\btrench\s*coat\b/gi, "Trençkot"],
  [/\bwide[\s-]*leg\s*(jeans?|pants?|trousers?)\b/gi, "Bol Paça Pantolon"],
  [/\bmom\s*jeans?\b/gi, "Mom Jean"],
  [/\bcrop(?:ped)?\s*top\b/gi, "Crop Üst"],
  [/\bplatform\s*(sneakers?|shoes?)\b/gi, "Platform Sneaker"],
  [/\bankle\s*boots?\b/gi, "Bilekte Bot"],
  [/\bheeled\s*sandals?\b/gi, "Topuklu Sandalet"],
  [/\bstrap\s*sandals?\b/gi, "Bantlı Sandalet"],
  [/\bdenim\s*jacket\b/gi, "Kot Ceket"],
  [/\bblazer\s*jacket\b/gi, "Blazer Ceket"],
  [/\bhoodie\b/gi, "Kapüşonlu Sweatshirt"],
  [/\bsweatshirt\b/gi, "Sweatshirt"],
  [/\bt[\s-]?shirt\b/gi, "Tişört"],
  [/\bbutton[\s-]?down\b/gi, "Gömlek"],
];

/** Single-token English / Vision labels → Turkish storefront terms. */
const FASHION_WORDS: Record<string, string> = {
  zip: "Fermuarlı",
  zipper: "Fermuarlı",
  knit: "Triko",
  knitted: "Triko",
  cardigan: "Hırka",
  leather: "Deri",
  shorts: "Şort",
  short: "Şort",
  "high-top": "Yüksek",
  hightop: "Yüksek",
  sneaker: "Sneaker",
  sneakers: "Sneaker",
  matt: "Mat",
  matte: "Mat",
  liquid: "Likit",
  lipstick: "Ruj",
  jacket: "Ceket",
  coat: "Mont",
  blazer: "Blazer",
  trench: "Trençkot",
  jeans: "Jean",
  jean: "Jean",
  trousers: "Pantolon",
  pants: "Pantolon",
  skirt: "Etek",
  dress: "Elbise",
  blouse: "Bluz",
  shirt: "Gömlek",
  sweater: "Kazak",
  hoodie: "Sweatshirt",
  boots: "Bot",
  boot: "Bot",
  sandals: "Sandalet",
  sandal: "Sandalet",
  heels: "Topuklu",
  heel: "Topuklu",
  loafers: "Loafer",
  loafer: "Loafer",
  footwear: "Ayakkabı",
  outerwear: "Ceket",
  clothing: "",
  cosmetics: "Makyaj",
  makeup: "Makyaj",
  blush: "Allık",
  mascara: "Maskara",
  eyeshadow: "Far",
  foundation: "Fondöten",
  contour: "Kontür",
  serum: "Serum",
  nail: "Oje",
  platform: "Platform",
  chunky: "Kalın",
  oversized: "Oversize",
  cropped: "Crop",
  crop: "Crop",
  ribbed: "Fitilli",
  velvet: "Kadife",
  suede: "Süet",
  denim: "Kot",
};

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
  "likit",
  "ruj",
]);

/**
 * Applies the Fashion NLP dictionary: multi-word phrases first, then
 * token-level English → Turkish rewrites tailored for TR storefronts.
 */
export function normalizeFashionQuery(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  for (const [pattern, replacement] of FASHION_PHRASES) {
    text = text.replace(pattern, replacement);
  }

  return text
    .split(/[\s•·,/|_-]+/)
    .map((word) => {
      const clean = word
        .trim()
        .replace(
          /^[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+|[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+$/g,
          "",
        );
      if (!clean) return "";
      const key = normalizeTr(clean);
      if (VAGUE_NOISE.has(key)) return "";
      const mapped = FASHION_WORDS[key];
      if (mapped === "") return "";
      return mapped ?? clean;
    })
    .filter(Boolean)
    .join(" ");
}

function pushToken(
  tokens: string[],
  seen: Set<string>,
  value: string | null | undefined,
): void {
  if (!value) return;

  const normalised = normalizeFashionQuery(value);
  for (const word of normalised.split(/\s+/)) {
    const clean = word.trim();
    if (clean.length < 2) continue;

    const key = normalizeTr(clean);
    if (seen.has(key) || VAGUE_NOISE.has(key)) continue;

    seen.add(key);
    tokens.push(clean);
  }
}

function resolveColor(input: ExactQueryInput): string | null {
  const bucket =
    colorBucketFromName(input.colorName) ??
    (input.colorHex ? colorBucketFromHex(input.colorHex) : null);
  if (bucket) return colorBucketQueryToken(bucket);

  if (input.colorName?.trim()) return input.colorName.trim();
  if (input.colorHex) return colorNameFromHex(input.colorHex);
  return null;
}

/**
 * Stage 1 — Exact visual match query.
 *
 * Shape: `[Color] + [Brand/Style from WEB_DETECTION] + [PrimaryCategory label]`
 * Example: "Taba Deri Kadın Sandalet" / "Fermuarlı Triko Hırka"
 */
export function buildExactMatchQuery(input: ExactQueryInput): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const color = resolveColor(input);
  pushToken(tokens, seen, color);
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

  // Colour bucket is mandatory when Vision supplied one.
  if (color && !tokens.some((token) => normalizeTr(token) === normalizeTr(color))) {
    tokens.unshift(color);
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

  const color = resolveColor(input);
  pushToken(tokens, seen, color);

  // Keep only concrete style/material words from attributes.
  if (input.attributes) {
    const normalised = normalizeFashionQuery(input.attributes);
    for (const word of normalised.split(/\s+/)) {
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
