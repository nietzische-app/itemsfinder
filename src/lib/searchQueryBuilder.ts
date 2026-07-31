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
 * LOGO_DETECTION brands are prepended; textures/patterns are mandatory when seen.
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
  /** LOGO_DETECTION brand (Nike, Zara, …) — prepended when present. */
  brandLogo?: string | null;
  /** Explicit material descriptors extracted from ROI analysis. */
  materials?: string[] | null;
  /** Explicit pattern descriptors extracted from ROI analysis. */
  patterns?: string[] | null;
  /** TOPS subtype lock (Tişört vs Body/Crop/…). */
  topsSubtype?: TopsSubtype | null;
  /** Apparel gender / fit signal for storefront queries. */
  gender?: ApparelGender | null;
}

/** Fine-grained TOPS subtypes — never collapse these to vague "Üst". */
export type TopsSubtype =
  | "tshirt"
  | "body"
  | "crop"
  | "shirt"
  | "sweatshirt"
  | "cardigan"
  | "blouse"
  | "tank"
  | "knit"
  | "other";

/** Storefront gender token for apparel queries. */
export type ApparelGender = "male" | "female" | "unisex";

const TOPS_SUBTYPE_LABEL: Record<TopsSubtype, string> = {
  tshirt: "Tişört",
  body: "Body",
  crop: "Crop Tişört",
  shirt: "Gömlek",
  sweatshirt: "Sweatshirt",
  cardigan: "Hırka",
  blouse: "Bluz",
  tank: "Atlet",
  knit: "Kazak",
  other: "Tişört",
};

const GENDER_QUERY_TOKEN: Record<ApparelGender, string> = {
  male: "Erkek",
  female: "Kadın",
  unisex: "Unisex",
};

/** Neckline phrases appended when confidently detected. */
const NECKLINE_RULES: Array<{ display: string; aliases: string[] }> = [
  {
    display: "Bisiklet Yaka",
    aliases: [
      "bisiklet yaka",
      "crewneck",
      "crew neck",
      "crew-neck",
      "round neck",
      "round-neck",
      "yuvarlak yaka",
    ],
  },
  {
    display: "V Yaka",
    aliases: ["v yaka", "v-neck", "vneck", "v neck"],
  },
  {
    display: "Halter Yaka",
    aliases: ["halter", "halter yaka", "halterneck"],
  },
  {
    display: "Kalp Yaka",
    aliases: ["kalp yaka", "sweetheart", "heart neck"],
  },
];

/**
 * Classifies a TOPS detection into a concrete subtype.
 * Vague Vision labels ("Top", "Üst") default to `tshirt` unless body/crop cues win.
 */
export function extractTopsSubtype(
  text: string | null | undefined,
): TopsSubtype | null {
  if (!text?.trim()) return null;
  const hay = foldQueryText(text);

  if (
    /\b(body|bodysuit|body\s*suit|askili\s*body|kalp\s*yaka|halter)\b/.test(hay)
  ) {
    return "body";
  }
  if (/\b(crop|cropped|crop\s*top|crop\s*ust)\b/.test(hay)) {
    return "crop";
  }
  if (/\b(bluz|blouse)\b/.test(hay)) return "blouse";
  if (/\b(atlet|tank\s*top|tanktop|camisole)\b/.test(hay)) return "tank";
  if (/\b(hirka|cardigan|coatigan)\b/.test(hay)) return "cardigan";
  if (/\b(sweatshirt|hoodie|kapusonlu|kapüşonlu)\b/.test(hay)) {
    return "sweatshirt";
  }
  if (/\b(gomlek|gömlek|button\s*down|buttondown)\b/.test(hay)) return "shirt";
  if (/\b(kazak|jumper|sweater|triko\s*kazak|cable\s*knit)\b/.test(hay)) {
    return "knit";
  }
  if (
    /\b(tisort|tişört|tshirt|t[\s-]?shirt|tee|crewneck|bisiklet\s*yaka)\b/.test(
      hay,
    )
  ) {
    return "tshirt";
  }
  // Vision "Top" / Turkish "Üst" with no feminine cut cues → basic tee.
  if (/\b(top|ust|üst)\b/.test(hay)) return "tshirt";

  return null;
}

