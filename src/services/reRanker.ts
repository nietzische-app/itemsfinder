import { normalizeTr } from "@/lib/itemFamily";
import { primaryCategoryOf, type PrimaryCategory } from "@/lib/primaryCategory";
import {
  colorBucketFromHex,
  colorBucketFromName,
  colorBucketQueryToken,
} from "@/lib/searchQueryColors";
import {
  extractMaterialsAndPatterns,
  isBasicSolidApparel,
  type ApparelGender,
  type TopsSubtype,
} from "@/lib/searchQueryBuilder";

/**
 * Multi-candidate re-ranking for PDP matches.
 *
 * Weights:
 *   Category alignment ………… 40%
 *   Colour & texture keywords … 30%
 *   WEB_DETECTION similarity … 30%
 *
 * Candidates scoring above the exact-match threshold become the Exact Match
 * (`Birebir Eşleşme`) and sit at the top of the /analyze result list.
 *
 * Basic solid staples (black/white tee, blue jean, black short) use a lower
 * threshold because they are widely stocked across TR storefronts.
 */

export const EXACT_MATCH_THRESHOLD = 0.85;

/** Relaxed bar for basic solid-colour apparel with high marketplace coverage. */
export const BASIC_SOLID_EXACT_THRESHOLD = 0.72;

export interface ReRankTarget {
  primaryCategory: PrimaryCategory;
  colorHex?: string | null;
  colorName?: string | null;
  /** WEB_DETECTION phrase / brand-style entity. */
  webEntity?: string | null;
  /** Vision entity confidence 0..1 when available. */
  webEntityScore?: number | null;
  /** LOGO_DETECTION brand. */
  brandLogo?: string | null;
  attributes?: string | null;
  label?: string | null;
  itemType?: string | null;
  materials?: string[];
  patterns?: string[];
  topsSubtype?: TopsSubtype | null;
  gender?: ApparelGender | null;
}

export interface ReRankCandidate {
  title: string;
  productUrl?: string;
  brand?: string | null;
  /** Optional prior similarity hint (0..1). */
  priorSimilarity?: number;
}

export interface RankedCandidate<T extends ReRankCandidate = ReRankCandidate> {
  candidate: T;
  /** Composite 0..1 match score. */
  score: number;
  breakdown: {
    category: number;
    colorTexture: number;
    visual: number;
  };
  /** True when score clears the exact-match threshold. */
  isExact: boolean;
}

/** Exact-match bar for this target — lower for basic solid staples. */
export function exactThresholdFor(target: ReRankTarget): number {
  if (
    isBasicSolidApparel({
      primaryCategory: target.primaryCategory,
      topsSubtype: target.topsSubtype,
      colorName: target.colorName,
      colorHex: target.colorHex,
      patterns: target.patterns,
      label: target.label,
      itemType: target.itemType,
      attributes: target.attributes,
      webEntity: target.webEntity,
    })
  ) {
    return BASIC_SOLID_EXACT_THRESHOLD;
  }
  return EXACT_MATCH_THRESHOLD;
}

function haystackOf(candidate: ReRankCandidate): string {
  return normalizeTr(
    [candidate.title, candidate.brand ?? "", candidate.productUrl ?? ""].join(" "),
  );
}

function categoryScore(primary: PrimaryCategory, candidate: ReRankCandidate): number {
  if (primary === "UNKNOWN") return 0.5;
  const inferred = primaryCategoryOf(
    `${candidate.title} ${candidate.brand ?? ""} ${candidate.productUrl ?? ""}`,
  );
  if (inferred === primary) return 1;
  if (inferred === "UNKNOWN") return 0.35;
  return 0;
}

function colorTextureScore(target: ReRankTarget, haystack: string): number {
  let hits = 0;
  let total = 0;

  const color =
    colorBucketFromName(target.colorName) ??
    (target.colorHex ? colorBucketFromHex(target.colorHex) : null);
  const colorToken = color ? colorBucketQueryToken(color) : null;

  if (colorToken) {
    total += 1;
    const key = normalizeTr(colorToken);
    // Krem/Bej bucket may appear as krem or bej in titles.
    if (
      haystack.includes(key) ||
      (color === "Krem/Bej" &&
        (haystack.includes("krem") || haystack.includes("bej") || haystack.includes("beige")))
    ) {
      hits += 1;
    }
  }

  const materials =
    target.materials && target.materials.length > 0
      ? target.materials
      : extractMaterialsAndPatterns(
          [target.webEntity, target.attributes, target.label].filter(Boolean).join(" "),
        ).materials;

  const patterns =
    target.patterns && target.patterns.length > 0
      ? target.patterns
      : extractMaterialsAndPatterns(
          [target.webEntity, target.attributes, target.label].filter(Boolean).join(" "),
        ).patterns;

  for (const material of materials) {
    total += 1;
    if (haystack.includes(normalizeTr(material))) hits += 1;
  }
  for (const pattern of patterns) {
    total += 1;
    if (haystack.includes(normalizeTr(pattern))) hits += 1;
  }

  if (total === 0) return 0.55; // no descriptors → neutral, don't punish
  return hits / total;
}

