import { normalizeTr } from "@/lib/itemFamily";

/**
 * Fashion brand canonicalisation for LOGO_DETECTION hits.
 * Kept free of `server-only` so query builders and stress harnesses can share it.
 */

export interface DetectedLogo {
  /** Canonical brand display name (Nike, Zara, …). */
  brand: string;
  /** Vision confidence 0..1. */
  score: number;
}

export interface VisionLogoAnnotation {
  description?: string;
  score?: number;
}

/** Fashion brands we promote into search queries when LOGO_DETECTION fires. */
const KNOWN_BRANDS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "Nike", aliases: ["nike", "nike, inc", "nike inc"] },
  { canonical: "Adidas", aliases: ["adidas", "adidas ag"] },
  { canonical: "Zara", aliases: ["zara", "zara home", "inditex"] },
  { canonical: "Mango", aliases: ["mango", "mango.com"] },
  { canonical: "Sephora", aliases: ["sephora"] },
  { canonical: "H&M", aliases: ["h&m", "hm", "h and m", "hennes"] },
  { canonical: "Puma", aliases: ["puma"] },
  { canonical: "New Balance", aliases: ["new balance", "newbalance"] },
  { canonical: "Converse", aliases: ["converse"] },
  { canonical: "Vans", aliases: ["vans"] },
  { canonical: "Gucci", aliases: ["gucci"] },
  { canonical: "Prada", aliases: ["prada"] },
  { canonical: "Chanel", aliases: ["chanel"] },
  { canonical: "Dior", aliases: ["dior", "christian dior"] },
  { canonical: "Louis Vuitton", aliases: ["louis vuitton", "lv", "lvmh"] },
  { canonical: "Calvin Klein", aliases: ["calvin klein", "ck"] },
  { canonical: "Tommy Hilfiger", aliases: ["tommy hilfiger", "tommy"] },
  { canonical: "Levi's", aliases: ["levis", "levi's", "levi strauss"] },
  { canonical: "The North Face", aliases: ["the north face", "north face"] },
  { canonical: "Pull&Bear", aliases: ["pull&bear", "pull and bear", "pullbear"] },
  { canonical: "Bershka", aliases: ["bershka"] },
  { canonical: "Stradivarius", aliases: ["stradivarius"] },
  { canonical: "LC Waikiki", aliases: ["lc waikiki", "lcw", "lcwaikiki"] },
  { canonical: "DeFacto", aliases: ["defacto"] },
  { canonical: "Koton", aliases: ["koton"] },
  { canonical: "Mavi", aliases: ["mavi"] },
  { canonical: "Trendyol", aliases: ["trendyol", "trendyol milla"] },
  { canonical: "MAC", aliases: ["mac", "mac cosmetics"] },
  { canonical: "Maybelline", aliases: ["maybelline"] },
  { canonical: "NYX", aliases: ["nyx", "nyx professional"] },
];

const MIN_LOGO_SCORE = 0.55;

/** Maps a raw Vision logo description onto a canonical fashion brand. */
export function canonicalizeBrand(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const key = normalizeTr(raw);
  for (const entry of KNOWN_BRANDS) {
    if (
      entry.aliases.some(
        (alias) => key === normalizeTr(alias) || key.includes(normalizeTr(alias)),
      )
    ) {
      return entry.canonical;
    }
  }
  // Unknown but high-signal single-token logo — title-case and keep.
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.length <= 24 && !/\s{2,}/.test(trimmed)) {
    return trimmed.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

/**
 * Parses LOGO_DETECTION annotations into ranked brands.
 * Prefer known fashion brands; drop low-confidence noise.
 * Unknown logos only surface when no known brand is present.
 */
export function parseLogoAnnotations(
  logos: VisionLogoAnnotation[] | undefined,
): DetectedLogo[] {
  if (!logos?.length) return [];

  const ranked = [...logos]
    .filter((logo) => (logo.score ?? 0) >= MIN_LOGO_SCORE && logo.description)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const known: DetectedLogo[] = [];
  const unknown: DetectedLogo[] = [];
  const seen = new Set<string>();

  for (const logo of ranked) {
    const raw = logo.description!.trim();
    const key = normalizeTr(raw);
    const knownHit = KNOWN_BRANDS.find((entry) =>
      entry.aliases.some(
        (alias) => key === normalizeTr(alias) || key.includes(normalizeTr(alias)),
      ),
    );

    if (knownHit) {
      const brandKey = normalizeTr(knownHit.canonical);
      if (seen.has(brandKey)) continue;
      seen.add(brandKey);
      known.push({ brand: knownHit.canonical, score: logo.score ?? 0 });
      continue;
    }

    const brand = canonicalizeBrand(raw);
    if (!brand) continue;
    const brandKey = normalizeTr(brand);
    if (seen.has(brandKey)) continue;
    seen.add(brandKey);
    unknown.push({ brand, score: logo.score ?? 0 });
  }

  return known.length > 0 ? known : unknown;
}

/** Best logo brand for an ROI, or null. */
export function bestLogoBrand(logos: DetectedLogo[]): string | null {
  return logos[0]?.brand ?? null;
}
