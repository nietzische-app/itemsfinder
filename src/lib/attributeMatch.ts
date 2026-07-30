import { colorFamiliesContradict, colorFamilyOf, type ColorFamily } from "@/lib/colorFamily";
import { normalizeTr } from "@/lib/itemFamily";
import { TURKISH_MATERIALS, materialGroupOf } from "@/lib/retailVocabulary";
import { COLOR_NAMES } from "@/lib/searchQuery";

/**
 * Does this retailer listing agree with what we detected?
 *
 * The family gate answers "is this the right *kind* of product". That still leaves
 * the beige linen blazer as a candidate for a black leather blazer, and the live
 * stage was taking whichever of those the search engine ranked first — then
 * labelling it the exact match and stamping it with `similarity: 0.9`, a number
 * nothing had measured.
 *
 * This measures it instead. The score that comes out is the same number the UI
 * shows as the match score, so the percentage on the card finally corresponds to
 * something: how much of what we detected the listing actually claims.
 *
 * The scale is attribute agreement, not visual similarity — nothing here compares
 * pixels. It is named for what it is, and a real visual score needs an embedding
 * index over a product feed.
 */

export interface ExpectedAttributes {
  /*
   * No `family` here on purpose. The family ruling is already enforced, as a hard
   * gate, by `rejectProductTitle` — a row of the wrong family never reaches this
   * scorer. Carrying it along as a field nothing reads would suggest it was part of
   * the score.
   */
  /** Measured or model-reported colour of the region. */
  colorHex: string;
  /** Garment noun tokens, e.g. ["triko", "ceket"]. */
  nounTokens: string[];
  /** Descriptor tokens — pattern, material, details, fit. */
  descriptorTokens: string[];
  /**
   * Material groups named anywhere in the detection.
   *
   * Collected across `itemType` *and* `label`, because the material is very often
   * part of the garment noun — the model returns "deri ceket" as the type, and
   * looking for the material only among the descriptors found nothing, so a listing
   * for a linen jacket sailed through as `unknown` instead of contradicting.
   */
  materialGroups: string[];
}

export type Verdict = "agree" | "conflict" | "unknown";

export interface TitleAgreement {
  /** 0..1. Also used as the row's match score, because it is one. */
  score: number;
  color: Verdict;
  material: Verdict;
  /** Fraction of the expected garment noun present in the title. */
  nounOverlap: number;
  /** Fraction of the expected descriptors present in the title. */
  descriptorOverlap: number;
  /** Short human-readable reason, for logs. */
  reason: string;
}

/**
 * Weights.
 *
 * The base is what a row has already earned by surviving the family gate and the
 * disqualifying-term list — it is the right kind of product from an allow-listed
 * retailer. Everything else is evidence for or against, and a colour contradiction
 * outweighs any amount of word overlap, because colour is the attribute a shopper
 * checks first and the one they will not forgive.
 */
const BASE = 0.35;
const NOUN_WEIGHT = 0.2;
const DESCRIPTOR_WEIGHT = 0.15;
const COLOR_AGREE = 0.2;
const COLOR_CONFLICT = -0.3;
const MATERIAL_AGREE = 0.1;
const MATERIAL_CONFLICT = -0.2;

/** Below this a live row may not hold the exact-match slot. */
export const EXACT_MATCH_FLOOR = 0.55;

/**
 * Below this a live row is not worth showing at all.
 *
 * Placed so that **one** contradiction leaves a row on the page and **two** takes
 * it off. A black leather jacket's search results legitimately include the same
 * jacket in beige — that is a browsable alternative, and it scores 0.25. A beige
 * *linen blazer* contradicts on both colour and material, scores 0, and is simply a
 * different garment; offering it under a 0% match tells the shopper nothing except
 * that we could not tell.
 */
export const ALTERNATIVE_FLOOR = 0.2;

function tokensOf(text: string): string[] {
  return normalizeTr(text)
    .split(/[^a-z0-9çğıöşü]+/)
    .filter(Boolean);
}

/** True when `stem` is present in `tokens`, allowing Turkish suffixes. */
function hasStem(tokens: string[], stem: string): boolean {
  const needle = normalizeTr(stem);
  if (needle.length < 3) return tokens.includes(needle);
  return tokens.some((token) => token.startsWith(needle));
}

/**
 * Colour families named in a title.
 *
 * A multi-word palette entry ("Kırık Beyaz") counts only when every one of its
 * words is present, so "Beyaz Gömlek" does not get read as off-white.
 */
