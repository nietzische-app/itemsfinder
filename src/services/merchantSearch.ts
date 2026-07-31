import type { Merchant } from "@/types";

/**
 * Retailer branding helpers.
 *
 * This module used to build storefront *search* URLs as the catalogue's link
 * fallback. Those are banned now — a product CTA goes to a product detail page
 * or nowhere (`src/lib/productUrl.ts`) — so the builders are gone rather than
 * left behind a flag someone could flip back on by accident. Product links come
 * from `src/data/verifiedProductUrls.ts` in demo mode and from Context.dev
 * extraction in live mode, both gated by `isDirectProductUrl`.
 *
 * Merchant *domains* still matter for affiliate tagging and brand lookups, so
 * they stay here alongside the colours.
 */

/** Canonical storefront host per merchant, used for domain-based lookups. */
const MERCHANT_HOSTS: Record<Merchant, string> = {
  Trendyol: "trendyol.com",
  Amazon: "amazon.com.tr",
  Zara: "zara.com",
  Sephora: "sephora.com.tr",
  Mango: "shop.mango.com",
  "H&M": "www2.hm.com",
  ASOS: "asos.com",
  Other: "",
};

export function merchantHost(merchant: Merchant): string {
  return MERCHANT_HOSTS[merchant];
}

/** Ortaklık programımız olan alan adları. */
const DOMAIN_TO_MERCHANT: Array<[RegExp, Merchant]> = [
  [/(^|\.)zara\.com$/, "Zara"],
  [/(^|\.)trendyol\.com$/, "Trendyol"],
  [/(^|\.)mango\.com$/, "Mango"],
  [/(^|\.)sephora\.com(\.tr)?$/, "Sephora"],
  [/(^|\.)amazon\./, "Amazon"],
  [/(^|\.)hm\.com$/, "H&M"],
  [/(^|\.)asos\.com$/, "ASOS"],
];

/**
 * Bir alan adının hangi mağazaya ait olduğu; tanınmayanlar `Other`.
 *
 * `productProvider` içindeydi ve yalnızca canlı yol kullanıyordu. Demo kataloğun
 * da buna ihtiyacı çıktı: katalog satırındaki mağaza adı elle yazılmış bir değer
 * ve doğrulanmış bağlantı başka bir mağazaya gidebiliyor. Rozeti bağlantıya
 * uydurmanın tek doğru yolu adı adresten türetmek.
 */
export function merchantForDomain(domain: string): Merchant {
  const host = domain.replace(/^www\./, "");
  for (const [pattern, merchant] of DOMAIN_TO_MERCHANT) {
    if (pattern.test(host)) return merchant;
  }
  return "Other";
}

/**
 * Rozette yazacak mağaza adı.
 *
 * Tanınan mağazalarda kendi adı. Tanınmayanlarda **alan adının kendisi** —
 * uydurulmuş bir marka adı değil, bağlantının gerçekten açtığı yer. Bir butiğin
 * adını tahmin etmek, kullanıcıya doğrulayamayacağı bir şey söylemek olur;
 * "neselibutik.com" ise tıkladığında göreceği şeyin aynısı.
 */
export function merchantLabel(merchant: Merchant, domain: string): string {
  if (merchant !== "Other") return merchant;
  /*
   * Uzantı atılıyor: rozet dar ve `pullandbear.com` kırpılıp «PULLANDBEAR…»
   * oluyordu. `pullandbear` hem sığıyor hem de aynı şeyi söylüyor — uydurulmuş
   * bir marka adı değil, bağlantının gittiği sitenin adı.
   */
  const host = domain.replace(/^www\./, "");
  if (!host) return "Mağaza";
  return host.replace(/\.(com|net|org|co)(\.[a-z]{2})?$/i, "") || host;
}

/**
 * Brand colours for the store badge, so a retailer is recognisable even when
 * the Brand API has not supplied a logo (mock mode, or a live lookup miss).
 * These are the retailers' own well-known brand colours.
 */
const MERCHANT_COLORS: Record<Merchant, string> = {
  Trendyol: "#f27a1a",
  Amazon: "#ff9900",
  Zara: "#000000",
  Sephora: "#000000",
  Mango: "#000000",
  "H&M": "#e50010",
  ASOS: "#2d2d2d",
  Other: "#757575",
};

export function merchantColor(merchant: Merchant): string {
  return MERCHANT_COLORS[merchant];
}

/**
 * Readable text colour for the badge, given the retailer's own brand colour.
 *
 * The badge was white-on-brand everywhere, which is fine on Zara black and fails
 * on Trendyol orange — 2.77:1, well under the 4.5:1 the first accessibility audit
 * measured it against. The brand colours are the retailers' and are not ours to
 * change, so the foreground moves instead.
 *
 * Computed rather than tabulated: a new retailer added to `MERCHANT_COLORS` gets a
 * readable badge without anyone remembering to pick one.
 */
export function merchantTextColor(merchant: Merchant): string {
  const hex = MERCHANT_COLORS[merchant].replace("#", "");
  const channels = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  // Contrast against white vs against near-black; whichever is higher wins.
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / (0.0069 + 0.05);
  return againstWhite >= againstBlack ? "#ffffff" : "#111111";
}

/** Short badge text — the first letters of the merchant name. */
export function merchantInitials(merchant: Merchant, domain?: string): string {
  if (merchant === "H&M") return "H&M";
  /*
   * Tanınmayan mağazada "OT" ("Other") yazıyordu — hiçbir şey ifade etmeyen ve
   * yanlış okunması kolay bir kısaltma. Alan adının ilk iki harfi hiç olmazsa
   * gidilecek yeri gösteriyor.
   */
  if (merchant === "Other" && domain) {
    const host = domain.replace(/^www\./, "");
    if (host) return host.slice(0, 2).toLocaleUpperCase("tr");
  }
  return merchant.slice(0, 2).toLocaleUpperCase("tr");
}
