import { buildMerchantSearchUrl } from "@/services/merchantSearch";
import { isDirectProductUrl, PINK_OUTFIT_PDPS, resolveVerifiedPdp } from "@/services/productUrls";
import { familyOf } from "@/lib/itemFamily";
import type { BoundingBox, ExampleId, Merchant } from "@/types";

/**
 * Data for the landing-page "Live Scan" showcase: four real street/studio looks,
 * each with hand-measured detection boxes.
 *
 * Deliberately standalone rather than imported from `mockCatalog.ts`: the
 * catalogue is ~2000 lines and this runs in a client component on the landing
 * page, so pulling it in would ship the whole thing to every visitor for the
 * sake of a few cards. The catalogue reads its boxes back out of here (see
 * `showcaseBox`), so the two can never drift.
 *
 * Prices and titles are illustrative, exactly like the rest of the demo data —
 * the card says so, so nobody reads them as live retailer prices.
 */

export interface ShowcaseMatch {
  title: string;
  merchant: Merchant;
  price: number;
  currency: string;
  /** Storefront URL — prefer a direct PDP; search is last resort only. */
  url: string;
  /** 0..1 visual similarity, shown as a percentage. */
  similarity: number;
  /** How many look-alikes the scan turned up for this item. */
  alternativeCount: number;
}

export interface ShowcaseItem {
  id: string;
  /** Full detection label, e.g. "Pembe Fermuarlı Triko Ceket". */
  label: string;
  /** Coarse type for the eyebrow chip, e.g. "Ceket". */
  itemType: string;
  /** Attribute line under the title. */
  attributes: string;
  /** Dominant colour of the region — drives the swatch dot. */
  colorHex: string;
  /** 0..1 detector confidence. */
  confidence: number;
  /**
   * Normalised (0..1) region, top-left origin, relative to the whole image.
   *
   * Measured off each photo at a known 600px width, so these are accurate to
   * roughly ±0.01 rather than eyeballed. Re-measure if a photo is replaced or
   * re-cropped — the numbers are meaningless against a different framing.
   */
  box: BoundingBox;
  match: ShowcaseMatch;
}

export interface ShowcaseLook {
  /** Slug used for the asset name and the switcher. */
  id: string;
  /** Scenario this look opens on `/analyze`. */
  exampleId: ExampleId;
  /** Short name for the switcher chip. */
  label: string;
  src: string;
  /**
   * Intrinsic pixel size of the shipped asset. The frame's aspect ratio is set
   * from these exact numbers rather than a rounded "2 / 3": any mismatch makes
   * `object-cover` crop, and a crop slides every hotspot off its garment.
   */
  width: number;
  height: number;
  alt: string;
  /** Photographer — Unsplash does not require attribution, but crediting is right. */
  credit: string;
  items: ShowcaseItem[];
}

/** Direct PDP when available; otherwise a storefront search (labelled as such). */
function productUrl(merchant: Merchant, query: string, preferred?: string): string {
  if (preferred && isDirectProductUrl(preferred)) return preferred;
  const family = familyOf(query);
  const verified = resolveVerifiedPdp(merchant, family);
  if (verified) return verified;
  return buildMerchantSearchUrl(merchant, query) ?? "";
}

