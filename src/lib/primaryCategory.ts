import { familyOf, normalizeTr, type ItemFamily } from "@/lib/itemFamily";
import type { PrimaryCategory } from "@/types";

export type { PrimaryCategory } from "@/types";

/**
 * Non-negotiable primary category locked onto every detection.
 *
 * Cross-category hallucinations (sandals → bedsheets) are structurally
 * impossible once a product must share this tag with its detection.
 */

const FAMILY_TO_PRIMARY: Record<ItemFamily, PrimaryCategory> = {
  footwear: "FOOTWEAR",
  outerwear: "OUTERWEAR",
  top: "TOPS",
  bottom: "BOTTOMS",
  dress: "DRESS",
  bag: "ACCESSORIES",
  accessory: "ACCESSORIES",
  lips: "BEAUTY",
  eyes: "BEAUTY",
  face: "BEAUTY",
  unknown: "UNKNOWN",
};

/** Turkish label used inside e-commerce queries for each primary category. */
export const PRIMARY_CATEGORY_QUERY_LABEL: Record<PrimaryCategory, string> = {
  FOOTWEAR: "Ayakkabı",
  OUTERWEAR: "Ceket",
  TOPS: "Üst",
  BOTTOMS: "Alt",
  DRESS: "Elbise",
  BEAUTY: "Makyaj",
  ACCESSORIES: "Aksesuar",
  UNKNOWN: "",
};

/**
 * URL path fragments that confirm a PDP belongs to a primary category.
 * Used as a soft boost / hard reject when the path clearly contradicts.
 */
const CATEGORY_URL_HINTS: Record<PrimaryCategory, string[]> = {
  FOOTWEAR: [
    "/sandalet",
    "/ayakkabi",
    "/ayakkabı",
    "/sneaker",
    "/bot",
    "/shoe",
    "/footwear",
    "/spor-ayakkabi",
  ],
  OUTERWEAR: ["/ceket", "/mont", "/kaban", "/hirka", "/hırka", "/jacket", "/coat", "/blazer"],
  TOPS: ["/tisort", "/tişört", "/gomlek", "/gömlek", "/bluz", "/kazak", "/top", "/shirt"],
  BOTTOMS: ["/sort", "/şort", "/pantolon", "/etek", "/jean", "/shorts", "/skirt", "/trousers"],
  DRESS: ["/elbise", "/dress", "/tulum"],
  BEAUTY: ["/ruj", "/makyaj", "/beauty", "/lipstick", "/kozmetik", "/dudak"],
  ACCESSORIES: ["/canta", "/çanta", "/kupe", "/küpe", "/kolye", "/aksesuar", "/bag", "/gozluk"],
  UNKNOWN: [],
};

/**
 * Hard-block tokens. If a FOOTWEAR (or other) detection surfaces a product
 * whose title/URL contains these, the card is discarded immediately.
 */
const CROSS_CATEGORY_BLOCKLIST: Partial<Record<PrimaryCategory, string[]>> = {
  FOOTWEAR: [
    "çarşaf",
    "carsaf",
    "nevresim",
    "yastık",
    "yastik",
    "kılıf",
    "kilif",
    "yatak",
    "bedding",
    "bedsheet",
    "pillow",
    "duvet",
    "quilt",
    "çarşaflı",
    "pike",
    "battaniye",
    "havlu",
    "perde",
    "halı",
    "hali",
    "mobilya",
    "furniture",
    "home-textile",
    "ev-tekstil",
  ],
  OUTERWEAR: ["çarşaf", "nevresim", "yastık", "bedding", "bedsheet"],
  TOPS: ["çarşaf", "nevresim", "yastık", "bedding", "bedsheet", "ayakkabı", "sandalet"],
  BOTTOMS: ["çarşaf", "nevresim", "yastık", "bedding", "bedsheet", "ayakkabı", "sandalet"],
  DRESS: ["çarşaf", "nevresim", "yastık", "bedding"],
  BEAUTY: ["çarşaf", "nevresim", "ayakkabı", "sandalet", "ceket", "pantolon"],
  ACCESSORIES: ["çarşaf", "nevresim", "yastık", "bedding"],
};

