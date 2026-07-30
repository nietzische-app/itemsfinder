import type { BoundingBox, DetectedItem, ExampleId, ProductMatch } from "@/types";
import { familyOf, normalizeTr, tokenize, type ItemFamily } from "@/lib/itemFamily";
import { SHOWCASE_ITEMS } from "@/lib/showcase";
import { buildMerchantSearchUrl } from "@/services/merchantSearch";

/**
 * Reads a box off the landing-page showcase config so the hero preview and the
 * `/analyze` overlay stay calibrated together. Throws rather than falling back:
 * a silently misplaced hotspot is harder to notice than a failed build.
 */
function showcaseBox(id: string): BoundingBox {
  const item = SHOWCASE_ITEMS.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown showcase item id: ${id}`);
  return item.box;
}

/**
 * The catalogue stores only the *authored* product fields. `merchantDomain`,
 * `isLive` and `brandMetadata` are derived or supplied at read time — see
 * `hydrateProduct` — so the data below stays free of bookkeeping.
 */
export type CatalogProduct = Omit<
  ProductMatch,
  "merchantDomain" | "isLive" | "brandMetadata" | "urlKind" | "productUrl"
> & {
  /**
   * Words to search the merchant's storefront for. The catalogue deliberately
   * stores a query rather than a URL: a hand-written product path is a
   * guaranteed 404 the moment the retailer rotates its catalogue, whereas a
   * search always resolves.
   */
  searchQuery: string;
};

export type CatalogItem = Omit<DetectedItem, "exactMatch" | "alternatives"> & {
  exactMatch: CatalogProduct | null;
  alternatives: CatalogProduct[];
};

/**
 * Mock product catalogue + detection scenarios.
 *
 * This module is the stand-in for two things a production system would own:
 *  1. a product feed (merchant catalogues, prices, stock);
 *  2. a visual similarity index over that feed.
 *
 * Keeping it isolated means `visualSearch.ts` can swap in a real backend
 * without any component needing to change.
 */

/**
 * Builds a self-contained SVG thumbnail so the app has product imagery with
 * zero network access and no binary assets in the repo.
 */
function thumb(label: string, from: string, to: string): string {
  const initials = label
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="500" fill="url(#g)"/>
  <circle cx="200" cy="215" r="96" fill="#ffffff" fill-opacity="0.16"/>
  <text x="200" y="248" font-family="Inter, Helvetica, Arial, sans-serif" font-size="86"
        font-weight="700" fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${initials}</text>
  <rect x="0" y="392" width="400" height="108" fill="#000000" fill-opacity="0.22"/>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* -------------------------------------------------------------------------- */
/*  Demo scenarios                                                            */
/* -------------------------------------------------------------------------- */
/**
 * One scenario per demo look. Each `boundingBox` is normalised to the
 * displayed image — `{ x, y, width, height }` all 0–1 from the top-left — so
 * the hotspots track the artwork at any size.
 *
 * Swapping a demo look's artwork means re-measuring its boxes:
 *
 *   pink-outfit  -> public/examples/pink-outfit.jpg  (boxes live in lib/showcase.ts,
 *                   shared with the landing-page preview so the two cannot drift)
 *   streetwear   -> public/examples/streetwear.svg
 *   glam-makeup  -> public/examples/glam-makeup.svg
 *   tailoring    -> public/examples/tailoring.svg
 *   soft-minimal -> public/examples/soft-minimal.svg
 *
 * Only `src` in `lib/examples.ts` and the boxes below need to change; nothing
 * cares about the file format, and `prepareImage()` handles photo-sized files.
 */

/* --- Scenario: streetwear outfit ------------------------------------------ */

const streetwearItems: CatalogItem[] = [
  {
    id: "sw-jacket",
    label: "Oversize Siyah Deri Biker Ceket",
    itemType: "Ceket",
    category: "clothing",
    attributes: "Mat Siyah • Kısa Boy Moto",
    description:
      "Asimetrik fermuarlı, geniş yakalı ve mat dokulu kısa boy motosiklet ceketi.",
    confidence: 0.96,
    boundingBox: { x: 0.278, y: 0.233, width: 0.444, height: 0.317 },
    colorHex: "#1b1b1f",
    exactMatch: {
      id: "sw-jacket-exact",
      title: "Oversized Faux Leather Biker Jacket",
      brand: "Zara",
      merchant: "Zara",
      price: 3599.90,
      currency: "TRY",
      searchQuery: "Zara Oversized Faux Leather Biker Jacket",
      imageUrl: thumb("Biker Jacket", "#2a2a31", "#0d0d10"),
      matchType: "exact",
      similarity: 0.94,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-jacket-alt-1",
        title: "Suni Deri Motosiklet Ceketi",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1399.90,
        currency: "TRY",
        searchQuery: "Trendyol Suni Deri Motosiklet Ceketi",
        imageUrl: thumb("Moto Jacket", "#3a3a44", "#16161b"),
        matchType: "alternative",
        similarity: 0.87,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-jacket-alt-2",
        title: "Cropped Vegan Leather Jacket",
        brand: "H&M",
        merchant: "H&M",
        price: 1999.90,
        currency: "TRY",
        searchQuery: "H&M Cropped Vegan Leather Jacket",
        imageUrl: thumb("Cropped Jacket", "#45454f", "#1d1d22"),
        matchType: "alternative",
        similarity: 0.83,
        inStock: true,
      },
      {
        id: "sw-jacket-alt-3",
        title: "Classic Zip Biker Jacket",
        brand: "Amazon Essentials",
        merchant: "Amazon",
        price: 2339.90,
        currency: "TRY",
        searchQuery: "Amazon Essentials Classic Zip Biker Jacket",
        imageUrl: thumb("Zip Jacket", "#33333c", "#111115"),
        matchType: "alternative",
        similarity: 0.79,
        tag: "Hızlı kargo",
        inStock: true,
      },
    ],
  },
  {
    id: "sw-top",
    label: "Fitilli Beyaz Crop Üst",
    itemType: "Üst",
    category: "clothing",
    attributes: "Kırık Beyaz • Fitilli Örme",
    description:
      "Kare yakalı, bele oturan fitilli örme kırık beyaz crop üst.",
    confidence: 0.91,
    boundingBox: { x: 0.422, y: 0.35, width: 0.156, height: 0.083 },
    colorHex: "#f4f1ea",
    exactMatch: {
      id: "sw-top-exact",
      title: "Ribbed Square-Neck Crop Top",
      brand: "Mango",
      merchant: "Mango",
      price: 1039.90,
      currency: "TRY",
      searchQuery: "Mango Ribbed Square-Neck Crop Top",
      imageUrl: thumb("Crop Top", "#f7f4ee", "#d8d2c6"),
      matchType: "exact",
      similarity: 0.9,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-top-alt-1",
        title: "Basic Fitilli Crop Tişört",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 399.90,
        currency: "TRY",
        searchQuery: "Trendyol Basic Fitilli Crop Tişört",
        imageUrl: thumb("Rib Tee", "#fbf9f5", "#ded8cc"),
        matchType: "alternative",
        similarity: 0.85,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-top-alt-2",
        title: "Seamless Cropped Tank",
        brand: "H&M",
        merchant: "H&M",
        price: 599.90,
        currency: "TRY",
        searchQuery: "H&M Seamless Cropped Tank",
        imageUrl: thumb("Cropped Tank", "#f2eee6", "#cfc8ba"),
        matchType: "alternative",
        similarity: 0.8,
        inStock: false,
      },
    ],
  },
  {
    id: "sw-jeans",
    label: "Yüksek Bel Düz Paça Jean",
    itemType: "Jean",
    category: "clothing",
    attributes: "Orta Mavi • Yüksek Bel",
    description:
      "Orta mavi sert denim; yüksek bel, düz paça ve kesik paça detayı.",
    confidence: 0.94,
    boundingBox: { x: 0.333, y: 0.533, width: 0.333, height: 0.35 },
    colorHex: "#4a6ea0",
    exactMatch: {
      id: "sw-jeans-exact",
      title: "High-Rise Straight Leg Jeans",
      brand: "Zara",
      merchant: "Zara",
      price: 2399.90,
      currency: "TRY",
      searchQuery: "Zara High-Rise Straight Leg Jeans",
      imageUrl: thumb("Straight Jeans", "#5b7fb2", "#2f4a74"),
      matchType: "exact",
      similarity: 0.92,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-jeans-alt-1",
        title: "Mom Fit Düz Paça Denim",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1099.90,
        currency: "TRY",
        searchQuery: "Trendyol Mom Fit Düz Paça Denim",
        imageUrl: thumb("Mom Denim", "#6d8fbe", "#38527a"),
        matchType: "alternative",
        similarity: 0.86,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-jeans-alt-2",
        title: "Wide High-Waist Jeans",
        brand: "Mango",
        merchant: "Mango",
        price: 1599.90,
        currency: "TRY",
        searchQuery: "Mango Wide High-Waist Jeans",
        imageUrl: thumb("Wide Jeans", "#658ab9", "#334d74"),
        matchType: "alternative",
        similarity: 0.81,
        inStock: true,
      },
      {
        id: "sw-jeans-alt-3",
        title: "Classic Straight Jean",
        brand: "Amazon Essentials",
        merchant: "Amazon",
        price: 1319.90,
        currency: "TRY",
        searchQuery: "Amazon Essentials Classic Straight Jean",
        imageUrl: thumb("Classic Jean", "#7396c4", "#3c5680"),
        matchType: "alternative",
        similarity: 0.77,
        tag: "Hızlı kargo",
        inStock: true,
      },
    ],
  },
  {
    id: "sw-sneakers",
    label: "Kalın Tabanlı Platform Sneaker",
    itemType: "Sneaker",
    category: "clothing",
    attributes: "Kırık Beyaz • Platform Taban",
    description:
      "Kırık beyaz deri spor ayakkabı; abartılı tırtıklı platform taban.",
    confidence: 0.89,
    boundingBox: { x: 0.311, y: 0.883, width: 0.378, height: 0.083 },
    colorHex: "#e8e4dc",
    exactMatch: {
      id: "sw-sneakers-exact",
      title: "Chunky Platform Trainers",
      brand: "Zara",
      merchant: "Zara",
      price: 2799.90,
      currency: "TRY",
      searchQuery: "Zara Chunky Platform Trainers",
      imageUrl: thumb("Platform Trainers", "#eeeae1", "#b9b2a5"),
      matchType: "exact",
      similarity: 0.88,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-sneakers-alt-1",
        title: "Platform Tabanlı Sneaker",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1199.90,
        currency: "TRY",
        searchQuery: "Trendyol Platform Tabanlı Sneaker",
        imageUrl: thumb("Platform Sneaker", "#f1ede5", "#c2bbae"),
        matchType: "alternative",
        similarity: 0.83,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-sneakers-alt-2",
        title: "Retro Court Platform Shoe",
        brand: "ASOS",
        merchant: "ASOS",
        price: 1799.90,
        currency: "TRY",
        searchQuery: "ASOS Retro Court Platform Shoe",
        imageUrl: thumb("Court Shoe", "#e6e1d7", "#ada596"),
        matchType: "alternative",
        similarity: 0.78,
        inStock: true,
      },
    ],
  },
  {
    id: "sw-necklace",
    label: "Altın Rengi Katlı Zincir Kolye",
    itemType: "Kolye",
    category: "clothing",
    attributes: "Altın Rengi • Katmanlı",
    description:
      "Parlak altın rengi, iki sıra gurmet ve figaro zincirden oluşan set.",
    confidence: 0.82,
    boundingBox: { x: 0.411, y: 0.208, width: 0.178, height: 0.058 },
    colorHex: "#d9b155",
    exactMatch: {
      id: "sw-necklace-exact",
      title: "Layered Chain Necklace Set",
      brand: "Mango",
      merchant: "Mango",
      price: 1199.90,
      currency: "TRY",
      searchQuery: "Mango Layered Chain Necklace Set",
      imageUrl: thumb("Chain Necklace", "#e6c574", "#9c7b2c"),
      matchType: "exact",
      similarity: 0.86,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-necklace-alt-1",
        title: "Gold Tone Multi-Row Chain",
        brand: "Amazon Collection",
        merchant: "Amazon",
        price: 519.90,
        currency: "TRY",
        searchQuery: "Amazon Collection Gold Tone Multi-Row Chain",
        imageUrl: thumb("Multi Chain", "#efd28c", "#a9863a"),
        matchType: "alternative",
        similarity: 0.8,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-necklace-alt-2",
        title: "Katmanlı Gurmet Zincir Kolye",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 659.90,
        currency: "TRY",
        searchQuery: "Trendyol Katmanlı Gurmet Zincir Kolye",
        imageUrl: thumb("Curb Chain", "#e9c982", "#a07f33"),
        matchType: "alternative",
        similarity: 0.76,
        inStock: true,
      },
    ],
  },
  {
    id: "sw-lip",
    label: "Nude Mat Dudak Kalemi",
    itemType: "Dudak kalemi",
    category: "beauty",
    attributes: "Kahve Nude • Mat",
    description:
      "Hafif taşırılmış konturla uygulanmış yumuşak kahve-nude mat dudak.",
    confidence: 0.74,
    boundingBox: { x: 0.463, y: 0.135, width: 0.074, height: 0.026 },
    colorHex: "#b57a66",
    exactMatch: {
      id: "sw-lip-exact",
      title: "Lip Cheat Lip Liner — Pillow Talk",
      brand: "Charlotte Tilbury",
      merchant: "Sephora",
      price: 999.90,
      currency: "TRY",
      searchQuery: "Charlotte Tilbury Lip Cheat Lip Liner  Pillow Talk",
      imageUrl: thumb("Lip Liner", "#c98d78", "#8a4f3e"),
      matchType: "exact",
      similarity: 0.85,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sw-lip-alt-1",
        title: "Colour Sensational Shaping Lip Liner",
        brand: "Maybelline",
        merchant: "Amazon",
        price: 259.90,
        currency: "TRY",
        searchQuery: "Maybelline Colour Sensational Shaping Lip Liner",
        imageUrl: thumb("Shaping Liner", "#d69c86", "#96594a"),
        matchType: "alternative",
        similarity: 0.79,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sw-lip-alt-2",
        title: "Precision Nude Dudak Kalemi",
        brand: "Flormar",
        merchant: "Trendyol",
        price: 199.90,
        currency: "TRY",
        searchQuery: "Flormar Precision Nude Dudak Kalemi",
        imageUrl: thumb("Lip Pencil", "#cf9583", "#8e5344"),
        matchType: "alternative",
        similarity: 0.74,
        inStock: true,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Scenario: glam makeup look                                                */
/* -------------------------------------------------------------------------- */

const glamMakeupItems: CatalogItem[] = [
  {
    id: "gm-lipstick",
    label: "Klasik Kırmızı Mat Ruj",
    itemType: "Ruj",
    category: "beauty",
    attributes: "Gerçek Kırmızı • Kadife Mat",
    description:
      "Keskin konturlu, kadife mat bitişli gerçek mavi-kırmızı ton.",
    confidence: 0.97,
    boundingBox: { x: 0.411, y: 0.629, width: 0.178, height: 0.058 },
    colorHex: "#c1122b",
    exactMatch: {
      id: "gm-lipstick-exact",
      title: "Rouge Allure Velvet — Rouge Feu",
      brand: "Chanel",
      merchant: "Sephora",
      price: 1839.90,
      currency: "TRY",
      searchQuery: "Chanel Rouge Allure Velvet  Rouge Feu",
      imageUrl: thumb("Red Lipstick", "#d61b34", "#7c0a1c"),
      matchType: "exact",
      similarity: 0.95,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gm-lipstick-alt-1",
        title: "SuperStay Matte Ink — Pioneer",
        brand: "Maybelline",
        merchant: "Amazon",
        price: 359.90,
        currency: "TRY",
        searchQuery: "Maybelline SuperStay Matte Ink  Pioneer",
        imageUrl: thumb("Matte Ink", "#e02840", "#8d1024"),
        matchType: "alternative",
        similarity: 0.89,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gm-lipstick-alt-2",
        title: "Kadife Mat Ruj — Klasik Kırmızı",
        brand: "Golden Rose",
        merchant: "Trendyol",
        price: 249.90,
        currency: "TRY",
        searchQuery: "Golden Rose Kadife Mat Ruj  Klasik Kırmızı",
        imageUrl: thumb("Velvet Matte", "#cf1c33", "#75091a"),
        matchType: "alternative",
        similarity: 0.84,
        inStock: true,
      },
      {
        id: "gm-lipstick-alt-3",
        title: "Soft Matte Lip Cream — Red",
        brand: "NYX",
        merchant: "Sephora",
        price: 359.90,
        currency: "TRY",
        searchQuery: "NYX Soft Matte Lip Cream  Red",
        imageUrl: thumb("Lip Cream", "#d92339", "#82101f"),
        matchType: "alternative",
        similarity: 0.82,
        inStock: true,
      },
    ],
  },
  {
    id: "gm-eyeshadow",
    label: "Sıcak Bronz Smokey Göz Farı",
    itemType: "Göz farı",
    category: "beauty",
    attributes: "Bakır Bronz • Işıltılı",
    description:
      "Bakır-bronz kapak, dağıtılmış sıcak kahve kırışık ve altın ışıltı.",
    confidence: 0.93,
    boundingBox: { x: 0.29, y: 0.365, width: 0.19, height: 0.075 },
    colorHex: "#a5673a",
    exactMatch: {
      id: "gm-eyeshadow-exact",
      title: "Naked Heat Eyeshadow Palette",
      brand: "Urban Decay",
      merchant: "Sephora",
      price: 2159.90,
      currency: "TRY",
      searchQuery: "Urban Decay Naked Heat Eyeshadow Palette",
      imageUrl: thumb("Heat Palette", "#c07f47", "#6d3c1c"),
      matchType: "exact",
      similarity: 0.93,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gm-eyeshadow-alt-1",
        title: "Nude Heat Eyeshadow Palette",
        brand: "Makeup Revolution",
        merchant: "Amazon",
        price: 479.90,
        currency: "TRY",
        searchQuery: "Makeup Revolution Nude Heat Eyeshadow Palette",
        imageUrl: thumb("Nude Heat", "#cb8b52", "#75421f"),
        matchType: "alternative",
        similarity: 0.87,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gm-eyeshadow-alt-2",
        title: "Bronze Goals 18 Renk Göz Farı Paleti",
        brand: "Note Cosmetics",
        merchant: "Trendyol",
        price: 579.90,
        currency: "TRY",
        searchQuery: "Note Cosmetics Bronze Goals 18 Renk Palet",
        imageUrl: thumb("Bronze Goals", "#b87840", "#663817"),
        matchType: "alternative",
        similarity: 0.81,
        inStock: true,
      },
    ],
  },
  {
    id: "gm-eyeliner",
    label: "Likit Kanatlı Eyeliner",
    itemType: "Eyeliner",
    category: "beauty",
    attributes: "Jet Siyah • Likit Kanat",
    description:
      "Keskin ve uzatılmış kanat olarak çekilmiş jet siyah likit eyeliner.",
    confidence: 0.9,
    boundingBox: { x: 0.53, y: 0.405, width: 0.16, height: 0.032 },
    colorHex: "#101014",
    exactMatch: {
      id: "gm-eyeliner-exact",
      title: "Tattoo Liner — Trooper Black",
      brand: "Kat Von D Beauty",
      merchant: "Sephora",
      price: 1039.90,
      currency: "TRY",
      searchQuery: "Kat Von D Beauty Tattoo Liner  Trooper Black",
      imageUrl: thumb("Tattoo Liner", "#2b2b33", "#0a0a0d"),
      matchType: "exact",
      similarity: 0.91,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gm-eyeliner-alt-1",
        title: "Hyper Precise All Day Liner",
        brand: "Maybelline",
        merchant: "Amazon",
        price: 299.90,
        currency: "TRY",
        searchQuery: "Maybelline Hyper Precise All Day Liner",
        imageUrl: thumb("Precise Liner", "#33333c", "#0e0e12"),
        matchType: "alternative",
        similarity: 0.86,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gm-eyeliner-alt-2",
        title: "Ultra Black Keçe Uçlu Eyeliner",
        brand: "Pastel",
        merchant: "Trendyol",
        price: 209.90,
        currency: "TRY",
        searchQuery: "Pastel Ultra Black Keçe Uçlu Eyeliner",
        imageUrl: thumb("Felt Liner", "#3a3a44", "#111116"),
        matchType: "alternative",
        similarity: 0.8,
        inStock: true,
      },
    ],
  },
  {
    id: "gm-highlighter",
    label: "Şampanya Işıltı Aydınlatıcı",
    itemType: "Aydınlatıcı",
    category: "beauty",
    attributes: "Şampanya • Islak Işıltı",
    description:
      "Elmacık kemiği ve kaş altında ıslak görünümlü şampanya parlaklık.",
    confidence: 0.86,
    boundingBox: { x: 0.29, y: 0.51, width: 0.13, height: 0.06 },
    colorHex: "#e7cba0",
    exactMatch: {
      id: "gm-highlighter-exact",
      title: "Soft Glow Highlighter — Moonstone",
      brand: "Rare Beauty",
      merchant: "Sephora",
      price: 999.90,
      currency: "TRY",
      searchQuery: "Rare Beauty Soft Glow Highlighter  Moonstone",
      imageUrl: thumb("Soft Glow", "#f0d7ae", "#b08c56"),
      matchType: "exact",
      similarity: 0.88,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gm-highlighter-alt-1",
        title: "Shimmer Strips Glow Palette",
        brand: "Physicians Formula",
        merchant: "Amazon",
        price: 439.90,
        currency: "TRY",
        searchQuery: "Physicians Formula Shimmer Strips Glow Palette",
        imageUrl: thumb("Shimmer Strips", "#f4dfbb", "#bb9862"),
        matchType: "alternative",
        similarity: 0.82,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gm-highlighter-alt-2",
        title: "Likit Işıltı Damlası",
        brand: "Flormar",
        merchant: "Trendyol",
        price: 349.90,
        currency: "TRY",
        searchQuery: "Flormar Likit Işıltı Damlası",
        imageUrl: thumb("Glow Drops", "#eed3a6", "#ad8850"),
        matchType: "alternative",
        similarity: 0.77,
        inStock: false,
      },
    ],
  },
  {
    id: "gm-earrings",
    label: "Kalın Altın Rengi Halka Küpe",
    itemType: "Küpe",
    category: "clothing",
    attributes: "Altın Rengi • 40mm Halka",
    description:
      "Altın rengi, parlak yüzeyli kalın 40 mm halka küpe.",
    confidence: 0.84,
    boundingBox: { x: 0.17, y: 0.5, width: 0.08, height: 0.09 },
    colorHex: "#dcb45c",
    exactMatch: {
      id: "gm-earrings-exact",
      title: "Chunky Gold-Plated Hoops",
      brand: "Mango",
      merchant: "Mango",
      price: 1119.90,
      currency: "TRY",
      searchQuery: "Mango Chunky Gold-Plated Hoops",
      imageUrl: thumb("Gold Hoops", "#e8c877", "#9d7c2e"),
      matchType: "exact",
      similarity: 0.89,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gm-earrings-alt-1",
        title: "14K Gold Plated Chunky Hoops",
        brand: "PAVOI",
        merchant: "Amazon",
        price: 559.90,
        currency: "TRY",
        searchQuery: "PAVOI 14K Gold Plated Chunky Hoops",
        imageUrl: thumb("Plated Hoops", "#f0d68f", "#aa8836"),
        matchType: "alternative",
        similarity: 0.85,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gm-earrings-alt-2",
        title: "Kalın Halka Küpe",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 379.90,
        currency: "TRY",
        searchQuery: "Trendyol Kalın Halka Küpe",
        imageUrl: thumb("Statement Hoops", "#e5c471", "#9a7930"),
        matchType: "alternative",
        similarity: 0.79,
        inStock: true,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Scenario: generic user upload                                             */
/* -------------------------------------------------------------------------- */

const genericItems: CatalogItem[] = [
  {
    id: "gen-outerwear",
    label: "Rahat Kesim Yün Karışımlı Kaban",
    itemType: "Kaban",
    category: "clothing",
    attributes: "Camel • Yün Karışımlı",
    description:
      "Sıcak camel yün karışımında, kruvaze ve oversize kesimli kaban.",
    confidence: 0.88,
    boundingBox: { x: 0.24, y: 0.18, width: 0.5, height: 0.36 },
    colorHex: "#b5895a",
    exactMatch: {
      id: "gen-outerwear-exact",
      title: "Oversized Wool Blend Coat",
      brand: "Mango",
      merchant: "Mango",
      price: 5199.90,
      currency: "TRY",
      searchQuery: "Mango Oversized Wool Blend Coat",
      imageUrl: thumb("Wool Coat", "#c69a68", "#7d5a31"),
      matchType: "exact",
      similarity: 0.86,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gen-outerwear-alt-1",
        title: "Uzun Kruvaze Kaban",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 2199.90,
        currency: "TRY",
        searchQuery: "Trendyol Uzun Kruvaze Kaban",
        imageUrl: thumb("Longline Coat", "#d0a674", "#87613a"),
        matchType: "alternative",
        similarity: 0.81,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gen-outerwear-alt-2",
        title: "Belted Camel Overcoat",
        brand: "H&M",
        merchant: "H&M",
        price: 3199.90,
        currency: "TRY",
        searchQuery: "H&M Belted Camel Overcoat",
        imageUrl: thumb("Camel Overcoat", "#c99d6a", "#7f5b33"),
        matchType: "alternative",
        similarity: 0.78,
        inStock: true,
      },
    ],
  },
  {
    id: "gen-bag",
    label: "Yapılandırılmış Omuz Çantası",
    itemType: "Çanta",
    category: "clothing",
    attributes: "Siyah • Yapılandırılmış Deri",
    description:
      "Altın rengi aksesuarlı, düz siyah deriden kompakt üst saplı çanta.",
    confidence: 0.85,
    boundingBox: { x: 0.6, y: 0.48, width: 0.22, height: 0.16 },
    colorHex: "#25232a",
    exactMatch: {
      id: "gen-bag-exact",
      title: "Structured Top-Handle Bag",
      brand: "Zara",
      merchant: "Zara",
      price: 1999.90,
      currency: "TRY",
      searchQuery: "Zara Structured Top-Handle Bag",
      imageUrl: thumb("Handle Bag", "#3a3742", "#141319"),
      matchType: "exact",
      similarity: 0.87,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gen-bag-alt-1",
        title: "Mini Baguette Omuz Çantası",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 879.90,
        currency: "TRY",
        searchQuery: "Trendyol Mini Baguette Omuz Çantası",
        imageUrl: thumb("Baguette Bag", "#45414e", "#1a181f"),
        matchType: "alternative",
        similarity: 0.8,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gen-bag-alt-2",
        title: "Faux Leather Crossbody",
        brand: "Amazon",
        merchant: "Amazon",
        price: 1199.90,
        currency: "TRY",
        searchQuery: "Amazon Faux Leather Crossbody",
        imageUrl: thumb("Crossbody", "#403d49", "#17161c"),
        matchType: "alternative",
        similarity: 0.75,
        tag: "Hızlı kargo",
        inStock: true,
      },
    ],
  },
  {
    id: "gen-boots",
    label: "Diz Üstü Deri Çizme",
    itemType: "Çizme",
    category: "clothing",
    attributes: "Siyah • Diz Üstü",
    description:
      "Badem burunlu ve kalın topuklu, şık diz üstü çizme.",
    confidence: 0.83,
    boundingBox: { x: 0.33, y: 0.72, width: 0.3, height: 0.2 },
    colorHex: "#1f1c22",
    exactMatch: {
      id: "gen-boots-exact",
      title: "Knee-High Block Heel Boots",
      brand: "Zara",
      merchant: "Zara",
      price: 3999.90,
      currency: "TRY",
      searchQuery: "Zara Knee-High Block Heel Boots",
      imageUrl: thumb("Knee Boots", "#34313b", "#121016"),
      matchType: "exact",
      similarity: 0.84,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gen-boots-alt-1",
        title: "Suni Deri Uzun Çizme",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1699.90,
        currency: "TRY",
        searchQuery: "Trendyol Suni Deri Uzun Çizme",
        imageUrl: thumb("Tall Boots", "#3d3a45", "#151319"),
        matchType: "alternative",
        similarity: 0.79,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gen-boots-alt-2",
        title: "Riding Boot With Stretch Panel",
        brand: "ASOS",
        merchant: "ASOS",
        price: 2719.90,
        currency: "TRY",
        searchQuery: "ASOS Riding Boot With Stretch Panel",
        imageUrl: thumb("Riding Boot", "#37343e", "#131117"),
        matchType: "alternative",
        similarity: 0.74,
        inStock: true,
      },
    ],
  },
  {
    id: "gen-lip",
    label: "Böğürtlen Renkli Dudak Balmı",
    itemType: "Dudak balmı",
    category: "beauty",
    attributes: "Böğürtlen • İnce Saten",
    description:
      "Dudakta doğal saten bitişli, ince böğürtlen renk geçişi.",
    confidence: 0.72,
    boundingBox: { x: 0.45, y: 0.09, width: 0.09, height: 0.035 },
    colorHex: "#a63b57",
    exactMatch: {
      id: "gen-lip-exact",
      title: "Lip Glowy Balm — Berry",
      brand: "Rare Beauty",
      merchant: "Sephora",
      price: 879.90,
      currency: "TRY",
      searchQuery: "Rare Beauty Lip Glowy Balm  Berry",
      imageUrl: thumb("Glowy Balm", "#c25370", "#732239"),
      matchType: "exact",
      similarity: 0.83,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "gen-lip-alt-1",
        title: "Tinted Lip Oil — Wild Berry",
        brand: "e.l.f.",
        merchant: "Amazon",
        price: 319.90,
        currency: "TRY",
        searchQuery: "e.l.f. Tinted Lip Oil  Wild Berry",
        imageUrl: thumb("Lip Oil", "#cd6580", "#7e2941"),
        matchType: "alternative",
        similarity: 0.78,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "gen-lip-alt-2",
        title: "Juicy Renkli Dudak Balmı",
        brand: "Flormar",
        merchant: "Trendyol",
        price: 219.90,
        currency: "TRY",
        searchQuery: "Flormar Juicy Renkli Dudak Balmı",
        imageUrl: thumb("Tint Balm", "#c65c78", "#78253c"),
        matchType: "alternative",
        similarity: 0.73,
        inStock: true,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Scenario: tailored evening look ("Midnight Executive")                    */
/* -------------------------------------------------------------------------- */

const tailoringItems: CatalogItem[] = [
  {
    id: "tl-blazer",
    label: "Yapılandırılmış Yün Blazer",
    itemType: "Blazer",
    category: "clothing",
    attributes: "Gece Lacivert • Kırlangıç Yaka",
    description:
      "Kırlangıç yakalı, belirgin omuzlu ve keskin kesimli tek sıra düğmeli blazer.",
    confidence: 0.95,
    boundingBox: { x: 0.278, y: 0.233, width: 0.456, height: 0.3 },
    colorHex: "#212636",
    exactMatch: {
      id: "tl-blazer-exact",
      title: "Wool Blend Peak Lapel Blazer",
      brand: "Mango",
      merchant: "Mango",
      price: 5999.90,
      currency: "TRY",
      searchQuery: "Mango Wool Blend Peak Lapel Blazer",
      imageUrl: thumb("Wool Blazer", "#39405a", "#161a26"),
      matchType: "exact",
      similarity: 0.93,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "tl-blazer-alt-1",
        title: "Tailored Fit Blazer Ceket",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 2199.90,
        currency: "TRY",
        searchQuery: "Trendyol Tailored Fit Blazer Ceket",
        imageUrl: thumb("Tailored Blazer", "#434a66", "#1b1f2d"),
        matchType: "alternative",
        similarity: 0.86,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "tl-blazer-alt-2",
        title: "Structured Twill Blazer",
        brand: "H&M",
        merchant: "H&M",
        price: 3199.90,
        currency: "TRY",
        searchQuery: "H&M Structured Twill Blazer",
        imageUrl: thumb("Twill Blazer", "#3d4460", "#191d29"),
        matchType: "alternative",
        similarity: 0.82,
        inStock: true,
      },
    ],
  },
  {
    id: "tl-trousers",
    label: "Pileli Düz Kesim Pantolon",
    itemType: "Pantolon",
    category: "clothing",
    attributes: "Gece Lacivert • Ön Pile",
    description:
      "Yüksek bel pileli pantolon; ütü çizgisi belirgin, paça temiz duruşlu.",
    confidence: 0.92,
    boundingBox: { x: 0.356, y: 0.533, width: 0.289, height: 0.342 },
    colorHex: "#1e2331",
    exactMatch: {
      id: "tl-trousers-exact",
      title: "Pleated Wide Leg Trousers",
      brand: "Zara",
      merchant: "Zara",
      price: 2799.90,
      currency: "TRY",
      searchQuery: "Zara Pleated Wide Leg Trousers",
      imageUrl: thumb("Pleated Trousers", "#333a52", "#151824"),
      matchType: "exact",
      similarity: 0.9,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "tl-trousers-alt-1",
        title: "Yüksek Bel Pileli Pantolon",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1079.90,
        currency: "TRY",
        searchQuery: "Trendyol Yüksek Bel Pileli Pantolon",
        imageUrl: thumb("Pleated Pants", "#3c435e", "#181c28"),
        matchType: "alternative",
        similarity: 0.84,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "tl-trousers-alt-2",
        title: "Straight Leg Suit Trouser",
        brand: "ASOS",
        merchant: "ASOS",
        price: 1799.90,
        currency: "TRY",
        searchQuery: "ASOS Straight Leg Suit Trouser",
        imageUrl: thumb("Suit Trouser", "#373e57", "#171a26"),
        matchType: "alternative",
        similarity: 0.79,
        inStock: true,
      },
    ],
  },
  {
    id: "tl-boots",
    label: "Deri Chelsea Bot",
    itemType: "Bot",
    category: "clothing",
    attributes: "Koyu Kahve • Kalın Taban",
    description:
      "Yanları lastik detaylı, tırtıklı tabanlı parlak deri Chelsea bot.",
    confidence: 0.88,
    boundingBox: { x: 0.322, y: 0.875, width: 0.356, height: 0.083 },
    colorHex: "#33261e",
    exactMatch: {
      id: "tl-boots-exact",
      title: "Leather Chelsea Boot",
      brand: "Zara",
      merchant: "Zara",
      price: 4759.90,
      currency: "TRY",
      searchQuery: "Zara Leather Chelsea Boot",
      imageUrl: thumb("Chelsea Boot", "#4a3b30", "#231a14"),
      matchType: "exact",
      similarity: 0.89,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "tl-boots-alt-1",
        title: "Kalın Tabanlı Chelsea Bot",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1799.90,
        currency: "TRY",
        searchQuery: "Trendyol Kalın Tabanlı Chelsea Bot",
        imageUrl: thumb("Chunky Chelsea", "#544437", "#291f18"),
        matchType: "alternative",
        similarity: 0.83,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "tl-boots-alt-2",
        title: "Faux Leather Ankle Boot",
        brand: "Amazon",
        merchant: "Amazon",
        price: 2359.90,
        currency: "TRY",
        searchQuery: "Amazon Faux Leather Ankle Boot",
        imageUrl: thumb("Ankle Boot", "#4f4034", "#251c16"),
        matchType: "alternative",
        similarity: 0.76,
        tag: "Hızlı kargo",
        inStock: true,
      },
    ],
  },
  {
    id: "tl-tote",
    label: "Yapılandırılmış Deri Tote Çanta",
    itemType: "Çanta",
    category: "clothing",
    attributes: "Espresso • Üst Saplı",
    description:
      "Kutu formlu, üst saplı, ince altın rengi metal aksesuarlı deri çanta.",
    confidence: 0.86,
    boundingBox: { x: 0.689, y: 0.467, width: 0.156, height: 0.142 },
    colorHex: "#3a2c22",
    exactMatch: {
      id: "tl-tote-exact",
      title: "Structured Leather Tote Bag",
      brand: "Mango",
      merchant: "Mango",
      price: 3599.90,
      currency: "TRY",
      searchQuery: "Mango Structured Leather Tote Bag",
      imageUrl: thumb("Leather Tote", "#4d3c2e", "#241b14"),
      matchType: "exact",
      similarity: 0.87,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "tl-tote-alt-1",
        title: "Minimal Üst Saplı Çanta",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1319.90,
        currency: "TRY",
        searchQuery: "Trendyol Minimal Üst Saplı Çanta",
        imageUrl: thumb("Top Handle", "#57432f", "#2a2016"),
        matchType: "alternative",
        similarity: 0.81,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "tl-tote-alt-2",
        title: "Vegan Leather Work Tote",
        brand: "Amazon",
        merchant: "Amazon",
        price: 1659.90,
        currency: "TRY",
        searchQuery: "Amazon Vegan Leather Work Tote",
        imageUrl: thumb("Work Tote", "#513f31", "#271e17"),
        matchType: "alternative",
        similarity: 0.75,
        inStock: false,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Scenario: soft minimalist knitwear ("Soft Minimalist")                    */
/* -------------------------------------------------------------------------- */

const softMinimalItems: CatalogItem[] = [
  {
    id: "sm-knit",
    label: "Kalın Saç Örgü Kazak",
    itemType: "Kazak",
    category: "clothing",
    attributes: "Yulaf Krem • Saç Örgü",
    description:
      "Düşük omuzlu, boyanmamış yulaf renginde oversize saç örgü kazak.",
    confidence: 0.94,
    boundingBox: { x: 0.256, y: 0.3, width: 0.489, height: 0.383 },
    colorHex: "#e3d5c0",
    exactMatch: {
      id: "sm-knit-exact",
      title: "Oversized Cable Knit Jumper",
      brand: "Mango",
      merchant: "Mango",
      price: 3199.90,
      currency: "TRY",
      searchQuery: "Mango Oversized Cable Knit Jumper",
      imageUrl: thumb("Cable Knit", "#eadcc7", "#bda88c"),
      matchType: "exact",
      similarity: 0.92,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sm-knit-alt-1",
        title: "Yumuşak Saç Örgü Kazak",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 1199.90,
        currency: "TRY",
        searchQuery: "Trendyol Yumuşak Saç Örgü Kazak",
        imageUrl: thumb("Knit Pullover", "#efe2cf", "#c4b096"),
        matchType: "alternative",
        similarity: 0.85,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sm-knit-alt-2",
        title: "Chunky Rib Knit Sweater",
        brand: "H&M",
        merchant: "H&M",
        price: 1799.90,
        currency: "TRY",
        searchQuery: "H&M Chunky Rib Knit Sweater",
        imageUrl: thumb("Rib Sweater", "#e8dac5", "#bfab90"),
        matchType: "alternative",
        similarity: 0.8,
        inStock: true,
      },
    ],
  },
  {
    id: "sm-scarf",
    label: "Desenli İpek Fular",
    itemType: "Fular",
    category: "clothing",
    attributes: "Terrakota • Saf İpek",
    description:
      "Sıcak terrakota tonlarında, boyuna düğümlenmiş hafif ipek twill fular.",
    confidence: 0.89,
    boundingBox: { x: 0.389, y: 0.242, width: 0.222, height: 0.092 },
    colorHex: "#e0a894",
    exactMatch: {
      id: "sm-scarf-exact",
      title: "Silk Twill Neck Scarf",
      brand: "Mango",
      merchant: "Mango",
      price: 1439.90,
      currency: "TRY",
      searchQuery: "Mango Silk Twill Neck Scarf",
      imageUrl: thumb("Silk Scarf", "#eeb9a6", "#b47660"),
      matchType: "exact",
      similarity: 0.88,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sm-scarf-alt-1",
        title: "Saten Fular",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 359.90,
        currency: "TRY",
        searchQuery: "Trendyol Saten Fular",
        imageUrl: thumb("Neckerchief", "#f2c3b1", "#bc7f69"),
        matchType: "alternative",
        similarity: 0.82,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sm-scarf-alt-2",
        title: "Printed Square Scarf",
        brand: "Amazon",
        merchant: "Amazon",
        price: 599.90,
        currency: "TRY",
        searchQuery: "Amazon Printed Square Scarf",
        imageUrl: thumb("Square Scarf", "#edbba8", "#b17a64"),
        matchType: "alternative",
        similarity: 0.77,
        inStock: true,
      },
    ],
  },
  {
    id: "sm-earrings",
    label: "İnci Damla Küpe",
    itemType: "Küpe",
    category: "clothing",
    attributes: "Tatlı Su İncisi • Altın Rengi Çivi",
    description:
      "İnce altın rengi çiviye asılı tek tatlı su incisi.",
    confidence: 0.81,
    boundingBox: { x: 0.372, y: 0.17, width: 0.05, height: 0.055 },
    colorHex: "#f2ece1",
    exactMatch: {
      id: "sm-earrings-exact",
      title: "Freshwater Pearl Drop Earrings",
      brand: "Mango",
      merchant: "Mango",
      price: 1319.90,
      currency: "TRY",
      searchQuery: "Mango Freshwater Pearl Drop Earrings",
      imageUrl: thumb("Pearl Drop", "#f6f1e8", "#cbbfa8"),
      matchType: "exact",
      similarity: 0.85,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sm-earrings-alt-1",
        title: "Simulated Pearl Drop Earring",
        brand: "PAVOI",
        merchant: "Amazon",
        price: 479.90,
        currency: "TRY",
        searchQuery: "PAVOI Simulated Pearl Drop Earring",
        imageUrl: thumb("Pearl Earring", "#f8f4ed", "#d3c7b1"),
        matchType: "alternative",
        similarity: 0.8,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sm-earrings-alt-2",
        title: "Barok İnci Küpe",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 299.90,
        currency: "TRY",
        searchQuery: "Trendyol Barok İnci Küpe",
        imageUrl: thumb("Pearl Stud", "#f4eee4", "#c9bda6"),
        matchType: "alternative",
        similarity: 0.74,
        inStock: true,
      },
    ],
  },
  {
    id: "sm-lip",
    label: "Gül Ağacı Renkli Dudak Balmı",
    itemType: "Dudak balmı",
    category: "beauty",
    attributes: "Gül Ağacı • İnce Saten",
    description:
      "Belirgin konturu olmayan, yastıksı saten bitişli soft gül ağacı ton.",
    confidence: 0.78,
    boundingBox: { x: 0.461, y: 0.185, width: 0.078, height: 0.025 },
    colorHex: "#c07f7a",
    exactMatch: {
      id: "sm-lip-exact",
      title: "Soft Pinch Tinted Lip Oil — Serenity",
      brand: "Rare Beauty",
      merchant: "Sephora",
      price: 879.90,
      currency: "TRY",
      searchQuery: "Rare Beauty Soft Pinch Tinted Lip Oil  Serenity",
      imageUrl: thumb("Lip Oil", "#d1918b", "#8d4d47"),
      matchType: "exact",
      similarity: 0.84,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "sm-lip-alt-1",
        title: "Butter Gloss — Tiramisu",
        brand: "NYX",
        merchant: "Amazon",
        price: 219.90,
        currency: "TRY",
        searchQuery: "NYX Butter Gloss  Tiramisu",
        imageUrl: thumb("Butter Gloss", "#dba09a", "#95564f"),
        matchType: "alternative",
        similarity: 0.79,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "sm-lip-alt-2",
        title: "Renkli Dudak Bakım Balmı",
        brand: "Flormar",
        merchant: "Trendyol",
        price: 179.90,
        currency: "TRY",
        searchQuery: "Flormar Renkli Dudak Bakım Balmı",
        imageUrl: thumb("Care Balm", "#d69a94", "#8f5049"),
        matchType: "alternative",
        similarity: 0.73,
        inStock: true,
      },
    ],
  },
];

/* --- Scenario: pink-outfit (the landing page showcase) --------------------- */

/**
 * The look the landing page scans. Its boxes are read straight off
 * `SHOWCASE_ITEMS` rather than copied, so the hotspots in the hero preview and
 * the hotspots on `/analyze` can never drift apart — re-calibrating the photo
 * is a one-place edit.
 *
 * Each `exactMatch` mirrors the product the hero card shows for that item, so
 * opening the scan confirms what the preview promised instead of replacing it.
 */
const pinkOutfitItems: CatalogItem[] = [
  {
    id: "po-cardigan",
    label: "Pembe Fermuarlı Triko Ceket",
    itemType: "Ceket",
    category: "clothing",
    attributes: "Pastel Pembe • İnce Triko",
    description:
      "Yüksek yakalı, tam boy fermuarlı, ince örgü pastel pembe triko ceket.",
    confidence: 0.96,
    boundingBox: showcaseBox("showcase-top"),
    colorHex: "#f0a0b4",
    exactMatch: {
      id: "po-cardigan-exact",
      title: "Fermuarlı Yüksek Yaka Triko Ceket",
      brand: "Trendyol Milla",
      merchant: "Trendyol",
      price: 549.0,
      currency: "TRY",
      searchQuery: "pembe fermuarlı triko ceket",
      imageUrl: thumb("Pink Cardigan", "#f6b9c8", "#d9829a"),
      matchType: "exact",
      similarity: 0.94,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "po-cardigan-alt-1",
        title: "Fermuarlı Örgü Hırka",
        brand: "H&M",
        merchant: "H&M",
        price: 299.9,
        currency: "TRY",
        searchQuery: "pembe fermuarlı örgü hırka",
        imageUrl: thumb("Knit Cardigan", "#f9c9d5", "#dd93a7"),
        matchType: "alternative",
        similarity: 0.86,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "po-cardigan-alt-2",
        title: "Yüksek Yaka Fermuarlı Hırka",
        brand: "Mango",
        merchant: "Mango",
        price: 429.9,
        currency: "TRY",
        searchQuery: "yüksek yaka fermuarlı pembe kazak",
        imageUrl: thumb("Zip Sweater", "#f4aebe", "#cf7690"),
        matchType: "alternative",
        similarity: 0.82,
        inStock: true,
      },
      {
        id: "po-cardigan-alt-3",
        title: "Ribbed Zip-Through Cardigan",
        brand: "ASOS",
        merchant: "ASOS",
        price: 499.9,
        currency: "TRY",
        searchQuery: "pembe fermuarlı triko üst",
        imageUrl: thumb("Ribbed Knit", "#f7c2cf", "#d5889d"),
        matchType: "alternative",
        similarity: 0.79,
        inStock: true,
      },
    ],
  },
  {
    id: "po-shorts",
    label: "Siyah Deri Mini Şort",
    itemType: "Şort",
    category: "clothing",
    attributes: "Mat Siyah • Deri Görünümlü",
    description: "Yüksek bel, düz kesim, mat deri görünümlü siyah mini şort.",
    confidence: 0.93,
    boundingBox: showcaseBox("showcase-bottom"),
    colorHex: "#16181c",
    exactMatch: {
      id: "po-shorts-exact",
      title: "Deri Görünümlü Yüksek Bel Mini Şort",
      brand: "Zara",
      merchant: "Zara",
      price: 899.0,
      currency: "TRY",
      searchQuery: "deri görünümlü mini şort",
      imageUrl: thumb("Leather Shorts", "#2a2a31", "#0d0d10"),
      matchType: "exact",
      similarity: 0.89,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "po-shorts-alt-1",
        title: "Suni Deri Yüksek Bel Şort",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 249.9,
        currency: "TRY",
        searchQuery: "suni deri yüksek bel şort",
        imageUrl: thumb("Faux Shorts", "#35353d", "#131317"),
        matchType: "alternative",
        similarity: 0.84,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "po-shorts-alt-2",
        title: "Coated Mini Shorts",
        brand: "H&M",
        merchant: "H&M",
        price: 449.9,
        currency: "TRY",
        searchQuery: "siyah kaplamalı mini şort",
        imageUrl: thumb("Coated Shorts", "#3d3d46", "#17171c"),
        matchType: "alternative",
        similarity: 0.8,
        inStock: true,
      },
      {
        id: "po-shorts-alt-3",
        title: "Faux Leather Tailored Short",
        brand: "ASOS",
        merchant: "ASOS",
        price: 629.9,
        currency: "TRY",
        searchQuery: "siyah deri görünümlü şort",
        imageUrl: thumb("Tailored Short", "#30303a", "#101014"),
        matchType: "alternative",
        similarity: 0.76,
        inStock: false,
      },
    ],
  },
  {
    id: "po-sneakers",
    label: "Siyah Beyaz Bilekli Sneaker",
    itemType: "Sneaker",
    category: "clothing",
    attributes: "Siyah/Beyaz • Bilekli",
    description:
      "Bilek yükseklikli, siyah beyaz panelli, retro basketbol siluetli deri sneaker.",
    confidence: 0.95,
    boundingBox: showcaseBox("showcase-shoes"),
    colorHex: "#1b1b1b",
    exactMatch: {
      id: "po-sneakers-exact",
      title: "Bilekli Retro Basketbol Sneaker",
      brand: "Amazon",
      merchant: "Amazon",
      price: 2499.0,
      currency: "TRY",
      searchQuery: "siyah beyaz bilekli sneaker",
      imageUrl: thumb("High Top", "#f2f2f2", "#1b1b1b"),
      matchType: "exact",
      similarity: 0.91,
      tag: "Birebir eşleşme",
      inStock: true,
    },
    alternatives: [
      {
        id: "po-sneakers-alt-1",
        title: "Bilekli Spor Ayakkabı",
        brand: "Trendyol",
        merchant: "Trendyol",
        price: 899.9,
        currency: "TRY",
        searchQuery: "bilekli siyah beyaz spor ayakkabı",
        imageUrl: thumb("Ankle Sneaker", "#e8e8e8", "#26262a"),
        matchType: "alternative",
        similarity: 0.83,
        tag: "En uygun",
        inStock: true,
      },
      {
        id: "po-sneakers-alt-2",
        title: "Panelli Yüksek Bilek Sneaker",
        brand: "H&M",
        merchant: "H&M",
        price: 1299.9,
        currency: "TRY",
        searchQuery: "yüksek bilek panelli sneaker",
        imageUrl: thumb("Panel Sneaker", "#ededed", "#2f2f34"),
        matchType: "alternative",
        similarity: 0.8,
        inStock: true,
      },
      {
        id: "po-sneakers-alt-3",
        title: "Retro Hi-Top Trainer",
        brand: "ASOS",
        merchant: "ASOS",
        price: 1799.9,
        currency: "TRY",
        searchQuery: "retro yüksek bilek sneaker",
        imageUrl: thumb("Hi Top", "#f5f5f5", "#1f1f23"),
        matchType: "alternative",
        similarity: 0.77,
        inStock: true,
      },
    ],
  },
];

/** Every scenario the mock engine can return. */
export const MOCK_SCENARIOS: Record<ExampleId | "generic", CatalogItem[]> = {
  "pink-outfit": pinkOutfitItems,
  streetwear: streetwearItems,
  "glam-makeup": glamMakeupItems,
  tailoring: tailoringItems,
  "soft-minimal": softMinimalItems,
  generic: genericItems,
};

/**
 * Flat product index used by the real-API path: once Vision has told us *what*
 * is in the image, we still need *something to buy*. Until a live product feed
 * is wired in, we resolve labels against this catalogue.
 */
const ALL_ITEMS: CatalogItem[] = [
  ...pinkOutfitItems,
  ...streetwearItems,
  ...glamMakeupItems,
  ...tailoringItems,
  ...softMinimalItems,
  ...genericItems,
];

/**
 * Finds catalogue products for a free-text label coming from a vision API.
 * Scores on shared significant words and falls back to the closest item in the
 * same category so the UI always has something to show.
 */
export function findProductsForLabel(
  label: string,
  category: "clothing" | "beauty",
  /**
   * Overrides the family read off `label`. Vision's object class ("Footwear",
   * "Outerwear") is the authoritative signal for *what kind of thing* this is,
   * so the caller passes it rather than letting a long descriptive label — which
   * may mention several garments — decide by keyword order.
   */
  familyHint?: ItemFamily,
): { exactMatch: CatalogProduct | null; alternatives: CatalogProduct[] } {
  const hinted = familyHint && familyHint !== "unknown" ? familyHint : null;
  const wanted = hinted ?? familyOf(label);
  const needles = tokenize(label);

  // Same category, and — when we could read a family off the label — the same
  // family. This is the gate that makes "shoes showed me a jacket" impossible
  // rather than merely unlikely.
  const candidates = ALL_ITEMS.filter((item) => {
    if (item.category !== category) return false;
    if (wanted === "unknown") return true;
    return familyOf(`${item.itemType} ${item.label}`) === wanted;
  });

  let best: CatalogItem | null = null;
  let bestScore = 0;

  for (const item of candidates) {
    const haystack = normalizeTr(`${item.label} ${item.itemType} ${item.description}`);
    const score = needles.reduce(
      (total, needle) => total + (haystack.includes(needle) ? 1 : 0),
      0,
    );

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  /*
   * Falling back to the first item of the right *family* is fine — a sneaker
   * standing in for a boot is still footwear. Falling back to the first item of
   * the right *category*, which is what this used to do, is how a detected shoe
   * ended up showing the catalogue's first jacket: with Turkish labels the word
   * scores are often all zero, so that branch ran far more often than it looked
   * like it would.
   */
  const resolved = best ?? (wanted === "unknown" ? null : candidates[0] ?? null);

  if (!resolved) {
    // Better to show a detection with no products than to point someone at the
    // wrong garment. The panel renders this state.
    return { exactMatch: null, alternatives: [] };
  }

  return {
    exactMatch: resolved.exactMatch,
    alternatives: resolved.alternatives,
  };
}

/**
 * Repoints a catalogue product's storefront search at what was actually
 * detected, keeping the retailer.
 *
 * Without this, a shoe detection that resolves to the catalogue's platform
 * sneaker sends you to a search for *that* sneaker's title. The family is right
 * but the query is still someone else's: the button says "find it in the store",
 * so the store it opens should be searching for your item.
 */
export function retargetSearchQuery(
  product: CatalogProduct,
  searchQuery: string,
): CatalogProduct {
  const trimmed = searchQuery.trim();
  return trimmed ? { ...product, searchQuery: trimmed } : product;
}

/* -------------------------------------------------------------------------- */
/*  Hydration                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turns an authored catalogue row into a UI-ready `ProductMatch`, resolving its
 * `searchQuery` into a live storefront search URL.
 */
export function hydrateProduct(product: CatalogProduct): ProductMatch {
  const { searchQuery, ...rest } = product;
  const productUrl = buildMerchantSearchUrl(product.merchant, searchQuery);

  let merchantDomain = "";
  if (productUrl) {
    try {
      merchantDomain = new URL(productUrl).hostname.replace(/^www\./, "");
    } catch {
      // Builders emit absolute URLs; an unparseable one only loses branding.
    }
  }

  return {
    ...rest,
    // A merchant with no search endpoint would leave the CTA dead, so the card
    // is marked out of stock rather than shipped with nowhere to go.
    productUrl: productUrl ?? "",
    urlKind: "search",
    inStock: productUrl ? product.inStock : false,
    merchantDomain,
    isLive: false,
  };
}

/** Hydrates a whole scenario into UI-ready detections. */
export function hydrateItems(items: CatalogItem[]): DetectedItem[] {
  return items.map((item) => ({
    ...item,
    exactMatch: item.exactMatch ? hydrateProduct(item.exactMatch) : null,
    alternatives: item.alternatives.map(hydrateProduct),
  }));
}