/**
 * Infers apparel gender from ROI text, web entities, and fit cues.
 * Male/unisex + wide/oversize shoulders bias toward Erkek for basic tees.
 */
export function extractApparelGender(
  text: string | null | undefined,
): ApparelGender | null {
  if (!text?.trim()) return null;
  const hay = foldQueryText(text);

  const female =
    /\b(kadin|kadın|woman|women|ladies|bayan|female|girl|kız|kiz)\b/.test(hay) ||
    /\b(body|bodysuit|crop|bluz|blouse|halter|askili|askılı|kalp\s*yaka)\b/.test(
      hay,
    );
  const male =
    /\b(erkek|man|men|male|bay|gentleman)\b/.test(hay) ||
    /\b(wide[\s-]?fit|genis\s*omuz|geniş\s*omuz)\b/.test(hay);
  const unisex =
    /\b(unisex|oversize|oversized)\b/.test(hay) ||
    /\b(crewneck|bisiklet\s*yaka|basic\s*tee|basic\s*tisort)\b/.test(hay);

  if (male && !female) return "male";
  if (female && !male) return "female";
  if (unisex && !female) return "unisex";
  if (male && female) return "unisex";
  return null;
}

/** Neckline display token when present in the detection phrase. */
export function extractNeckline(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  const hay = foldQueryText(text);
  for (const rule of NECKLINE_RULES) {
    if (rule.aliases.some((alias) => hay.includes(foldQueryText(alias)))) {
      return rule.display;
    }
  }
  return null;
}

/** True for plain solid staples that are widely stocked (basic tee, jean, short). */
export function isBasicSolidApparel(input: {
  primaryCategory: PrimaryCategory;
  topsSubtype?: TopsSubtype | null;
  colorName?: string | null;
  colorHex?: string | null;
  patterns?: string[] | null;
  label?: string | null;
  itemType?: string | null;
  attributes?: string | null;
  webEntity?: string | null;
}): boolean {
  const hay = foldQueryText(
    [input.label, input.itemType, input.attributes, input.webEntity]
      .filter(Boolean)
      .join(" "),
  );

  const busyPattern =
    (input.patterns ?? []).some((p) => {
      const key = normalizeTr(p);
      return key !== "düz" && key !== "duz";
    }) ||
    /\b(ekose|cizgili|çizgili|cicekli|çiçekli|leopar|baskili|baskılı|graphic|print)\b/.test(
      hay,
    );
  if (busyPattern) return false;

  const color =
    colorBucketFromName(input.colorName) ??
    (input.colorHex ? colorBucketFromHex(input.colorHex) : null);

  if (input.primaryCategory === "TOPS") {
    const subtype =
      input.topsSubtype ??
      extractTopsSubtype(
        [input.itemType, input.label, input.webEntity, input.attributes]
          .filter(Boolean)
          .join(" "),
      );
    if (subtype !== "tshirt" && subtype !== "other" && subtype !== null) {
      return false;
    }
    return color === "Siyah" || color === "Beyaz" || /\b(siyah|beyaz|black|white)\b/.test(hay);
  }

  if (input.primaryCategory === "BOTTOMS") {
    const jean = /\b(jean|jeans|kot|denim)\b/.test(hay);
    const shorts = /\b(sort|şort|shorts)\b/.test(hay);
    if (jean && (color === "Mavi" || color === "Lacivert" || /\b(mavi|blue)\b/.test(hay))) {
      return true;
    }
    if (shorts && (color === "Siyah" || /\b(siyah|black)\b/.test(hay))) {
      return true;
    }
  }

  return false;
}

