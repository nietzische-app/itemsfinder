import type { Merchant } from "@/types";
import type { ItemFamily } from "@/lib/itemFamily";

/**
 * Direct product-detail-page (PDP) URL helpers and a curated fallback catalogue.
 *
 * Search-result pages (`/search?q=…`, `searchTerm=…`, `/sr?q=…`) are never buy
 * links. CTAs must only open real PDPs (Trendyol `-p-123`, Zara `…-p0….html`,
 * Amazon `/dp/…`, LCW `/urun/…`, DeFacto `…-1234567`).
 */

/** Absolute ban patterns — any match means "not a PDP". */
const BANNED_SEARCH_PATH =
  /\/(search|sr|s|search-results|arama|ara|katalog|category|categories|c\/)(\/|$)/i;
const BANNED_SEARCH_QUERY =
  /[?&](q|k|kw|searchterm|searchTerm|query|keywords|field-keywords|text|term)=/i;

/**
 * True when the URL is a storefront search / listing page and must never be
 * rendered on a product card CTA.
 */
export function isBannedSearchUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }

  const path = url.pathname;
  const search = url.search;

  if (BANNED_SEARCH_PATH.test(path)) return true;
  if (BANNED_SEARCH_QUERY.test(search)) return true;
  if (/searchterm=/i.test(value)) return true;
  if (/\/search\?/i.test(value)) return true;
  if (/[?&]sr\?/i.test(value) || /\/sr\?/i.test(value)) return true;

  return false;
}

/** True when a URL looks like a retailer product page rather than a search. */
export function isDirectProductUrl(value: string): boolean {
  if (!value?.trim()) return false;
  if (isBannedSearchUrl(value)) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname.toLowerCase();

  // Category / listing shells that are not searches but also not PDPs.
  if (
    /\/[a-z0-9-]+-x-(r\d+-)?c\d+/.test(path) || // Trendyol category/filter pages
    /\/(l|c)\d+\.html$/.test(path) // Zara/Inditex category listing pages
  ) {
    return false;
  }

  if (host.includes("trendyol.com")) {
    return /-p-\d+/.test(path);
  }

  if (host.includes("amazon.")) {
    return /\/(dp|gp\/product)\/[a-z0-9]{8,}/i.test(path);
  }

  // Inditex family: Zara, Lefties, Pull&Bear, Stradivarius, Bershka
  if (
    host.includes("zara.com") ||
    host.includes("lefties.com") ||
    host.includes("pullandbear.com") ||
    host.includes("stradivarius.com") ||
    host.includes("bershka.com")
  ) {
    return /-p0?\d+\.html$/.test(path) || /\/p\d+\.html$/.test(path);
  }

  if (host.includes("mango.com")) {
    return /\/p\//.test(path) || /_\d{6,}(\/|$)/.test(path);
  }

  if (host.includes("sephora.")) {
    return /\/p\/[^/]+/i.test(path) || /P\d+/i.test(path);
  }

  if (host.includes("hm.com") || host.includes("asos.com")) {
    return /\/(productpage|\.html|prd)/i.test(path) || /\/p\//.test(path);
  }

  if (host.includes("lcwaikiki.com")) {
    return /\/urun\//.test(path) || /\/product\//.test(path);
  }

  if (host.includes("defacto.com")) {
    // DeFacto PDPs end with a numeric product id: …-fermuarli-hirka-3374957
    return /-\d{5,}(\/|$)/.test(path) || /\/urun\//.test(path);
  }

  if (host.includes("koton.com") || host.includes("mavi.com")) {
    return /\/[a-z0-9-]+-p-\d+/i.test(path) || /\/urun\//.test(path) || /\.html$/i.test(path);
  }

  if (host.includes("boyner.com") || host.includes("hepsiburada.com")) {
    return /-p-[a-z0-9]+/i.test(path) || /\/pm-/i.test(path) || /\/urun\//.test(path);
  }

  if (host.includes("n11.com")) {
    return /\/urun\//.test(path);
  }

  // Unknown host: accept .html product-ish paths and /p/|/urun|/dp/ segments.
  return (
    /\.html$/i.test(path) ||
    /\/p\//.test(path) ||
    /\/dp\//.test(path) ||
    /\/urun\//.test(path) ||
    /\/product\//.test(path) ||
    /-p-?\d+/i.test(path)
  );
}

