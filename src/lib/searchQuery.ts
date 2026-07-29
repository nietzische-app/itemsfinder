/**
 * Search query construction.
 *
 * Vision hands back three loosely related signals — an object label
 * (`OBJECT_LOCALIZATION`), a richer phrase (`WEB_DETECTION`) and dominant
 * colours (`IMAGE_PROPERTIES`). Searching on the object label alone produces
 * useless queries like "Ruj"; combining all three produces the descriptive
 * query a shopper would actually type: "Kırmızı Mat Likit Ruj".
 */

/** Named Turkish colours with their reference RGB, used for nearest-match. */
const COLOR_NAMES: Array<{ name: string; rgb: [number, number, number] }> = [
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
]);

/**
 * Builds a descriptive, de-duplicated search query.
 *
 * Order matters: colour first, then the descriptive phrase, then the object
 * type — that is the order Turkish shoppers type ("kırmızı mat ruj"), and it
 * is the order storefront relevance ranking rewards.
 */
export function buildSearchQuery(parts: SearchQueryParts): string {
  const tokens: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | undefined) => {
    if (!value) return;

    // Attribute lines are bullet-separated; split them into words.
    for (const word of value.split(/[\s•·,/]+/)) {
      const clean = word.trim().replace(/^[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+|[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+$/g, "");
      if (clean.length < 2) continue;

      const key = clean.toLocaleLowerCase("tr");
      if (seen.has(key) || NOISE.has(key)) continue;

      seen.add(key);
      tokens.push(clean);
    }
  };

  if (parts.colorHex) push(colorNameFromHex(parts.colorHex) ?? undefined);
  push(parts.label);
  push(parts.attributes);
  push(parts.itemType);

  // Storefront search boxes degrade past a handful of words.
  return tokens.slice(0, 6).join(" ");
}
