import { toTurkishRetailTerms } from "@/lib/retailVocabulary";

/**
 * Search query construction.
 *
 * Vision hands back three loosely related signals — an object label
 * (`OBJECT_LOCALIZATION`), a richer phrase (`WEB_DETECTION`) and dominant
 * colours (`IMAGE_PROPERTIES`). Searching on the object label alone produces
 * useless queries like "Ruj"; combining all three produces the descriptive
 * query a shopper would actually type: "Kırmızı Mat Likit Ruj".
 */

/**
 * Named Turkish colours with their reference RGB, used for nearest-match.
 *
 * Exported because the live product stage reads colour words out of retailer
 * titles and has to place them on the same scale the pipeline measures on.
 */
export const COLOR_NAMES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "Siyah", rgb: [17, 17, 17] },
  { name: "Antrasit", rgb: [60, 62, 68] },
  { name: "Gri", rgb: [140, 140, 142] },
  { name: "Açık Gri", rgb: [205, 205, 208] },
  { name: "Beyaz", rgb: [250, 250, 250] },
  { name: "Kırık Beyaz", rgb: [240, 236, 226] },
  { name: "Bej", rgb: [223, 205, 177] },
  { name: "Camel", rgb: [181, 137, 90] },
  { name: "Kahverengi", rgb: [98, 66, 44] },
  { name: "Bordo", rgb: [110, 26, 38] },
  { name: "Kırmızı", rgb: [204, 24, 38] },
  { name: "Mercan", rgb: [224, 86, 56] },
  { name: "Turuncu", rgb: [235, 130, 40] },
  { name: "Hardal", rgb: [206, 168, 50] },
  { name: "Sarı", rgb: [240, 214, 70] },
  { name: "Yeşil", rgb: [58, 132, 74] },
  { name: "Haki", rgb: [110, 116, 78] },
  { name: "Turkuaz", rgb: [50, 168, 168] },
  { name: "Mavi", rgb: [42, 92, 170] },
  { name: "Lacivert", rgb: [30, 40, 78] },
  { name: "Mor", rgb: [110, 62, 160] },
  { name: "Lila", rgb: [186, 160, 214] },
  { name: "Pembe", rgb: [226, 120, 158] },
  { name: "Pudra", rgb: [235, 200, 196] },
  { name: "Altın", rgb: [212, 175, 85] },
  { name: "Gümüş", rgb: [196, 199, 204] },
];

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Nearest named Turkish colour for a hex value, or `null` if unparseable.
 * Plain squared RGB distance: the palette is coarse enough that a perceptual
 * space would not change which bucket a garment colour falls into.
 */