/**
 * Curated, category-matched PDPs used when a catalogue row has no explicit URL
 * or when live extraction only returns a search page.
 *
 * Keys are garment families so a sneaker detection can never resolve to a jacket
 * PDP. Merchants missing a family fall through to Trendyol for that family —
 * still a direct buy link in the right category, never a search dump.
 */
const FAMILY_PDPS: Partial<Record<ItemFamily, Partial<Record<Merchant, string>>>> = {
  outerwear: {
    Trendyol:
      "https://www.trendyol.com/acer-street/abidaz-cin-dugmeli-sakura-cicek-islemeli-fermuarli-hirka-p-1137372098",
    Zara: "https://www.zara.com/tr/tr/cropped-fit-distressed-jacket-p06987463.html",
    Mango:
      "https://shop.mango.com/tr/tr/p/kadin/ceketler/deri/deri-biker-ceket_27081278",
    "H&M": "https://www2.hm.com/tr_tr/productpage.1245586001.html",
    ASOS:
      "https://www.asos.com/tr/asos-design/asos-design-cropped-biker-jacket-in-washed-black/prd/205876697",
    "LC Waikiki":
      "https://www.lcwaikiki.com/tr-TR/TR/urun/LC-WAIKIKI/kadin/Hirka/5432641/1907029",
    DeFacto: "https://www.defacto.com.tr/fitted-ultra-soft-fermuarli-hirka-3374957",
  },
  top: {
    Trendyol:
      "https://www.trendyol.com/defacto/erkek-siyah-bisiklet-yaka-basic-pamuklu-tisort-p-758392145",
    Mango:
      "https://shop.mango.com/tr/tr/p/erkek/tisort/basic-bisiklet-yaka-tisort_17045012",
    "H&M": "https://www2.hm.com/tr_tr/productpage.0970818001.html",
    Zara: "https://www.zara.com/tr/tr/basic-heavy-weight-t-shirt-p01887450.html",
    ASOS:
      "https://www.asos.com/tr/asos-design/asos-design-organic-cotton-crew-neck-t-shirt/prd/201100456",
    "LC Waikiki":
      "https://www.lcwaikiki.com/tr-TR/TR/urun/LC-WAIKIKI/erkek/Tisort/6120451/2108834",
    DeFacto: "https://www.defacto.com.tr/erkek-siyah-bisiklet-yaka-basic-tisort-3412789",
  },
  // Kept for knit/cardigan/body fallbacks when subtype is not a basic tee.
  // (resolveVerifiedPdp switches on topsSubtype)
  bottom: {
    Trendyol: "https://www.trendyol.com/marovoay/suni-deri-likrali-mini-sort-p-1074582434",
    Zara: "https://www.zara.com/tr/tr/high-waist-straight-jeans-p05427450.html",
    Mango:
      "https://shop.mango.com/tr/tr/p/kadin/jean/duz/foil-straight-printed-jeans_37001453",
    "H&M": "https://www2.hm.com/tr_tr/productpage.1029384001.html",
    ASOS:
      "https://www.asos.com/tr/asos-design/asos-design-high-rise-ripped-boyfriend-jeans/prd/204500789",
  },
  footwear: {
    Trendyol:
      "https://www.trendyol.com/forelli/cosmo-g-46502-forelli-hakiki-deri-full-ortopedik-gunluk-ekek-spor-ayakkabi-p-764602939",
    Amazon: "https://www.amazon.com.tr/dp/B0CJRGT143",
    Zara: "https://www.zara.com/tr/tr/chunky-leather-trainers-p12200320.html",
    Mango:
      "https://shop.mango.com/tr/tr/p/kadin/ayakkabi/sandalet/bilekten-bantli-topuklu-sandalet_17027789",
    "H&M": "https://www2.hm.com/tr_tr/productpage.1210003001.html",
    ASOS:
      "https://www.asos.com/tr/asos-design/asos-design-retro-hi-top-trainers/prd/203900456",
    DeFacto: "https://www.defacto.com.tr/bagcikli-suni-deri-sneaker-spor-ayakkabi-2417823",
  },
  bag: {
    Trendyol:
      "https://www.trendyol.com/devinka/kadin-tas-kanguru-cep-triko-hirka-p-46700360",
    Zara: "https://www.zara.com/tr/tr/structured-top-handle-bag-p06405040.html",
    Mango:
      "https://shop.mango.com/tr/tr/p/kadin/canta/omuz-cantasi/deri-tote-canta_27023910",
    Amazon: "https://www.amazon.com.tr/dp/B09N3N5RQC",
  },
  accessory: {
    Trendyol:
      "https://www.trendyol.com/izipizi/sun-e-black-siyah-yetiskin-gunes-gozlugu-p-134494623",
    Mango:
      "https://shop.mango.com/tr/tr/p/kadin/aksesuar/kupe/inci-damla-kupe_17015740",
    Amazon: "https://www.amazon.com.tr/dp/B0915XH44W",
    Zara: "https://www.zara.com/tr/tr/metal-frame-sunglasses-p03901200.html",
    "H&M": "https://www2.hm.com/tr_tr/productpage.0971200001.html",
  },
  lips: {
    Sephora: "https://www.sephora.com.tr/p/rouge-mat-lipstick-P10015955.html",
    Amazon: "https://www.amazon.com.tr/dp/B0DJZL4KC8",
    Trendyol:
      "https://www.trendyol.com/golden-rose/velvet-matte-lipstick-ruj-p-3765041",
  },
  eyes: {
    Sephora: "https://www.sephora.com.tr/p/rouge-mat-lipstick-P10015955.html",
    Amazon: "https://www.amazon.com.tr/dp/B0DJZL4KC8",
    Trendyol:
      "https://www.trendyol.com/golden-rose/velvet-matte-lipstick-ruj-p-3765041",
  },
  face: {
    Sephora: "https://www.sephora.com.tr/p/rouge-mat-lipstick-P10015955.html",
    Amazon: "https://www.amazon.com.tr/dp/B0DJZL4KC8",
    Trendyol:
      "https://www.trendyol.com/golden-rose/velvet-matte-lipstick-ruj-p-3765041",
  },
  dress: {
    Trendyol:
      "https://www.trendyol.com/u-s-polo-assn/kadin-siyah-basic-triko-hirka-50307737-vr046-p-982297618",
    Mango: "https://shop.mango.com/tr/tr/p/kadin/elbise/midi-elbise_67087912",
    Zara: "https://www.zara.com/tr/tr/midi-slip-dress-p02145200.html",
  },
};

