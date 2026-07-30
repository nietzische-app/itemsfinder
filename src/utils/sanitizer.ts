import { normalizeTr } from "@/lib/itemFamily";
import {
  hasCrossCategoryContamination,
  type PrimaryCategory,
} from "@/lib/primaryCategory";
import {
  colorBucketFromHex,
  colorBucketFromName,
  colorsConflict,
  type ColorBucket,
} from "@/lib/searchQueryColors";

/**
 * Mandatory whitelist schema per PrimaryCategory.
 *
 * A product title/URL/brand must hit at least one allow-token for the locked
 * category. Failures are hard-rejected before any card reaches the UI.
 */

const CATEGORY_WHITELIST: Record<PrimaryCategory, string[]> = {
  FOOTWEAR: [
    "ayakkabi",
    "sandalet",
    "terlik",
    "bot",
    "cizm",
    "cizme",
    "sneaker",
    "loafer",
    "heel",
    "heels",
    "babet",
    "espadril",
    "topuk",
    "shoe",
    "shoes",
    "boot",
    "boots",
    "sandal",
    "sandals",
    "footwear",
    "trainer",
    "trainers",
    "slipper",
  ],
  OUTERWEAR: [
    "ceket",
    "mont",
    "kaban",
    "blazer",
    "hirka",
    "trenckot",
    "trench",
    "jacket",
    "coat",
    "coatigan",
    "overshirt",
    "yelek",
    "park",
    "puffer",
  ],
  TOPS: [
    "tisort",
    "gomlek",
    "bluz",
    "kazak",
    "top",
    "bustiyer",
    "sweater",
    "shirt",
    "blouse",
    "tee",
    "tshirt",
    "hoodie",
    "sweatshirt",
    "atlet",
    "crop",
  ],
  BOTTOMS: [
    "pantolon",
    "sort",
    "etek",
    "tayt",
    "jean",
    "jeans",
    "shorts",
    "skirt",
    "trousers",
    "pants",
    "legging",
    "leggings",
    "chino",
  ],
  BEAUTY: [
    "ruj",
    "allik",
    "maskara",
    "rimel",
    "far",
    "kontur",
    "oje",
    "serum",
    "lipstick",
    "blush",
    "mascara",
    "eyeliner",
    "eyeshadow",
    "foundation",
    "concealer",
    "makyaj",
    "kozmetik",
    "dudak",
    "nail",
    "gloss",
    "liner",
    "highlighter",
    "palette",
    "kalem",
    "fondoten",
    "bronzer",
  ],
  DRESS: ["elbise", "dress", "tulum", "jumpsuit", "gown"],
  ACCESSORIES: [
    "canta",
    "kupe",
    "kolye",
    "bileklik",
    "gozluk",
    "aksesuar",
    "bag",
    "handbag",
    "earring",
    "necklace",
    "bracelet",
    "sunglass",
    "watch",
    "belt",
    "scarf",
    "hoop",
    "hoops",
    "zincir",
    "chain",
  ],
  UNKNOWN: [],
};

/** Home / bedding / furniture terms that must never pass apparel categories. */
const HOME_BLOCKLIST = [
  "carsaf",
  "nevresim",
  "yastik",
  "kilif",
  "yatak",
  "bedding",
  "bedsheet",
  "pillow",
  "duvet",
  "quilt",
  "pike",
  "battaniye",
  "havlu",
  "perde",
  "hali",
  "mobilya",
  "furniture",
  "home-textile",
  "ev-tekstil",
  "yorgan",
  "çarşaf",
];

export interface SanitizerCandidate {
  title: string;
  productUrl?: string;
  brand?: string | null;
}

export interface SanitizeOptions {
  /** Locked detection colour — conflicting titles are discarded. */
  colorHex?: string | null;
  colorName?: string | null;
  /** When false, skip colour conflict checks (catalogue demos without colour). */
  enforceColor?: boolean;
}

function haystackOf(candidate: SanitizerCandidate): string {
  return normalizeTr(
    [candidate.title, candidate.brand ?? "", candidate.productUrl ?? ""].join(" "),
  );
}

function tokensOf(haystack: string): Set<string> {
  return new Set(
    haystack
      .split(/[^a-z0-9ğüşıöç]+/i)
      .map((token) => normalizeTr(token))
      .filter((token) => token.length >= 2),
  );
}

function hitsWhitelist(primary: PrimaryCategory, haystack: string): boolean {
  const allowed = CATEGORY_WHITELIST[primary];
  if (!allowed || allowed.length === 0) return primary === "UNKNOWN";

  const tokens = tokensOf(haystack);
  return allowed.some((token) => {
    const key = normalizeTr(token);
    if (tokens.has(key)) return true;
    // Stem / path fragment for Turkish agglutination (cizm→cizme) and URL paths.
    // Require allow-token length ≥ 3 before substring match so "top" cannot
    // hitchhike on "top-handle" / "laptop".
    if (key.length < 3) return false;
    return Array.from(tokens).some((t) => t.startsWith(key) || t.includes(key));
  });
}

function hitsHomeBlocklist(haystack: string): boolean {
  return HOME_BLOCKLIST.some((token) => haystack.includes(normalizeTr(token)));
}

/**
 * Hard rejection gate: whitelist hit required, home textiles blocked, optional
 * colour conflict check. Replaces soft-only category filtering for live cards.
 */
export function passesWhitelistSanitizer(
  primary: PrimaryCategory,
  candidate: SanitizerCandidate,
  options: SanitizeOptions = {},
): boolean {
  if (primary === "UNKNOWN") return false;

  const haystack = haystackOf(candidate);

  if (hitsHomeBlocklist(haystack)) return false;

  if (hasCrossCategoryContamination(primary, candidate.title, candidate.productUrl, candidate.brand)) {
    return false;
  }

  if (!hitsWhitelist(primary, haystack)) return false;

  const enforceColor = options.enforceColor !== false;
  if (enforceColor) {
    const expected =
      colorBucketFromName(options.colorName) ??
      (options.colorHex ? colorBucketFromHex(options.colorHex) : null);

    if (expected && colorsConflict(expected, candidate.title)) {
      return false;
    }
  }

  return true;
}

/** @deprecated Prefer passesWhitelistSanitizer — kept as a thin alias. */
export function sanitizeProductResult(
  primary: PrimaryCategory,
  candidate: SanitizerCandidate,
  options?: SanitizeOptions,
): boolean {
  return passesWhitelistSanitizer(primary, candidate, options);
}

export function expectedColorBucket(
  colorHex?: string | null,
  colorName?: string | null,
): ColorBucket | null {
  return colorBucketFromName(colorName) ?? (colorHex ? colorBucketFromHex(colorHex) : null);
}