function visualScore(target: ReRankTarget, haystack: string): number {
  const entityScore = Math.max(0, Math.min(1, target.webEntityScore ?? 0.7));
  const phrase = target.webEntity?.trim();
  const brand = target.brandLogo?.trim();

  let overlap = 0.4; // base when no phrase to compare

  if (phrase) {
    const tokens = normalizeTr(phrase)
      .split(/[^a-z0-9ğüşıöç]+/i)
      .filter((t) => t.length >= 3);
    if (tokens.length === 0) {
      overlap = 0.5;
    } else {
      const matched = tokens.filter((t) => haystack.includes(t)).length;
      overlap = matched / tokens.length;
    }
  }

  let brandBoost = 0;
  if (brand && haystack.includes(normalizeTr(brand))) {
    brandBoost = 0.25;
  }

  // Subtype alignment boost for TOPS (tee vs body).
  if (target.topsSubtype === "tshirt") {
    if (/tişört|tisort|t-shirt|tshirt|\btee\b/i.test(haystack)) {
      overlap = Math.min(1, overlap + 0.2);
    }
    if (/body|bodysuit|crop|askılı|askili|bluz/i.test(haystack)) {
      overlap = Math.max(0, overlap - 0.35);
    }
  }

  if (target.gender === "male" && /erkek|men'?s|male/i.test(haystack)) {
    overlap = Math.min(1, overlap + 0.15);
  }

  return Math.min(1, entityScore * 0.55 + overlap * 0.45 + brandBoost);
}

/** Scores one candidate against the Vision-locked target descriptors. */
export function scoreCandidate(
  target: ReRankTarget,
  candidate: ReRankCandidate,
): RankedCandidate {
  const haystack = haystackOf(candidate);
  const category = categoryScore(target.primaryCategory, candidate);
  const colorTexture = colorTextureScore(target, haystack);
  let visual = visualScore(target, haystack);

  if (typeof candidate.priorSimilarity === "number") {
    visual = Math.min(1, visual * 0.7 + candidate.priorSimilarity * 0.3);
  }

  const score = category * 0.4 + colorTexture * 0.3 + visual * 0.3;
  const threshold = exactThresholdFor(target);

  return {
    candidate,
    score,
    breakdown: { category, colorTexture, visual },
    isExact: score >= threshold,
  };
}

/**
 * Ranks candidates by composite match score (desc). Highest scorer above the
 * exact threshold is flagged `isExact` for the Birebir Eşleşme slot.
 */
export function reRankCandidates<T extends ReRankCandidate>(
  target: ReRankTarget,
  candidates: T[],
): Array<RankedCandidate<T>> {
  const threshold = exactThresholdFor(target);
  return candidates
    .map((candidate) => scoreCandidate(target, candidate) as RankedCandidate<T>)
    .sort((a, b) => b.score - a.score)
    .map((entry, index) => {
      // Only the top card may claim Exact Match, even if several clear the bar.
      const isExact = index === 0 && entry.score >= threshold;
      return { ...entry, isExact };
    });
}

/**
 * Picks the Exact Match card and the remaining ordered pool.
 * When nothing clears the threshold, `exact` is null and all stay in `rest`
 * sorted by score for fallback display.
 */
export function pickExactAndRest<T extends ReRankCandidate>(
  target: ReRankTarget,
  candidates: T[],
): { exact: RankedCandidate<T> | null; rest: Array<RankedCandidate<T>>; ranked: Array<RankedCandidate<T>> } {
  const ranked = reRankCandidates(target, candidates);
  const exact = ranked.find((entry) => entry.isExact) ?? null;
  const rest = exact
    ? ranked.filter((entry) => entry.candidate !== exact.candidate)
    : ranked;
  return { exact, rest, ranked };
}