export const SHOWCASE_LOOKS: ShowcaseLook[] = [
  {
    id: "pink-knit",
    exampleId: "pink-outfit",
    label: "Pembe Triko",
    src: "/examples/look-pink-knit.jpg",
    width: 1100,
    height: 1649,
    alt: "Pembe fermuarlı triko ceket, siyah deri şort ve siyah beyaz bilekli sneaker giyen model",
    credit: "Vivek / Unsplash",
    items: [
      {
        id: "showcase-top",
        label: "Pembe Fermuarlı Triko Ceket",
        itemType: "Ceket",
        attributes: "Pastel pembe • İnce triko • Fermuarlı",
        colorHex: "#f0a0b4",
        confidence: 0.96,
        box: { x: 0.377, y: 0.292, width: 0.235, height: 0.269 },
        match: {
          title: "Fermuarlı Yüksek Yaka Triko Ceket",
          merchant: "Trendyol",
          price: 549,
          currency: "TRY",
          url: productUrl("Trendyol", "pembe fermuarlı triko ceket", PINK_OUTFIT_PDPS.cardigan),
          similarity: 0.94,
          alternativeCount: 12,
        },
      },
      {
        id: "showcase-bottom",
        label: "Siyah Deri Mini Şort",
        itemType: "Şort",
        attributes: "Mat siyah • Deri görünümlü • Yüksek bel",
        colorHex: "#16181c",
        confidence: 0.93,
        box: { x: 0.353, y: 0.506, width: 0.247, height: 0.08 },
        match: {
          title: "Deri Görünümlü Yüksek Bel Mini Şort",
          merchant: "Trendyol",
          price: 899,
          currency: "TRY",
          url: productUrl("Trendyol", "deri görünümlü mini şort", PINK_OUTFIT_PDPS.shorts),
          similarity: 0.89,
          alternativeCount: 9,
        },
      },
      {
        id: "showcase-shoes",
        label: "Siyah Beyaz Bilekli Sneaker",
        itemType: "Sneaker",
        attributes: "Siyah/beyaz • Bilekli • Deri detay",
        colorHex: "#1b1b1b",
        confidence: 0.95,
        box: { x: 0.393, y: 0.791, width: 0.227, height: 0.14 },
        match: {
          title: "Bilekli Retro Basketbol Sneaker",
          merchant: "Amazon",
          price: 2499,
          currency: "TRY",
          url: productUrl("Amazon", "siyah beyaz bilekli sneaker", PINK_OUTFIT_PDPS.sneakers),
          similarity: 0.91,
          alternativeCount: 15,
        },
      },
    ],
  },
  {
    id: "biker",
    exampleId: "biker-look",
    label: "Deri Ceket",
    src: "/examples/look-biker.jpg",
    width: 1100,
    height: 1656,
    alt: "Siyah deri biker ceket, siyah askılı body ve yüksek bel jean giyen model",
    credit: "Maks Styazhkin / Unsplash",
    items: [
      {
        id: "biker-jacket",
        label: "Siyah Deri Biker Ceket",
        itemType: "Ceket",
        attributes: "Mat siyah • Gerçek deri • Asimetrik fermuar",
        colorHex: "#1a1a1e",
        confidence: 0.95,
        box: { x: 0.342, y: 0.352, width: 0.233, height: 0.423 },
        match: {
          title: "Asimetrik Fermuarlı Deri Biker Ceket",
          merchant: "Zara",
          price: 3599,
          currency: "TRY",
          url: productUrl("Zara", "deri biker ceket"),
          similarity: 0.93,
          alternativeCount: 14,
        },
      },
      {
        id: "biker-body",
        label: "Siyah İnce Askılı Body",
        itemType: "Body",
        attributes: "Siyah • Kalp yaka • İnce askı",
        colorHex: "#17171a",
        confidence: 0.9,
        box: { x: 0.567, y: 0.365, width: 0.196, height: 0.275 },
        match: {
          title: "Kalp Yaka İnce Askılı Body",
          merchant: "Mango",
          price: 799,
          currency: "TRY",
          url: productUrl("Mango", "kalp yaka askılı body"),
          similarity: 0.88,
          alternativeCount: 11,
        },
      },
      {
        id: "biker-jeans",
        label: "Yüksek Bel Skinny Jean",
        itemType: "Jean",
        attributes: "Koyu indigo • Yüksek bel • Dar kesim",
        colorHex: "#2b4468",
        confidence: 0.94,
        box: { x: 0.437, y: 0.626, width: 0.346, height: 0.364 },
        match: {
          title: "Yüksek Bel Skinny Jean",
          merchant: "H&M",
          price: 899,
          currency: "TRY",
          url: productUrl("H&M", "yüksek bel skinny jean"),
          similarity: 0.9,
          alternativeCount: 18,
        },
      },
      {
        id: "biker-sunglasses",
        label: "Metal Çerçeveli Güneş Gözlüğü",
        itemType: "Gözlük",
        attributes: "İnce metal çerçeve • Dikdörtgen",
        colorHex: "#8a8a90",
        confidence: 0.82,
        box: { x: 0.328, y: 0.825, width: 0.077, height: 0.044 },
        match: {
          title: "İnce Metal Çerçeveli Dikdörtgen Güneş Gözlüğü",
          merchant: "Trendyol",
          price: 349,
          currency: "TRY",
          url: productUrl("Trendyol", "ince metal çerçeve dikdörtgen güneş gözlüğü"),
          similarity: 0.79,
          alternativeCount: 8,
        },
      },
    ],
  },
  {
    id: "longcoat",
    exampleId: "long-coat",
    label: "Uzun Kaban",
    src: "/examples/look-longcoat.jpg",
    width: 1100,
    height: 1375,
    alt: "Uzun siyah kaban, yırtık boyfriend jean, desenli bere ve topuklu sandalet giyen model",
    credit: "Behrooz / Unsplash",
    items: [
      {
        id: "coat-outer",
        label: "Uzun Siyah Kaban",
        itemType: "Kaban",
        attributes: "Siyah • Uzun boy • Kuşaklı",
        colorHex: "#14141a",
        confidence: 0.94,
        box: { x: 0.408, y: 0.237, width: 0.259, height: 0.339 },
        match: {
          title: "Uzun Kuşaklı Kaban",
          merchant: "Mango",
          price: 2799,
          currency: "TRY",
          url: productUrl("Mango", "uzun siyah kuşaklı kaban"),
          similarity: 0.92,
          alternativeCount: 10,
        },
      },
      {
        id: "coat-beanie",
        label: "Desenli Örgü Bere",
        itemType: "Şapka",
        attributes: "Kırık beyaz • Desenli • Örgü",
        colorHex: "#d8d6cf",
        confidence: 0.88,
        box: { x: 0.422, y: 0.104, width: 0.128, height: 0.076 },
        match: {
          title: "Desenli Örgü Bere",
          merchant: "H&M",
          price: 299,
          currency: "TRY",
          url: productUrl("H&M", "desenli örgü bere"),
          similarity: 0.84,
          alternativeCount: 7,
        },
      },
      {
        id: "coat-jeans",
        label: "Yırtık Boyfriend Jean",
        itemType: "Jean",
        attributes: "Orta mavi • Yırtık detay • Bol kesim",
        colorHex: "#5c7ea6",
        confidence: 0.93,
        box: { x: 0.342, y: 0.424, width: 0.338, height: 0.347 },
        match: {
          title: "Yırtık Detaylı Boyfriend Jean",
          merchant: "ASOS",
          price: 1199,
          currency: "TRY",
          url: productUrl("ASOS", "yırtık boyfriend jean"),
          similarity: 0.89,
          alternativeCount: 16,
        },
      },
      {
        id: "coat-sandals",
        label: "Siyah Kalın Topuklu Sandalet",
        itemType: "Sandalet",
        attributes: "Siyah • Kalın topuk • Bilekten bantlı",
        colorHex: "#17171a",
        confidence: 0.91,
        box: { x: 0.325, y: 0.789, width: 0.333, height: 0.107 },
        match: {
          title: "Bilekten Bantlı Kalın Topuklu Sandalet",
          merchant: "Trendyol",
          price: 649,
          currency: "TRY",
          url: productUrl("Trendyol", "kalın topuklu bilekten bantlı sandalet"),
          similarity: 0.87,
          alternativeCount: 13,
        },
      },
    ],
  },
  {
    id: "blazer",
    exampleId: "black-blazer",
    label: "Oversize Blazer",
    src: "/examples/look-blazer.jpg",
    width: 1100,
    height: 1375,
    alt: "Oversize siyah blazer, kırmızı mat ruj ve ince bantlı topuklu sandalet ile model",
    credit: "Zaven Baghdasaryan / Unsplash",
    items: [
      {
        id: "blazer-jacket",
        label: "Oversize Siyah Blazer",
        itemType: "Blazer",
        attributes: "Siyah • Oversize • Tek düğme",
        colorHex: "#16161b",
        confidence: 0.96,
        box: { x: 0.353, y: 0.247, width: 0.297, height: 0.32 },
        match: {
          title: "Oversize Tek Düğmeli Blazer",
          merchant: "Zara",
          price: 2299,
          currency: "TRY",
          url: productUrl("Zara", "oversize siyah blazer"),
          similarity: 0.94,
          alternativeCount: 17,
        },
      },
      {
        id: "blazer-lip",
        label: "Kırmızı Mat Ruj",
        itemType: "Ruj",
        attributes: "Klasik kırmızı • Mat bitiş",
        colorHex: "#c62435",
        confidence: 0.89,
        box: { x: 0.487, y: 0.235, width: 0.038, height: 0.016 },
        match: {
          title: "Uzun Kalıcı Mat Ruj — Klasik Kırmızı",
          merchant: "Sephora",
          price: 459,
          currency: "TRY",
          url: productUrl("Sephora", "kırmızı mat ruj"),
          similarity: 0.86,
          alternativeCount: 21,
        },
      },
      {
        id: "blazer-heels",
        label: "İnce Bantlı Topuklu Sandalet",
        itemType: "Sandalet",
        attributes: "Siyah • İnce bant • Blok topuk",
        colorHex: "#17171a",
        confidence: 0.92,
        box: { x: 0.4, y: 0.704, width: 0.125, height: 0.216 },
        match: {
          title: "İnce Bantlı Blok Topuklu Sandalet",
          merchant: "Mango",
          price: 1299,
          currency: "TRY",
          url: productUrl("Mango", "ince bantlı blok topuklu sandalet"),
          similarity: 0.88,
          alternativeCount: 12,
        },
      },
    ],
  },
];

/** Fallback plate, so a missing asset never renders as a broken hero image. */
export const SHOWCASE_FALLBACK = {
  src: "/examples/showcase-fallback.svg",
  alt: "Örnek tarama görseli yüklenemedi",
};

/** How long each item holds focus in the auto-play cycle, in ms. */
export const SHOWCASE_INTERVAL_MS = 3000;

/**
 * Box lookup for `mockCatalog.ts`, so the hero preview and the `/analyze`
 * overlay are driven by one definition. Throws rather than falling back: a
 * silently misplaced hotspot is harder to notice than a failed build.
 */
export function showcaseBox(exampleId: ExampleId, itemId: string): BoundingBox {
  const look = SHOWCASE_LOOKS.find((entry) => entry.exampleId === exampleId);
  if (!look) throw new Error(`Unknown showcase look: ${exampleId}`);

  const item = look.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Unknown showcase item: ${exampleId}/${itemId}`);

  return item.box;
}