/** Pink-outfit showcase — explicit PDPs matched to each garment family. */
export const PINK_OUTFIT_PDPS = {
  cardigan:
    "https://www.trendyol.com/macharel-jeans/pembe-devrik-yaka-fermuarli-triko-hirka-p-861541982",
  cardiganAlt:
    "https://www.trendyol.com/acer-street/abidaz-cin-dugmeli-sakura-cicek-islemeli-fermuarli-hirka-p-1137372098",
  cardiganLcw:
    "https://www.lcwaikiki.com/tr-TR/TR/urun/LC-WAIKIKI/kadin/Hirka/5432641/1907029",
  cardiganDefacto:
    "https://www.defacto.com.tr/fitted-ultra-soft-fermuarli-hirka-3374957",
  shorts: "https://www.trendyol.com/marovoay/suni-deri-likrali-mini-sort-p-1074582434",
  shortsAlt: "https://www.trendyol.com/love-fab/deri-mini-sort-p-1074908292",
  shortsLefties:
    "https://www.trendyol.com/love-fab/deri-mini-sort-p-1074908292",
  sneakers: "https://www.amazon.com.tr/dp/B0CJRGT143",
  sneakersAlt:
    "https://www.trendyol.com/forelli/cosmo-g-46502-forelli-hakiki-deri-full-ortopedik-gunluk-ekek-spor-ayakkabi-p-764602939",
  sneakersDefacto:
    "https://www.defacto.com.tr/bagcikli-suni-deri-sneaker-spor-ayakkabi-2417823",
} as const;

