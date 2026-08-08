/**
 * Ürün sayfasının kendi işaretlemesinden ürün verisi çıkarır.
 *
 * ## Neden
 *
 * Bugün ürün kartları `web.extract` ile geliyor: sayfa indiriliyor ve bir modele
 * okutuluyor. Bu, boru hattındaki en pahalı ve tek satıcıya bağlı adım — ve kredi
 * bittiğinde ürün araması tamamen duruyor.
 *
 * Oysa mağazaların ezici çoğunluğu ürün sayfasına **schema.org işaretlemesi**
 * koyuyor: fiyat, para birimi, stok, marka, puan, hepsi `application/ld+json`
 * bloğunda yazılı. Bunu koymalarının sebebi de tam olarak okunmak istemeleri —
 * Google alışveriş sonuçları bu veriyle besleniyor.
 *
 * ## Neden modelden daha güvenilir
 *
 * `factCheck: true` bir modelin sayfada olmayan bir fiyatı uydurmasını
 * engelliyordu. Buradaki veri ise **mağazanın kendi beyanı** — çıkarım yok, yani
 * uydurma ihtimali de yok. Bir modelin sayfayı doğru okuduğuna güvenmek yerine
 * mağazanın ne yazdığını okuyoruz.
 *
 * ## Neyi çözmüyor
 *
 * Sayfayı **indirebilmeyi**. Bazı mağazalar sunucu taraflı isteklere bot duvarı
 * çıkarıyor (bu depoda `fetch:images` ve `check:links` tam da bu yüzden 403
 * alıyor). İşaretleme okumak o sorunu çözmüyor, yalnızca sayfayı alabildiğimizde
 * modele ihtiyaç bırakmıyor.
 *
 * Bu dosya saf: ağ yok, `server-only` yok. Girdi HTML, çıktı veri — ve tam da bu
 * yüzden `eval/productMarkupCases.ts` ile gerçek işaretleme şekillerine karşı
 * puanlanabiliyor.
 */

export interface MarkupProduct {
  title: string;
  /** Sayı olarak fiyat; sayfada okunabilir bir fiyat yoksa `null`. */
  price: number | null;
  /** ISO 4217, sayfada yazılıysa. */
  currency: string | null;
  imageUrl: string | null;
  /** Sayfa aksini söylemiyorsa stokta sayılıyor. */
  inStock: boolean;
  brand: string | null;
  rating: number | null;
  reviewCount: number | null;
}

/* -------------------------------------------------------------------------- */
/*  Değer okuyucular                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Fiyat metnini sayıya çevirir — Türkçe ve İngilizce biçimlerin ikisinden de.
 *
 * `1.299,90` ile `1,299.90` aynı sayı ve ikisi de sahada var: JSON-LD çoğunlukla
 * nokta ondalıklı düz bir sayı yazıyor ama Türk mağazalarında virgüllü hâline de
 * rastlanıyor. Ayrım **son ayırıcıya** bakılarak yapılıyor: hangisi sonda ise
 * ondalık odur. Tek ayırıcı varsa ve arkasında üç hane varsa binlik sayılıyor —
 * `1.299` bin iki yüz doksan dokuz, `12.99` on iki doksan dokuz.
 */
export function toPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned;
  } else if (lastComma > lastDot) {
    // Virgül ondalık: binlik noktaları at.
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalised = cleaned.replace(/,/g, "");
  } else {
    normalised = cleaned;
  }

  // Tek ayırıcı + tam üç hane = binlik, ondalık değil: «1.299» → 1299.
  const single = /^(\d+)[.,](\d{3})$/.exec(cleaned);
  if (single) normalised = `${single[1]}${single[2]}`;

  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** `"5"`, `5`, `"4,8"` → sayı; ölçek dışıysa `null`. */
function toRating(value: unknown): number | null {
  const parsed = toPrice(value);
  if (parsed === null) return null;
  return parsed > 0 && parsed <= 5 ? parsed : null;
}

function toCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    const bag = value as Record<string, unknown>;
    // `{ "@type": "ImageObject", "url": … }` ve `{ "name": … }` ikisi de yaygın.
    return firstString(bag.url) ?? firstString(bag.name) ?? null;
  }
  return null;
}

