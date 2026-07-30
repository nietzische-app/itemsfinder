/**
 * Named Turkish colours with their reference RGB, used for nearest-match.
 * Kept separate from the query builder so colour naming stays reusable without
 * pulling in PrimaryCategory / Stage-1/2 logic.
 */

import { normalizeTr } from "@/lib/itemFamily";

const COLOR_NAMES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "Siyah", rgb: [17, 17, 17] },
  { name: "Antrasit", rgb: [60, 62, 68] },
  { name: "Gri", rgb: [140, 140, 142] },
  { name: "Açık Gri", rgb: [205, 205, 208] },
  { name: "Beyaz", rgb: [250, 250, 250] },
  { name: "Kırık Beyaz", rgb: [240, 236, 226] },
  { name: "Bej", rgb: [223, 205, 177] },
  { name: "Krem", rgb: [232, 220, 198] },
  { name: "Camel", rgb: [181, 137, 90] },
  { name: "Kahverengi", rgb: [98, 66, 44] },
  { name: "Taba", rgb: [166, 124, 82] },
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

/**
 * Core colour buckets enforced in search queries and product-title sanitising.
 * Fine palette names collapse into these for conflict detection.
 */
export type ColorBucket =
  | "Kırmızı"
  | "Siyah"
  | "Beyaz"
  | "Pembe"
  | "Lacivert"
  | "Kahverengi"
  | "Krem/Bej"
  | "Mavi"
  | "Gri"
  | "Yeşil"
  | "Mor"
  | "Sarı"
  | "Turuncu";

const NAME_TO_BUCKET: Record<string, ColorBucket> = {
  siyah: "Siyah",
  antrasit: "Siyah",
  gri: "Gri",
  "acik gri": "Gri",
  beyaz: "Beyaz",
  "kirik beyaz": "Beyaz",
  bej: "Krem/Bej",
  krem: "Krem/Bej",
  camel: "Kahverengi",
  kahverengi: "Kahverengi",
  taba: "Kahverengi",
  bordo: "Kırmızı",
  kirmizi: "Kırmızı",
  mercan: "Kırmızı",
  turuncu: "Turuncu",
  hardal: "Sarı",
  sari: "Sarı",
  yesil: "Yeşil",
  haki: "Yeşil",
  turkuaz: "Mavi",
  mavi: "Mavi",
  lacivert: "Lacivert",
  mor: "Mor",
  lila: "Mor",
  pembe: "Pembe",
  pudra: "Pembe",
  altin: "Kahverengi",
  gumus: "Gri",
};

/** Synonyms that count as the same bucket when scanning product titles. */
const BUCKET_ALIASES: Record<ColorBucket, string[]> = {
  Kırmızı: ["kirmizi", "kırmızı", "red", "bordo", "burgundy", "mercan", "coral"],
  Siyah: ["siyah", "black", "antrasit", "anthracite", "ebony"],
  Beyaz: ["beyaz", "white", "kirik beyaz", "off-white", "offwhite"],
  Pembe: ["pembe", "pink", "pudra", "fuchsia", "fuşya", "fusya", "rose"],
  Lacivert: ["lacivert", "navy", "navy blue"],
  Kahverengi: ["kahverengi", "brown", "taba", "camel", "tan", "nude", "nubuk"],
  "Krem/Bej": ["krem", "bej", "beige", "cream", "ivory", "ekru", "ecru"],
  Mavi: ["mavi", "blue", "turkuaz", "teal", "cyan"],
  Gri: ["gri", "grey", "gray", "gumus", "silver", "gunmetal"],
  Yeşil: ["yesil", "yeşil", "green", "haki", "olive", "khaki"],
  Mor: ["mor", "purple", "lila", "violet", "lavender"],
  Sarı: ["sari", "sarı", "yellow", "hardal", "mustard", "gold", "altin"],
  Turuncu: ["turuncu", "orange"],
};

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

/** Maps a fine colour name (or free text) onto a core enforcement bucket. */
export function colorBucketFromName(name: string | null | undefined): ColorBucket | null {
  if (!name?.trim()) return null;
  const key = normalizeTr(name);
  if (NAME_TO_BUCKET[key]) return NAME_TO_BUCKET[key]!;

  // Multi-word / partial: try each alias table entry.
  for (const [bucket, aliases] of Object.entries(BUCKET_ALIASES) as Array<
    [ColorBucket, string[]]
  >) {
    if (aliases.some((alias) => key.includes(normalizeTr(alias)))) {
      return bucket;
    }
  }
  return null;
}

export function colorBucketFromHex(hex: string): ColorBucket | null {
  return colorBucketFromName(colorNameFromHex(hex));
}

/** Display token forced into e-commerce queries (Krem/Bej → "Krem"). */
export function colorBucketQueryToken(bucket: ColorBucket): string {
  if (bucket === "Krem/Bej") return "Krem";
  return bucket;
}

/**
 * True when the product title names a primary colour that conflicts with the
 * Vision-derived bucket. Titles with no colour word are allowed through.
 *
 * Multi-tone / patterned apparel (e.g. "bej siyah desenli") is kept when the
 * Vision bucket is one of the pattern neutrals named in the title, or when
 * every named tone is a compatible neutral pair — so valid multi-colour items
 * are not dropped by a single dominant-crop reading.
 */
export function colorsConflict(expected: ColorBucket, title: string): boolean {
  const found = detectBucketsInText(title);
  if (found.length === 0) return false;
  if (found.includes(expected)) return false;

  const patternNeutrals: ColorBucket[] = [
    "Siyah",
    "Beyaz",
    "Krem/Bej",
    "Gri",
    "Kahverengi",
  ];

  // Patterned multi-tone titles: two+ neutrals without a loud conflicting hue.
  if (
    found.length >= 2 &&
    found.every((bucket) => patternNeutrals.includes(bucket)) &&
    patternNeutrals.includes(expected)
  ) {
    return false;
  }

  const compatible: Partial<Record<ColorBucket, ColorBucket[]>> = {
    Kahverengi: ["Krem/Bej", "Sarı", "Turuncu", "Siyah"],
    "Krem/Bej": ["Kahverengi", "Beyaz", "Sarı", "Siyah", "Gri"],
    Lacivert: ["Mavi", "Siyah"],
    Mavi: ["Lacivert"],
    Siyah: ["Gri", "Lacivert", "Krem/Bej", "Beyaz", "Kahverengi"],
    Gri: ["Siyah", "Beyaz", "Krem/Bej"],
    Beyaz: ["Krem/Bej", "Gri", "Siyah"],
    Pembe: ["Kırmızı", "Mor"],
    Kırmızı: ["Pembe", "Turuncu"],
    Turuncu: ["Kırmızı", "Sarı", "Kahverengi"],
    Sarı: ["Kahverengi", "Krem/Bej", "Turuncu"],
    Yeşil: [],
    Mor: ["Pembe"],
  };

  return found.some((bucket) => {
    if (bucket === expected) return false;
    if (compatible[expected]?.includes(bucket)) return false;
    if (compatible[bucket]?.includes(expected)) return false;
    return true;
  });
}

function detectBucketsInText(text: string): ColorBucket[] {
  const haystack = normalizeTr(text);
  const hits: ColorBucket[] = [];

  for (const [bucket, aliases] of Object.entries(BUCKET_ALIASES) as Array<
    [ColorBucket, string[]]
  >) {
    if (aliases.some((alias) => haystack.includes(normalizeTr(alias)))) {
      hits.push(bucket);
    }
  }

  return hits;
}