function foldQueryText(text: string): string {
  return normalizeTr(text)
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function resolveTopsSubtype(input: ExactQueryInput): TopsSubtype | null {
  if (input.primaryCategory !== "TOPS") return null;
  if (input.topsSubtype) return input.topsSubtype;
  return extractTopsSubtype(
    [input.webEntity, input.attributes, input.label, input.itemType]
      .filter(Boolean)
      .join(" "),
  );
}

function resolveApparelGender(input: ExactQueryInput): ApparelGender | null {
  if (input.gender) return input.gender;
  const fromText = extractApparelGender(
    [input.webEntity, input.attributes, input.label, input.itemType]
      .filter(Boolean)
      .join(" "),
  );
  if (fromText) return fromText;

  // Absolute default: T-Shirt / vague Top with no feminine cut → Erkek.
  const subtype = resolveTopsSubtype(input);
  if (subtype === "tshirt" || subtype === "other") {
    return "male";
  }
  return null;
}

function topsCategoryToken(input: ExactQueryInput): string {
  const subtype = resolveTopsSubtype(input) ?? "tshirt";
  const neck = extractNeckline(
    [input.webEntity, input.label, input.attributes, input.itemType]
      .filter(Boolean)
      .join(" "),
  );

  if (subtype === "tshirt") {
    if (neck === "Bisiklet Yaka") return "Bisiklet Yaka Tişört";
    if (neck === "V Yaka") return "V Yaka Tişört";
    const hay = foldQueryText(
      [input.webEntity, input.label, input.attributes, input.itemType]
        .filter(Boolean)
        .join(" "),
    );
    if (/\boversize|oversized\b/.test(hay)) return "Oversize Tişört";
    // Default crewneck for plain black/white tees — never emit bare "Üst".
    return "Bisiklet Yaka Tişört";
  }

  if (subtype === "body" && neck) return `${neck} Body`;
  return TOPS_SUBTYPE_LABEL[subtype];
}

/** Texture / weave / material tokens (Turkish display form). */
const TEXTURE_RULES: Array<{ display: string; aliases: string[] }> = [
  { display: "Triko", aliases: ["triko", "knit", "knitted"] },
  { display: "Örgü", aliases: ["orgu", "örgü", "crochet"] },
  { display: "Fitilli", aliases: ["fitilli", "ribbed", "rib"] },
  { display: "Peluş", aliases: ["pelus", "peluş", "fleece", "plush", "sherpa"] },
  { display: "Kapitone", aliases: ["kapitone", "quilted", "quilt"] },
  { display: "Saten", aliases: ["saten", "satin"] },
  { display: "Deri", aliases: ["deri", "leather", "faux leather", "vegan leather"] },
  { display: "Süet", aliases: ["suet", "süet", "suede", "nubuck", "nubuk"] },
  { display: "Kot", aliases: ["kot", "denim", "jean", "jeans"] },
  { display: "Kadife", aliases: ["kadife", "velvet", "corduroy", "fitilli kadife"] },
];

/** Pattern tokens (Turkish display form). */
const PATTERN_RULES: Array<{ display: string; aliases: string[] }> = [
  { display: "Ekose", aliases: ["ekose", "plaid", "check", "checked", "tartan", "gingham"] },
  { display: "Çizgili", aliases: ["cizgili", "çizgili", "stripe", "striped", "stripes"] },
  { display: "Çiçekli", aliases: ["cicekli", "çiçekli", "floral", "flower"] },
  { display: "Leopar", aliases: ["leopar", "leopard", "animal print"] },
  { display: "Baskılı", aliases: ["baskili", "baskılı", "print", "printed", "graphic"] },
  { display: "Düz", aliases: ["duz", "düz", "solid", "plain"] },
];

/**
 * Pulls texture and pattern descriptors from WEB_DETECTION / attribute text.
 * Returns Turkish display tokens ready for mandatory query inclusion.
 */
export function extractMaterialsAndPatterns(text: string | null | undefined): {
  materials: string[];
  patterns: string[];
} {
  if (!text?.trim()) return { materials: [], patterns: [] };

  const haystack = normalizeTr(normalizeFashionQuery(text) + " " + text);
  const materials: string[] = [];
  const patterns: string[] = [];
  const seenMat = new Set<string>();
  const seenPat = new Set<string>();

  for (const rule of TEXTURE_RULES) {
    if (rule.aliases.some((alias) => haystack.includes(normalizeTr(alias)))) {
      const key = normalizeTr(rule.display);
      if (!seenMat.has(key)) {
        seenMat.add(key);
        materials.push(rule.display);
      }
    }
  }

  for (const rule of PATTERN_RULES) {
    if (rule.aliases.some((alias) => haystack.includes(normalizeTr(alias)))) {
      const key = normalizeTr(rule.display);
      if (!seenPat.has(key)) {
        seenPat.add(key);
        patterns.push(rule.display);
      }
    }
  }

  return { materials, patterns };
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
  [/\bcrop(?:ped)?\s*top\b/gi, "Crop Tişört"],
  [/\bcrew[\s-]*neck\s*t[\s-]?shirts?\b/gi, "Bisiklet Yaka Tişört"],
  [/\bcrew[\s-]*neck\b/gi, "Bisiklet Yaka"],
  [/\bmen'?s?\s*t[\s-]?shirts?\b/gi, "Erkek Tişört"],
  [/\bbasic\s*t[\s-]?shirts?\b/gi, "Basic Tişört"],
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
  black: "Siyah",
  white: "Beyaz",
  red: "Kırmızı",
  blue: "Mavi",
  green: "Yeşil",
  brown: "Kahverengi",
  pink: "Pembe",
  grey: "Gri",
  gray: "Gri",
  navy: "Lacivert",
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
  "üst",
  "ust",
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
  "peluş",
  "pelus",
  "kapitone",
  "saten",
  "ekose",
  "çizgili",
  "cizgili",
  "çiçekli",
  "cicekli",
  "leopar",
  "baskılı",
  "baskili",
  "düz",
  "duz",
  "tisort",
  "tişört",
  "tshirt",
  "tee",
  "erkek",
  "kadin",
  "kadın",
  "unisex",
  "bisiklet",
  "gomlek",
  "gömlek",
  "sweatshirt",
  "body",
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

function resolveMaterialsAndPatterns(input: ExactQueryInput): {
  materials: string[];
  patterns: string[];
} {
  if (input.materials?.length || input.patterns?.length) {
    return {
      materials: input.materials ?? [],
      patterns: input.patterns ?? [],
    };
  }

  return extractMaterialsAndPatterns(
    [input.webEntity, input.attributes, input.label, input.itemType]
      .filter(Boolean)
      .join(" "),
  );
}

/** Tokens banned from every storefront query — never emit these. */
const BANNED_QUERY_GENERICS = new Set([
  "ust",
  "üst",
  "top",
  "alt",
  "kiyafet",
  "kıyafet",
  "giyim",
  "parca",
  "parça",
  "urun",
  "ürün",
  "clothing",
  "apparel",
  "item",
  "product",
  "object",
  "wear",
  "garment",
]);

/**
 * Stage 1 — Exact visual match query.
 *
 * Absolute shape for apparel (no LLM fluff):
 *   `[Color] + [Material/Pattern?] + [Gender/Fit] + [Specific Subtype]`
 * Example: "Siyah Erkek Bisiklet Yaka Tişört" / "Pembe Triko Fermuarlı Kadın Hırka"
 */
export function buildExactMatchQuery(input: ExactQueryInput): string {
  // --- TOPS: rigid template — ignore vague Vision "Top"/"Üst" dump ---
  if (input.primaryCategory === "TOPS") {
    const parts: string[] = [];
    const color = resolveColor(input);
    if (color) parts.push(color);

    const { materials, patterns } = resolveMaterialsAndPatterns(input);
    const material = materials[0];
    if (material) parts.push(material);
    const pattern = patterns.find((p) => !/^düz$/i.test(normalizeTr(p)));
    if (pattern && !material) parts.push(pattern);

    if (input.attributes) {
      const normalised = normalizeFashionQuery(input.attributes);
      for (const word of normalised.split(/\s+/)) {
        const key = normalizeTr(word);
        if (
          (key === "fermuarli" ||
            key === "fermuarlı" ||
            key === "oversize" ||
            key === "slim") &&
          !parts.some((p) => normalizeTr(p) === key)
        ) {
          parts.push(word);
          break;
        }
      }
    }

    const gender = resolveApparelGender(input) ?? "male";
    parts.push(GENDER_QUERY_TOKEN[gender]);
    parts.push(topsCategoryToken(input));

    return parts
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .filter((part) => !BANNED_QUERY_GENERICS.has(normalizeTr(part)))
      .join(" ");
  }

  const tokens: string[] = [];
  const seen = new Set<string>();

  if (input.brandLogo?.trim()) {
    pushToken(tokens, seen, input.brandLogo.trim());
  }

  const color = resolveColor(input);
  pushToken(tokens, seen, color);

  const { materials, patterns } = resolveMaterialsAndPatterns(input);
  for (const material of materials) pushToken(tokens, seen, material);
  for (const pattern of patterns) {
    if (!/^düz$/i.test(normalizeTr(pattern))) pushToken(tokens, seen, pattern);
  }

  const gender = resolveApparelGender(input);
  if (gender) {
    pushToken(tokens, seen, GENDER_QUERY_TOKEN[gender]);
  }

  pushToken(tokens, seen, input.webEntity);
  pushToken(tokens, seen, input.attributes);
  pushToken(tokens, seen, input.label);
  pushToken(tokens, seen, input.itemType);

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

  if (input.itemType) {
    pushToken(tokens, seen, input.itemType);
  }

  if (color && !tokens.some((token) => normalizeTr(token) === normalizeTr(color))) {
    const brandOffset = input.brandLogo?.trim() ? 1 : 0;
    tokens.splice(brandOffset, 0, color);
  }

  for (const mandatory of [...materials, ...patterns]) {
    if (/^düz$/i.test(normalizeTr(mandatory))) continue;
    if (!tokens.some((token) => normalizeTr(token) === normalizeTr(mandatory))) {
      const insertAt = Math.min(tokens.length, input.brandLogo?.trim() ? 2 : 1);
      tokens.splice(insertAt, 0, mandatory);
    }
  }

  return tokens
    .filter((token) => !BANNED_QUERY_GENERICS.has(normalizeTr(token)))
    .slice(0, 8)
    .join(" ");
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

  if (input.brandLogo?.trim()) {
    pushToken(tokens, seen, input.brandLogo.trim());
  }

  const color = resolveColor(input);
  pushToken(tokens, seen, color);

  const { materials, patterns } = resolveMaterialsAndPatterns(input);
  for (const material of materials) pushToken(tokens, seen, material);
  for (const pattern of patterns) pushToken(tokens, seen, pattern);

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

  let categoryLabel = PRIMARY_CATEGORY_QUERY_LABEL[input.primaryCategory];
  if (input.primaryCategory === "TOPS") {
    categoryLabel = topsCategoryToken(input);
  }
  if (categoryLabel) {
    pushToken(tokens, seen, categoryLabel);
  }

  const gender = resolveApparelGender(input);
  if (gender) {
    pushToken(tokens, seen, GENDER_QUERY_TOKEN[gender]);
  }

  // Prefer the specific type word (Sandalet) over generic (Ayakkabı) when both
  // are present — drop the generic if we already have a STYLE_KEEP type.
  const compact = tokens.filter((token, index, list) => {
    const key = normalizeTr(token);
    if (key !== normalizeTr(PRIMARY_CATEGORY_QUERY_LABEL[input.primaryCategory])) {
      return true;
    }
    return !list.some(
      (other, otherIndex) =>
        otherIndex !== index && STYLE_KEEP.has(normalizeTr(other)),
    );
  });

  const query = compact.slice(0, 7).join(" ");
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