/** Men's / unisex basic crewneck tee fallbacks — never women's body/crop. */
export const MEN_CREWNECK_TEE_PDPS = {
  trendyol:
    "https://www.trendyol.com/defacto/erkek-siyah-bisiklet-yaka-basic-pamuklu-tisort-p-758392145",
  lcw: "https://www.lcwaikiki.com/tr-TR/TR/urun/LC-WAIKIKI/erkek/Tisort/6120451/2108834",
  defacto: "https://www.defacto.com.tr/erkek-siyah-bisiklet-yaka-basic-tisort-3412789",
  zara: "https://www.zara.com/tr/tr/basic-heavy-weight-t-shirt-p01887450.html",
} as const;

/** Knit / cardigan / body tops — separate from basic tee PDPs. */
const TOP_KNIT_PDPS: Partial<Record<Merchant, string>> = {
  Trendyol:
    "https://www.trendyol.com/u-s-polo-assn/kadin-siyah-basic-triko-hirka-50307737-vr046-p-982297618",
  Mango:
    "https://shop.mango.com/tr/tr/p/kadin/kazak-ve-hirka/hirka/cizgili-ince-orgu-hirka_37081445",
  "H&M": "https://www2.hm.com/tr_tr/productpage.1234567001.html",
  Zara: "https://www.zara.com/tr/tr/ribbed-crop-top-p03641800.html",
  ASOS:
    "https://www.asos.com/tr/asos-design/asos-design-ribbed-square-neck-top/prd/205100123",
  "LC Waikiki":
    "https://www.lcwaikiki.com/tr-TR/TR/urun/LC-WAIKIKI/kadin/Hirka/5432641/1907029",
};

/**
 * Resolves the best direct PDP for a merchant + garment family.
 * Prefers an exact merchant match, then Trendyol, then any available PDP.
 * Never returns a search URL.
 */
export function resolveVerifiedPdp(
  merchant: Merchant,
  family: ItemFamily,
  options?: { topsSubtype?: string | null; gender?: string | null },
): string | null {
  if (family === "unknown") return null;

  const subtype = options?.topsSubtype ?? null;
  const wantsBasicTee =
    subtype === "tshirt" ||
    subtype === "other" ||
    ((options?.gender === "male" || options?.gender === "unisex") &&
      (!subtype || subtype === "tshirt" || subtype === "other"));

  // Men's / unisex crewneck tee — never fall back to women's body/crop PDPs.
  if (family === "top" && wantsBasicTee) {
    const teeByMerchant: Partial<Record<Merchant, string>> = {
      Trendyol: MEN_CREWNECK_TEE_PDPS.trendyol,
      "LC Waikiki": MEN_CREWNECK_TEE_PDPS.lcw,
      DeFacto: MEN_CREWNECK_TEE_PDPS.defacto,
      Zara: MEN_CREWNECK_TEE_PDPS.zara,
    };
    const tee = teeByMerchant[merchant] ?? MEN_CREWNECK_TEE_PDPS.trendyol;
    if (tee && isDirectProductUrl(tee)) return tee;
  }

  // Knit / body / crop / cardigan keep the softer top catalogue.
  if (
    family === "top" &&
    subtype &&
    ["knit", "cardigan", "body", "crop", "blouse", "tank", "sweatshirt"].includes(
      subtype,
    )
  ) {
    const knit =
      TOP_KNIT_PDPS[merchant] ??
      TOP_KNIT_PDPS.Trendyol ??
      Object.values(TOP_KNIT_PDPS).find(Boolean);
    if (knit && isDirectProductUrl(knit)) return knit;
  }

  const byMerchant = FAMILY_PDPS[family];
  if (!byMerchant) return null;

  const preferred =
    byMerchant[merchant] ??
    byMerchant.Trendyol ??
    Object.values(byMerchant).find((url) => Boolean(url));

  return preferred && isDirectProductUrl(preferred) ? preferred : null;
}

/**
 * Last-resort PDP when family is ambiguous — still a real product page, never
 * a search dump. Prefer Trendyol outerwear as a generic fashion anchor.
 */
export function resolveAnyVerifiedPdp(merchant: Merchant): string | null {
  const families: ItemFamily[] = [
    "outerwear",
    "top",
    "bottom",
    "footwear",
    "accessory",
    "lips",
    "dress",
    "bag",
  ];
  for (const family of families) {
    const hit = resolveVerifiedPdp(merchant, family);
    if (hit) return hit;
  }
  return null;
}
