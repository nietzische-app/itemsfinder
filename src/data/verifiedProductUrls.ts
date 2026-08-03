/**
 * Verified product detail page (PDP) URLs for the demo catalogue.
 *
 * Keyed by the product id in `src/services/mockCatalog.ts`. A product with no
 * entry here renders **without a CTA** — that is the intended behaviour, not a
 * gap to paper over. Storefront search links are banned (`src/lib/productUrl.ts`),
 * so "no verified link" beats "a link to a results page".
 *
 * ## Durum: 14 vitrin bağlantısı dolu, geri kalanı boş
 *
 * Dört vitrin kombininin birebir eşleşmeleri sahibi tarafından tek tek verildi ve
 * dolduruldu; muadil (`-alt-N`) satırlarının çoğu hâlâ boş ve o satırlar CTA'sız
 * çiziliyor. Aşağıdaki gerekçe değişmedi ve boş kalan her satır için geçerli.
 *
 * ## Neden uydurulamaz
 *
 * These have to be real, live URLs, and they cannot be generated. A PDP path
 * encodes a retailer's internal SKU (`-p-123456789`, `/dp/B0XXXXXXXX`,
 * `-p04387042.html`); there is no way to derive one, and an invented id is a
 * guaranteed 404 — the catalogue previously shipped fabricated PDP paths and
 * every single one of them broke, which is what search URLs were introduced to
 * fix. Verifying a link means fetching it, which this environment cannot do:
 * there is no network route to any retailer.
 *
 * ## How to fill it
 *
 * 1. Open the store, find the product, copy the address bar URL.
 * 2. Strip tracking parameters (`?boutiqueId=`, `?utm_*`, `&merchantId=`) — the
 *    affiliate builder adds its own, and stale tracking ids can redirect.
 * 3. Paste it against the product id below.
 *
 * Every value is validated on import: anything that is not PDP-shaped, or that
 * looks like a search/listing URL, throws at startup rather than shipping a bad
 * link. `npm run typecheck` will not catch a wrong-but-well-shaped URL — only a
 * human opening it can confirm the product is the right one and still in stock.
 *
 * `npm run check:pdp` hâlâ eksik olan her id'yi mağazaya göre gruplayarak yazıyor,
 * `npm run check:links` de dolu olanların bugün hâlâ açılıp açılmadığını — ikisi de
 * ağ erişimi olan bir makinede çalışıyor, bu ortamda değil.
 */
import { isDirectProductUrl, isSearchUrl } from "@/lib/productUrl";

/**
 * productId -> live PDP URL.
 *
 * Example of the expected shape (commented out because it is illustrative, not
 * a verified link):
 *
 *   "po-cardigan-exact": "https://www.trendyol.com/markafoni/fermuarli-triko-hirka-p-987654321",
 *   "po-shorts-exact":   "https://www.zara.com/tr/tr/deri-gorunumlu-sort-p04387042.html",
 *   "po-sneakers-exact": "https://www.amazon.com.tr/dp/B08N5WRWNW",
 */