export function colorNameFromHex(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let best = COLOR_NAMES[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of COLOR_NAMES) {
    const distance =
      (candidate.rgb[0] - rgb[0]) ** 2 +
      (candidate.rgb[1] - rgb[1]) ** 2 +
      (candidate.rgb[2] - rgb[2]) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best.name;
}

export interface SearchQueryParts {
  /** Coarse object label, e.g. "Ruj" or Vision's "Cosmetics". */
  itemType: string;
  /** Richer phrase, typically from web detection, e.g. "Mat Likit Ruj". */
  label?: string;
  /** Dominant colour of the region as hex. */
  colorHex?: string;
  /**
   * Colour name to use instead of the one derived from `colorHex`.
   *
   * The hex is a *measurement* of a rectangle; when a vision model has looked at
   * the crop and named the garment's own colour, its word is the better one — the
   * measurement is the background whenever the garment is a minority of its box.
   */
  colorName?: string;
  /**
   * Ordered descriptors placed between the colour and the garment noun — pattern,
   * material, visible details, fit. This is the order a Turkish shopper types
   * ("pembe fermuarlı triko ceket") and the order storefront relevance rewards.
   */
  descriptors?: Array<string | null | undefined>;
  /** Free-text attributes, e.g. "Gerçek Kırmızı • Kadife Mat". */
  attributes?: string;
}

/** Tokens too generic to help a storefront search. */
const NOISE = new Set([
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
  "parça",
  // "Plain" is the default for most garments, so as a search token it narrows
  // nothing while consuming one of the few slots a search box respects.
  "düz",
  "sade",
  "desensiz",
]);

/** Storefront search boxes degrade past a handful of words. */
const MAX_TOKENS = 6;

/**
 * Builds a descriptive, de-duplicated search query.
 *
 * Order matters: colour first, then the descriptors, then the descriptive
 * phrase, then the object type — that is the order Turkish shoppers type
 * ("kırmızı mat ruj"), and it is the order storefront relevance ranking
 * rewards. The object type is placed last but reserved first, so it survives
 * the token cap.
 */
export function buildSearchQuery(parts: SearchQueryParts): string {
  const tokens: string[] = [];
  const noun: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | undefined, into: string[] = tokens) => {
    if (!value) return;

    /*
     * Vision answers in English and the storefronts are Turkish. Translating here
     * rather than at each call site means every path — the coarse detector class,
     * a web entity, the model's own words if it slips into English — arrives in
     * the language the search box speaks. Unknown words pass through unchanged.
     */
    const translated = toTurkishRetailTerms(value);

    // Attribute lines are bullet-separated; split them into words.
    for (const word of translated.split(/[\s•·,/]+/)) {
      const clean = word.trim().replace(/^[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+|[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+$/g, "");
      if (clean.length < 2) continue;

      const key = clean.toLocaleLowerCase("tr");
      if (seen.has(key) || NOISE.has(key)) continue;

      seen.add(key);
      into.push(clean);
    }
  };

  push(parts.colorName ?? (parts.colorHex ? colorNameFromHex(parts.colorHex) ?? undefined : undefined));
  for (const descriptor of parts.descriptors ?? []) push(descriptor ?? undefined);
  push(parts.label);
  push(parts.attributes);
  // The garment noun is collected separately: it is the one token a search box
  // cannot do without, and it used to sit last, so a rich set of attributes
  // truncated it away — "pudra düz triko fermuarlı yüksek yaka" is a query with
  // no product in it. Room is reserved for it instead of hoping it fits.
  push(parts.itemType, noun);

  return [...tokens.slice(0, Math.max(1, MAX_TOKENS - noun.length)), ...noun].join(" ");
}

/**
 * The attribute fields a described garment contributes to a query.
 *
 * Declared structurally rather than imported from `attributeExtractor`, which is
 * `server-only`: this module is reached from client bundles and from the eval, and
 * neither should be pulling a server module in to name a shape.
 */
export interface GarmentAttributeLike {
  garmentType: string;
  colorName: string;
  colorHex: string;
  material: string | null;
  pattern: string | null;
  details: string[];
  fit: string | null;
}

/**
 * The query the pipeline builds once something has actually looked at the crop.
 *
 * Exported so the eval scores **this** rather than its own re-assembly of the same
 * fields. The ordering below is a real decision — pattern, then details, then
 * material immediately before the noun, because "triko ceket" is itself a category
 * name on Turkish storefronts — and a second copy of it in the eval would quietly
 * drift until the measured query was one no user ever receives.
 *
 * No `label`: the web entity names the photograph, not the garment, and the
 * pipeline stops consulting it the moment a crop has been described.
 *
 * `normalizeAttributes` guarantees `garmentType`, `colorName` and `colorHex` are
 * non-empty — an object missing any of them is rejected as unusable rather than
 * returned — so there is no fallback to thread through here.
 */
export function attributeSearchQuery(attrs: GarmentAttributeLike): string {
  return buildSearchQuery({
    itemType: attrs.garmentType,
    colorName: attrs.colorName,
    colorHex: attrs.colorHex,
    descriptors: [attrs.pattern, ...attrs.details, attrs.material, attrs.fit],
  });
}
