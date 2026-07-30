/**
 * Garment/product families, used to stop the catalogue from answering a
 * detection with something from the wrong part of the wardrobe.
 *
 * Matching on shared words alone is not enough: "Siyah Deri Ayakkabı" and
 * "Siyah Deri Ceket" share two of three words, so a shoe would happily resolve
 * to a jacket. A family gate makes that structurally impossible — footwear can
 * only ever match footwear.
 */
export type ItemFamily =
  | "footwear"
  | "outerwear"
  | "top"
  | "bottom"
  | "dress"
  | "bag"
  | "accessory"
  | "lips"
  | "eyes"
  | "face"
  | "unknown";

/**
 * A family is recognised by two kinds of keyword, because Turkish and English
 * need different matching:
 *
 * - `stems` are prefix-matched against a whole token, which is how Turkish
 *   agglutination works — "ayakkab" catches ayakkabı/ayakkabılar/ayakkabısı.
 * - `words` must equal a whole token. English needs this precision: substring
 *   matching classified "coated mini shorts" as outerwear (coat), "top-handle
 *   bag" as a top, and "crossbody" as a bodysuit.
 *
 * Neither kind is ever matched against the raw string, only against tokens.
 */
interface FamilyRule {
  family: ItemFamily;
  stems: string[];
  words: string[];
}

/**
 * **Order is load-bearing** — the first rule with a hit wins, so the more
 * specific family comes first:
 *
 *   - "Top-Handle Bag" is a bag      -> bag precedes top
 *   - "Gözlüğü" is eyewear, not eyes -> accessory precedes eyes
 *   - "Bronz smokey göz" is eyes     -> eyes precedes face
 *
 * Turkish stems avoid the dotted/dotless i where the suffix would change it,
 * and stop before a mutating consonant ("gözlü", not "gözlük", because the
 * possessive is "gözlüğü").
 */
const RULES: FamilyRule[] = [
  {
    family: "footwear",
    stems: ["ayakkab", "çizme", "topuk", "sandalet", "terlik", "babet", "espadril"],
    words: [
      "shoe",
      "shoes",
      "boot",
      "boots",
      "bot",
      "botlar",
      "bootie",
      "sneaker",
      "sneakers",
      "heel",
      "heels",
      "sandal",
      "sandals",
      "loafer",
      "loafers",
      "trainer",
      "trainers",
      "footwear",
      "slipper",
      "slippers",
      "platform",
    ],
  },
  {
    family: "bag",
    stems: ["çanta"],
    words: [
      "bag",
      "bags",
      "handbag",
      "clutch",
      "tote",
      "backpack",
      "crossbody",
      "purse",
      "satchel",
      "shopper",
    ],
  },
  {
    family: "accessory",
    stems: [
      "küpe",
      "kolye",
      "bileklik",
      "yüzük",
      "fular",
      "kemer",
      "şapka",
      "bere",
      "gözlü",
      "eldiven",
      "çorap",
      "toka",
      "şal",
    ],
    words: [
      "earring",
      "earrings",
      "necklace",
      "pendant",
      "bracelet",
      "ring",
      "rings",
      "scarf",
      "belt",
      "hat",
      "cap",
      "beanie",
      "sunglasses",
      "glasses",
      "eyewear",
      "watch",
      "glove",
      "gloves",
      "sock",
      "socks",
      "jewelry",
      "jewellery",
      "accessory",
      "saat",
    ],
  },
  {
    family: "outerwear",
    stems: ["ceket", "mont", "kaban", "palto", "yelek", "hırka", "trençkot", "parka"],
    words: [
      "jacket",
      "jackets",
      "coat",
      "coats",
      "overcoat",
      "trench",
      "blazer",
      "cardigan",
      "vest",
      "outerwear",
      "puffer",
      "biker",
    ],
  },
  {
    family: "dress",
    stems: ["elbise", "tulum", "kaftan"],
    words: ["dress", "dresses", "jumpsuit", "gown", "romper"],
  },
  {
    family: "top",
    stems: ["tişört", "gömlek", "bluz", "kazak", "büstiyer", "atlet", "kapüşonlu", "triko"],
    words: [
      "top",
      "tops",
      "shirt",
      "shirts",
      "tee",
      "blouse",
      "sweater",
      "sweatshirt",
      "knit",
      "knitwear",
      "tank",
      "hoodie",
      "jersey",
      "bodysuit",
      "body",
      "crop",
      "cropped",
      "üst",
    ],
  },
  {
    family: "bottom",
    stems: ["pantolon", "şort", "etek", "tayt", "jogger", "jean", "kot"],
    words: [
      "jeans",
      "trouser",
      "trousers",
      "pant",
      "pants",
      "short",
      "shorts",
      "skirt",
      "legging",
      "leggings",
      "chino",
      "chinos",
      "culottes",
      "denim",
    ],
  },
  {
    family: "lips",
    stems: ["ruj", "dudak"],
    words: ["lip", "lips", "lipstick", "gloss", "balm"],
  },
  {
    family: "eyes",
    stems: ["maskara", "kirpik", "eyeliner", "göz", "kaş", "far"],
    words: [
      "eye",
      "eyes",
      "eyeshadow",
      "mascara",
      "shadow",
      "lash",
      "lashes",
      "brow",
      "brows",
      "liner",
    ],
  },
  {
    family: "face",
    stems: ["fondöten", "kapatıc", "allık", "pudra", "aydınlatıc", "bronz"],
    words: [
      "foundation",
      "blush",
      "concealer",
      "powder",
      "contour",
      "highlighter",
      "bronzer",
      "primer",
    ],
  },
];

/** Turkish-aware lowering: maps I -> ı and İ -> i the way a reader expects. */
export function normalizeTr(text: string): string {
  return text.toLocaleLowerCase("tr");
}

/**
 * Splits text into tokens. The character class includes the Turkish letters on
 * purpose: a plain `[^a-z]+` split shreds "ayakkabı" into "ayakkab" and
 * "gömlek" into "g" + "mlek", silently wrecking any word-overlap scoring built
 * on top of it.
 */
function split(text: string): string[] {
  return normalizeTr(text)
    .split(/[^a-z0-9çğıöşü]+/)
    .filter(Boolean);
}

/** Tokens worth scoring on — drops the noise-length ones. */
export function tokenize(text: string): string[] {
  return split(text).filter((word) => word.length > 2);
}

/** Best-guess family for a free-text label, or "unknown". */
export function familyOf(text: string): ItemFamily {
  const tokens = split(text);

  for (const rule of RULES) {
    for (const token of tokens) {
      if (rule.words.includes(token)) return rule.family;
      if (rule.stems.some((stem) => token.startsWith(stem))) return rule.family;
    }
  }

  return "unknown";
}