/** Göreli adresi sayfaya göre çözer; çözülemezse atar. */
function absolute(url: string | null, pageUrl: string): string | null {
  if (!url) return null;
  try {
    const resolved = new URL(url, pageUrl);
    // Karışık içerik: https bir sayfada http görsel tarayıcıda engellenir.
    return resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  JSON-LD                                                                   */
/* -------------------------------------------------------------------------- */

/** Sayfadaki bütün `ld+json` bloklarını düz bir nesne listesine açar. */
function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  // `matchAll` yerine döngü: hedef ES sürümü iterator'ü doğrudan gezmiyor.
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    let parsed: unknown;
    try {
      // Bazı mağazalar bloğu CDATA'ya sarıyor.
      parsed = JSON.parse(match[1]!.replace(/^\s*\/\/<!\[CDATA\[|\]\]>\s*$/g, "").trim());
    } catch {
      continue;
    }

    /*
     * Üç şekil de sahada: tek nesne, dizi, ve `@graph` sarmalayıcısı. Hepsi
     * düzleştiriliyor, çünkü hangisinin geldiği mağazadan mağazaya değişiyor ve
     * biri desteklenmezse o mağaza sessizce çıkarılamaz olur.
     */
    const stack: unknown[] = [parsed];
    while (stack.length > 0) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        stack.push(...node);
      } else if (typeof node === "object" && node !== null) {
        const bag = node as Record<string, unknown>;
        if (Array.isArray(bag["@graph"])) stack.push(...bag["@graph"]);
        nodes.push(bag);
      }
    }
  }

  return nodes;
}

function isProduct(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => typeof entry === "string" && /^product$/i.test(entry.trim()));
}

/** `offers` tek nesne, dizi ya da `AggregateOffer` olabiliyor. */
function readOffer(offers: unknown): { price: number | null; currency: string | null; inStock: boolean | null } {
  const candidates: Record<string, unknown>[] = [];
  const stack: unknown[] = [offers];

  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) stack.push(...node);
    else if (typeof node === "object" && node !== null) {
      const bag = node as Record<string, unknown>;
      candidates.push(bag);
      if (bag.offers) stack.push(bag.offers);
    }
  }

  for (const offer of candidates) {
    const price =
      toPrice(offer.price) ??
      toPrice(offer.lowPrice) ??
      toPrice((offer.priceSpecification as Record<string, unknown> | undefined)?.price);
    if (price === null) continue;

    const availability = firstString(offer.availability);
    return {
      price,
      currency: firstString(offer.priceCurrency)?.toUpperCase() ?? null,
      // Sayfa açıkça «yok» demiyorsa var sayılıyor; belirsizliği tükendi diye
      // göstermek, satılan bir ürünü gizlemek olur.
      inStock: availability === null ? null : !/OutOfStock|SoldOut|Discontinued/i.test(availability),
    };
  }

  return { price: null, currency: null, inStock: null };
}

/* -------------------------------------------------------------------------- */
/*  Open Graph geri düşüşü                                                    */
/* -------------------------------------------------------------------------- */

function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i",
  );
  return (pattern.exec(html)?.[1] ?? reversed.exec(html)?.[1] ?? null)?.trim() || null;
}

/* -------------------------------------------------------------------------- */
/*  Giriş noktası                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sayfadan ürün verisi çıkarır; çıkaramazsa `null`.
 *
 * Önce JSON-LD, sonra Open Graph. Sıra kasıtlı: JSON-LD yapılandırılmış ve
 * eksiksiz, OG ise başlık ve görselden ibaret — fiyatı `product:price:amount`
 * ile veren mağazalar var ama azınlık.
 *
 * Başlıksız ya da fiyatsız bir sonuç döndürülmüyor: ikisi olmadan kart
 * çizilemiyor ve yarım bir kart, kart olmamasından kötü.
 */
export function extractProductMarkup(html: string, pageUrl: string): MarkupProduct | null {
  const product = jsonLdNodes(html).find(isProduct);

  if (product) {
    const offer = readOffer(product.offers);
    const rating = product.aggregateRating as Record<string, unknown> | undefined;
    const title = firstString(product.name);

    if (title && offer.price !== null) {
      return {
        title,
        price: offer.price,
        currency: offer.currency,
        imageUrl: absolute(firstString(product.image), pageUrl),
        inStock: offer.inStock ?? true,
        brand: firstString(product.brand),
        rating: toRating(rating?.ratingValue),
        // Puan yoksa adet de yok — ölçeksiz bir sayı okuyucuya hiçbir şey söylemez.
        reviewCount:
          toRating(rating?.ratingValue) === null
            ? null
            : toCount(rating?.reviewCount ?? rating?.ratingCount),
      };
    }
  }

  // JSON-LD yok ya da eksik: Open Graph'ta ne varsa.
  const title = metaContent(html, "og:title");
  const price = toPrice(metaContent(html, "product:price:amount"));
  if (!title || price === null) return null;

  const availability = metaContent(html, "product:availability");
  return {
    title,
    price,
    currency: metaContent(html, "product:price:currency")?.toUpperCase() ?? null,
    imageUrl: absolute(metaContent(html, "og:image"), pageUrl),
    inStock: availability === null ? true : !/out.?of.?stock|oos/i.test(availability),
    brand: metaContent(html, "product:brand"),
    rating: null,
    reviewCount: null,
  };
}