export function colorFamiliesIn(title: string): ColorFamily[] {
  const tokens = tokensOf(title);
  const found = new Set<ColorFamily>();

  for (const entry of COLOR_NAMES) {
    const parts = normalizeTr(entry.name).split(/\s+/);
    if (!parts.every((part) => hasStem(tokens, part))) continue;

    const [r, g, b] = entry.rgb;
    found.add(colorFamilyOf(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`));
  }

  return Array.from(found);
}

/** Material groups named in a title, e.g. "denim" for both "denim" and "kot". */
export function materialsIn(title: string): string[] {
  const tokens = tokensOf(title);
  const found = new Set<string>();

  for (const material of TURKISH_MATERIALS) {
    if (hasStem(tokens, material)) found.add(materialGroupOf(material));
  }

  return Array.from(found);
}

/**
 * Scores one listing title against a detection.
 *
 * Absence is never held against a listing: a title that names no colour at all is
 * `unknown`, not a conflict. Retailers write "Kadın Ceket 24YKD" and the garment is
 * still the right one — punishing a terse title would just prefer verbose sellers.
 */
export function scoreTitleAgreement(
  title: string,
  expected: ExpectedAttributes,
): TitleAgreement {
  const tokens = tokensOf(title);

  /*
   * An expectation we do not have scores zero, not neutral. Redistributing the
   * weight would hand a free 0.2 to a listing nothing could be checked against,
   * which is exactly the row that must not be promoted — the exact-match slot is a
   * promise, and "we could not verify anything" is not grounds for making it.
   */
  const nounHits = expected.nounTokens.filter((token) => hasStem(tokens, token));
  const nounOverlap =
    expected.nounTokens.length === 0 ? 0 : nounHits.length / expected.nounTokens.length;

  const descriptorHits = expected.descriptorTokens.filter((token) => hasStem(tokens, token));
  const descriptorOverlap =
    expected.descriptorTokens.length === 0
      ? 0
      : descriptorHits.length / expected.descriptorTokens.length;

  // --- colour ---
  const detectedFamily = colorFamilyOf(expected.colorHex);
  const titleFamilies = colorFamiliesIn(title);

  let color: Verdict = "unknown";
  if (titleFamilies.length > 0) {
    // Any agreeing word wins: "Siyah Beyaz Sneaker" is a two-colour shoe and
    // matching either of them is a match, not half a mismatch.
    color = titleFamilies.some((family) => !colorFamiliesContradict(family, detectedFamily))
      ? "agree"
      : "conflict";
  }

  // --- material ---
  const expectedMaterials = expected.materialGroups;
  const titleMaterials = materialsIn(title);

  let material: Verdict = "unknown";
  if (expectedMaterials.length > 0 && titleMaterials.length > 0) {
    material = titleMaterials.some((found) => expectedMaterials.includes(found))
      ? "agree"
      : "conflict";
  }

  const raw =
    BASE +
    NOUN_WEIGHT * nounOverlap +
    DESCRIPTOR_WEIGHT * descriptorOverlap +
    (color === "agree" ? COLOR_AGREE : color === "conflict" ? COLOR_CONFLICT : 0) +
    (material === "agree" ? MATERIAL_AGREE : material === "conflict" ? MATERIAL_CONFLICT : 0);

  const score = Math.min(1, Math.max(0, raw));

  const notes: string[] = [];
  if (color === "conflict") notes.push(`renk çelişkisi (${titleFamilies.join("/")} ≠ ${detectedFamily})`);
  else if (color === "agree") notes.push("renk uyuyor");
  if (material === "conflict") notes.push(`malzeme çelişkisi (${titleMaterials.join("/")} ≠ ${expectedMaterials.join("/")})`);
  else if (material === "agree") notes.push("malzeme uyuyor");
  if (nounHits.length > 0) notes.push(`ürün adı: ${nounHits.join(", ")}`);
  if (descriptorHits.length > 0) notes.push(`öznitelik: ${descriptorHits.join(", ")}`);

  return {
    score: Math.round(score * 100) / 100,
    color,
    material,
    nounOverlap,
    descriptorOverlap,
    reason: notes.length > 0 ? notes.join("; ") : "ek kanıt yok",
  };
}

/**
 * Tokens too generic to be evidence of anything.
 *
 * Every women's listing on a Turkish storefront says "kadın"; counting it as noun
 * overlap would give a free point to every row and rank on nothing.
 */
const GENERIC = new Set([
  "kadın",
  "erkek",
  "unisex",
  "yeni",
  "sezon",
  "model",
  "ürün",
  "marka",
  "adet",
]);

/**
 * Reads the expectation off a detection.
 *
 * Derived from fields already on the wire rather than adding the structured
 * attributes to it: the garment noun is `itemType`, and material and details are
 * words inside the label.
 */
export function expectedAttributesOf(item: {
  itemType: string;
  label: string;
  colorHex: string;
}): ExpectedAttributes {
  const nounTokens = tokensOf(item.itemType).filter(
    (token) => token.length > 2 && !GENERIC.has(token),
  );

  // Label tokens that are not already the noun: colour word, material, details.
  const nounSet = new Set(nounTokens);
  const descriptorTokens = tokensOf(item.label).filter(
    (token) => token.length > 2 && !GENERIC.has(token) && !nounSet.has(token),
  );

  return {
    colorHex: item.colorHex,
    nounTokens,
    descriptorTokens,
    materialGroups: Array.from(
      new Set(
        [...nounTokens, ...descriptorTokens]
          .filter((token) =>
            TURKISH_MATERIALS.some((material) => normalizeTr(material) === token),
          )
          .map(materialGroupOf),
      ),
    ),
  };
}