export const VERIFIED_PDP_URLS: Readonly<Record<string, string>> = {
  /*
   * Sahibi tarafından `utm_term=showcase-shoes` etiketiyle verildi — yani bu
   * eşleşme onun beyanı, benim çıkarımım değil. Bu ortamdan hiçbir mağazaya ağ
   * yolu olmadığı için sayfayı açıp içindeki ürünün gerçekten siyah-beyaz bilekli
   * bir sneaker olduğunu doğrulayamadım; dosyanın başındaki not da zaten bunun
   * ancak sayfayı açan bir insan tarafından doğrulanabileceğini söylüyor.
   *
   * Takip parametreleri atıldı (`utm_*`, `tag`, `linkCode`): ortaklık etiketini
   * `buildAffiliateUrl` kendisi ekliyor, ve burada saklanan eski bir etiket onun
   * ekleyeceğiyle çakışır. Varyant seçicileri (`th`, `psc`) de atıldı — hangi
   * varyantın kastedildiği bilinmiyor, `/dp/<ASIN>` ise ürünün kanonik sayfası.
   */
  "po-sneakers-exact": "https://www.amazon.com.tr/dp/B0CJRGT916",

  /*
   * Vitrin kombinlerinin kalan on üç ürünü. Hepsi sahibi tarafından bulundu ve
   * bu ortamdan hiçbir mağazaya ağ yolu olmadığı için sayfaları açıp
   * doğrulayamadım — dosyanın başındaki not zaten bunun ancak sayfayı açan bir
   * insan tarafından yapılabileceğini söylüyor. Ürün adları ile katalog
   * başlıklarının örtüştüğünü kontrol ettim, gördüğüm tek fark
   * `bb-blazer-exact`'te ve o da aşağıda yazılı.
   *
   * Takip parametreleri atıldı: `srsltid` (Google alışveriş yönlendirmesi),
   * `boutiqueId`, `merchantId`, `storefrontId`, `countryCode`, `language`,
   * `gads`, `pelement`, `cS`, `currency`. Bunlar bayatladığında yönlendirme
   * yapabiliyor, ve ortaklık etiketini `buildAffiliateUrl` kendisi ekliyor.
   *
   * İşlevsel olanlar bilerek duruyor: `vid` ve `variant` ürünün kendisini ya da
   * rengini seçiyor, atılırsa yanlış sayfa veya yanlış renk açılır — Gangown'da
   * `vid` olmadan adres zaten bir ürüne çözülmüyor.
   */
  "po-cardigan-exact":
    "https://www.trendyol.com/macharel-jeans/pembe-devrik-yaka-fermuarli-triko-hirka-p-861541982",
  "po-shorts-exact": "https://www.boyner.com.tr/yuksek-bel-mini-meghan-deri-sort-siyah-p-15845369",
  "bk-jacket-exact": "https://www.pullandbear.com/tr/suni-deri-biker-ceket-l03720323",
  "bk-body-exact": "https://www.pullandbear.com/tr/ince-askili-poliamid-body-l03230388",
  "bk-jeans-exact":
    "https://www.lcw.com/yuksek-bel-super-skinny-fit-kadin-jean-pantolon-indigo-o-5239461",
  "bk-sunglasses-exact":
    "https://www.angeleyes.com.tr/angel-eyes-siyah-dikdortgen-unisex-gunes-gozlugu-6452",
  "lc-coat-exact": "https://www.paulmark.com.tr/kadin-kusakli-uzun-kaban_399424",
  "lc-beanie-exact": "https://www.trendyol.com/jimmy-key/bej-sac-orgu-desenli-bere-p-1048646418",
  "lc-jeans-exact":
    "https://gangown.com.tr/black-vandal-yirtik-detayli-boyfriend-jean-pantolon?vid=55b16e38-13b7-4605-b8b5-1c9891490482",
  "lc-sandals-exact":
    "https://derimod.com.tr/products/kadin-siyah-bilekten-bantli-kalin-topuklu-sandalet-26sfe462318-5637145339?variant=51966618075449",
  /*
   * Bu bağlantı bir **takım** — blazer + pantolon. Katalogdaki ürün yalnızca
   * blazer. Aynı giysiyi içerdiği için yazıldı, ama alışveriş yapan kişi
   * beklediğinden fazlasını içeren bir sayfaya düşecek; yalnız blazer satan bir
   * sayfa bulunursa bununla değiştirilmeli.
   */
  "bb-blazer-exact":
    "https://www.neselibutik.com/neselibutik-kadin-siyah-oversize-tek-dugmeli-blazer-ceket-pantolon-takim-nbstr4085",
  "bb-lip-exact": "https://www.sephora.com.tr/p/soft-matte-et-easy---mat-ruj-614289.html",
  "bb-heels-exact":
    "https://www.boyner.com.tr/kadin-siyah-bantli-topuklu-sandalet-01sah321140a100-p-15865262",
};

/**
 * Fails loudly at import time on a malformed entry.
 *
 * A bad product link is worse than a missing one: it costs the shopper a tap and
 * their trust. Better to break the build.
 */
for (const [productId, url] of Object.entries(VERIFIED_PDP_URLS)) {
  if (isSearchUrl(url)) {
    throw new Error(
      `verifiedProductUrls: "${productId}" is a search/listing URL, which is banned: ${url}`,
    );
  }
  if (!isDirectProductUrl(url)) {
    throw new Error(
      `verifiedProductUrls: "${productId}" is not a product detail page URL: ${url}`,
    );
  }
}

/** Verified PDP for a catalogue product, or "" when none has been supplied. */
export function verifiedPdpUrl(productId: string): string {
  return VERIFIED_PDP_URLS[productId] ?? "";
}

/* -------------------------------------------------------------------------- */
/*  Product photographs                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Real product images, keyed by the same product ids.
 *
 * Ships empty for the same reason as the URLs above: the catalogue's products are
 * authored, so there is nothing to photograph, and a retailer's image URL cannot be
 * derived any more than its SKU can. Until an entry exists, `productThumbnail`
 * draws a garment silhouette in the product's colour — not a photograph, and not
 * pretending to be one.
 *
 * **Hotlinked, not copied.** The value is the retailer's own CDN URL. That is the
 * normal arrangement for a page that links to the product it is showing; copying
 * the file into `public/` would be republishing someone else's photograph.
 *
 * A PDP's canonical image is usually its `og:image`, so this can be collected
 * mechanically once the URLs above exist:
 *
 *   npm run fetch:images
 *
 * which reads each verified PDP, pulls its `og:image`, and prints a paste-ready
 * block. It needs a network route to the retailers, so it runs on your machine
 * rather than in CI.
 */
export const VERIFIED_PDP_IMAGES: Readonly<Record<string, string>> = {};

/**
 * Validated on import, like the URLs.
 *
 * Only the shape can be checked here — that it is an https URL, and that it is not
 * obviously a page rather than an image. Whether it depicts the right garment is
 * something only a human looking at it can say.
 */
for (const [productId, url] of Object.entries(VERIFIED_PDP_IMAGES)) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (!parsed || parsed.protocol !== "https:") {
    throw new Error(
      `verifiedProductUrls: image for "${productId}" must be an https URL: ${url}`,
    );
  }
  if (/\.(html?|php|aspx?)($|[?#])/i.test(parsed.pathname)) {
    throw new Error(
      `verifiedProductUrls: image for "${productId}" points at a page, not an image: ${url}`,
    );
  }
}

/** Verified photograph for a catalogue product, or "" when none has been supplied. */
export function verifiedProductImage(productId: string): string {
  return VERIFIED_PDP_IMAGES[productId] ?? "";
}
