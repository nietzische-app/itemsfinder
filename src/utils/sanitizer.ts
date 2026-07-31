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
import type { ApparelGender, TopsSubtype } from "@/lib/searchQueryBuilder";

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
    "rouge",
    "lip",
  ],
  DRESS: ["elbise", "dress", "tulum", "jumpsuit", "gown"],
  ACCESSORIES: [
    "canta",
    "kupe",
    "kolye",
    "bileklik",
    "gozluk",
    "gozlug",
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
    "bere",
    "beanie",
    "hat",
    "sapka",
    "bone",
    "tote",
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
  /** TOPS subtype lock — T-Shirt must never match Body/Crop/Bluz. */
  topsSubtype?: TopsSubtype | null;
  /** Apparel gender — reject cross-gender PDPs when locked. */
  gender?: ApparelGender | null;
  /** Detection item type (e.g. Sneaker) for footwear subtype locks. */
  itemType?: string | null;
}

/** Titles/URLs that are incompatible with a locked T-Shirt detection. */
const TSHIRT_HARD_REJECT = [
  "body",
  "bodysuit",
  "body suit",
  "crop",
  "cropped",
  "askili",
  "askılı",
  "halter",
  "bluz",
  "blouse",
  "atlet",
  "tank top",
  "tanktop",
  "camisole",
  "straplez",
  "strapless",
  "kalp yaka",
  "sweetheart",
  "bustiyer",
  "bustier",
  "hirka",
  "hırka",
  "cardigan",
  "sweatshirt",
  "hoodie",
  "kapuson",
  "kazak",
  "jumper",
  "sweater",
];

/** T-Shirt may ONLY match titles that contain one of these stems. */
const TSHIRT_HARD_ALLOW = ["tisort", "tişört", "tshirt", "t-shirt", "tee"];

/** Footwear hard-block (cross-category / wrong shoe type). */
const FOOTWEAR_HARD_REJECT = [
  "ceket",
  "jacket",
  "pantolon",
  "trousers",
  "carsaf",
  "çarşaf",
  "nevresim",
  "bedding",
  "bedsheet",
];

/** Extra blocks when the locked detection is a sneaker (not a sandal). */
const SNEAKER_HARD_REJECT = ["sandalet", "sandal", "heel", "topuklu"];

function hitsSubtypeMismatch(
  topsSubtype: TopsSubtype | null | undefined,
  primary: PrimaryCategory,
  haystack: string,
  itemType?: string | null,
): boolean {
  if (topsSubtype === "tshirt") {
    if (TSHIRT_HARD_REJECT.some((token) => haystack.includes(foldAscii(token)))) {
      return true;
    }
    // Allowlist-only: must contain Tişört / T-Shirt / tee.
    const allowed = TSHIRT_HARD_ALLOW.some((token) =>
      haystack.includes(foldAscii(token)),
    );
    return !allowed;
  }

  if (primary === "FOOTWEAR") {
    if (FOOTWEAR_HARD_REJECT.some((token) => haystack.includes(foldAscii(token)))) {
      return true;
    }
    const sneakerLock = /sneaker|trainer|spor ayakkab|hi-?top|bilekli/i.test(
      itemType ?? "",
    );
    if (
      sneakerLock &&
      SNEAKER_HARD_REJECT.some((token) => haystack.includes(foldAscii(token)))
    ) {
      return true;
    }
  }

  return false;
}

const MALE_GENDER_REJECT = [
  "/kadin/",
  "/kadın/",
  "kadin-",
  "kadın-",
  "kadin ",
  "kadın ",
  " woman",
  "women",
  "ladies",
  "bayan",
  "girl",
  "body",
  "bodysuit",
  "askili",
  "askılı",
  "halter",
  "kalp yaka",
  "crop",
  "bluz",
  "blouse",
];

const FEMALE_GENDER_REJECT = [
  "/erkek/",
  "erkek-",
  "erkek ",
  " men ",
  "man's",
  "mens ",
  "male ",
];

function hitsGenderMismatch(
  gender: ApparelGender | null | undefined,
  haystack: string,
  topsSubtype?: TopsSubtype | null,
): boolean {
  if (gender === "male") {
    return MALE_GENDER_REJECT.some((token) => haystack.includes(foldAscii(token)));
  }
  if (gender === "unisex") {
    // Unisex T-Shirts still cannot be women's Body / Askılı / /kadin/ cuts.
    const unisexReject =
      topsSubtype === "tshirt" || topsSubtype === "other" || !topsSubtype
        ? [
            "body",
            "bodysuit",
            "askili",
            "askılı",
            "halter",
            "kalp yaka",
            "/kadin/",
            "/kadın/",
            "kadin-",
            "kadın-",
          ]
        : ["body", "bodysuit", "askili", "askılı", "halter", "kalp yaka"];
    return unisexReject.some((token) => haystack.includes(foldAscii(token)));
  }
  if (gender === "female") {
    return FEMALE_GENDER_REJECT.some((token) => haystack.includes(foldAscii(token)));
  }
  return false;
}

/** Fold Turkish diacritics so whitelist stems like `gozluk` hit `gözlüğü`. */
function foldAscii(text: string): string {
  return normalizeTr(text)
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function haystackOf(candidate: SanitizerCandidate): string {
  return foldAscii(
    [candidate.title, candidate.brand ?? "", candidate.productUrl ?? ""].join(" "),
  );
}

function tokensOf(haystack: string): Set<string> {
  return new Set(
    haystack
      .split(/[^a-z0-9]+/i)
      .map((token) => foldAscii(token))
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

  // Shade names like "Pillow Talk" must not trip the bedding blocklist on beauty.
  if (primary !== "BEAUTY" && hitsHomeBlocklist(haystack)) return false;

  if (hasCrossCategoryContamination(primary, candidate.title, candidate.productUrl, candidate.brand)) {
    return false;
  }

  if (!hitsWhitelist(primary, haystack)) return false;

  if (hitsSubtypeMismatch(options.topsSubtype, primary, haystack, options.itemType)) {
    return false;
  }
  if (hitsGenderMismatch(options.gender, haystack, options.topsSubtype)) return false;

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