/** Maps an ItemFamily (or free text) onto the locked PrimaryCategory. */
export function primaryCategoryOf(textOrFamily: string | ItemFamily): PrimaryCategory {
  if (
    textOrFamily === "footwear" ||
    textOrFamily === "outerwear" ||
    textOrFamily === "top" ||
    textOrFamily === "bottom" ||
    textOrFamily === "dress" ||
    textOrFamily === "bag" ||
    textOrFamily === "accessory" ||
    textOrFamily === "lips" ||
    textOrFamily === "eyes" ||
    textOrFamily === "face" ||
    textOrFamily === "unknown"
  ) {
    return FAMILY_TO_PRIMARY[textOrFamily];
  }

  return FAMILY_TO_PRIMARY[familyOf(textOrFamily)];
}

/** Reverse map used when catalogue code still speaks in ItemFamily. */
export function familyFromPrimary(primary: PrimaryCategory): ItemFamily {
  switch (primary) {
    case "FOOTWEAR":
      return "footwear";
    case "OUTERWEAR":
      return "outerwear";
    case "TOPS":
      return "top";
    case "BOTTOMS":
      return "bottom";
    case "DRESS":
      return "dress";
    case "BEAUTY":
      return "lips";
    case "ACCESSORIES":
      return "accessory";
    default:
      return "unknown";
  }
}

function haystackOf(title: string, url?: string, brand?: string | null): string {
  return normalizeTr([title, brand ?? "", url ?? ""].join(" "));
}

/**
 * True when the product text/URL contains a hard-blocked cross-category token
 * for the locked primary (e.g. "çarşaf" under FOOTWEAR).
 */
export function hasCrossCategoryContamination(
  primary: PrimaryCategory,
  title: string,
  url?: string,
  brand?: string | null,
): boolean {
  const blocked = CROSS_CATEGORY_BLOCKLIST[primary];
  if (!blocked || blocked.length === 0) return false;

  const haystack = haystackOf(title, url, brand);
  return blocked.some((token) => haystack.includes(normalizeTr(token)));
}

/**
 * True when the product's inferred primary matches the locked detection primary.
 * UNKNOWN detections are permissive; UNKNOWN products against a locked primary
 * are rejected (cannot prove they belong).
 */
export function matchesPrimaryCategory(
  primary: PrimaryCategory,
  title: string,
  url?: string,
  brand?: string | null,
): boolean {
  if (primary === "UNKNOWN") return true;

  if (hasCrossCategoryContamination(primary, title, url, brand)) {
    return false;
  }

  const inferred = primaryCategoryOf(`${title} ${brand ?? ""}`);
  if (inferred === primary) return true;

  // URL path hints can rescue titles that omit the garment word but live under
  // the right storefront taxonomy (/sandalet/, /ayakkabi/, …).
  if (url && categoryUrlAgrees(primary, url)) return true;

  // Title clearly belongs to a *different* primary — reject.
  if (inferred !== "UNKNOWN") return false;

  // Ambiguous title with no contradictory URL hint — reject rather than risk
  // a sandal → bedsheet hallucination.
  return false;
}

/** True when the URL path contains a taxonomy fragment for this primary. */
export function categoryUrlAgrees(primary: PrimaryCategory, url: string): boolean {
  const hints = CATEGORY_URL_HINTS[primary];
  if (hints.length === 0) return false;

  try {
    const path = normalizeTr(new URL(url).pathname);
    return hints.some((hint) => path.includes(normalizeTr(hint)));
  } catch {
    return hints.some((hint) => normalizeTr(url).includes(normalizeTr(hint)));
  }
}

/**
 * Sanitises a candidate product against the locked primary category.
 * Returns false when the card must be discarded immediately.
 */
export function passesCategoryGuard(
  primary: PrimaryCategory,
  candidate: { title: string; productUrl?: string; brand?: string | null },
): boolean {
  return matchesPrimaryCategory(
    primary,
    candidate.title,
    candidate.productUrl,
    candidate.brand,
  );
}
