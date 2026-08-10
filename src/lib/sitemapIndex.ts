/**
 * `robots.txt` ve `sitemap.xml` okumanın saf kararları.
 *
 * ## Neden ikinci bir kanal
 *
 * Arama sayfası kanalı çalışıyor ama on dokuz mağazanın ikisinde
 * (`docs/BULUNAMADI.md` 4d). Kalanlar ya veri merkezi IP'sine 403 veriyor ya da
 * arama sonuçlarını sunucuda çizmiyor. Sitemap ikisini de aşabilir:
 *
 *  - Bot duvarları genelde **arama** ve ürün sayfalarına konuyor; `sitemap.xml`
 *    arama motorları için var ve engellenmesi mağazanın kendi çıkarına aykırı.
 *  - Sitemap istemci tarafı çatıyla ilgisiz: düz XML, sunucu ne veriyorsa o.
 *
 * ## Neden çalışabilir
 *
 * Ürün adreslerinin slug'ı ürünün adını taşıyor — `rankByQuery` bunu zaten
 * kullanıyor. Sitemap yüz binlerce adres verse de, eşleştirme aynı bedava
 * karşılaştırma.
 *
 * ## Ne ölçülmedi
 *
 * Her şey. Bu dosya yalnızca **kararları** taşıyor; mağazaların sitemap'i
 * gerçekten verip vermediği `scripts/check-sitemap.mjs` ile, ağı olan bir
 * ortamdan ölçülüyor. Kanal ölçülmeden üretime bağlanmayacak — bu projedeki
 * her turun dersi bu.
 */

/** `robots.txt` içindeki `Sitemap:` satırları. */
export function sitemapUrlsFromRobots(robots: string): string[] {
  const found: string[] = [];

  for (const line of robots.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (match?.[1]) found.push(match[1]);
  }

  return Array.from(new Set(found));
}

/**
 * Bir sitemap'in içindeki adresler — hem dizin hem de adres listesi için.
 *
 * `<sitemapindex>` ve `<urlset>` aynı `<loc>` etiketini kullanıyor, o yüzden
 * ayrıştırma tek: fark, dönen adreslerin başka sitemap mi yoksa sayfa mı
 * olduğu, ve onu `isSitemapIndex` söylüyor.
 */
export function locsIn(xml: string): string[] {
  const found: string[] = [];

  for (const tag of xml.match(/<loc>[\s\S]*?<\/loc>/gi) ?? []) {
    const value = tag
      .replace(/<\/?loc>/gi, "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim();
    if (value) found.push(value);
  }

  return found;
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Girdilerin kendisi sitemap mi?
 *
 * Kök etiket her zaman doğruyu söylemiyor. Üçüncü koşuda iki mağaza `<urlset>`
 * içinde **başka sitemap dosyaları** listeledi:
 *
 *   boyner  → bynsitemap/product.xml, productimage.xml, category.xml
 *   lcw     → api.lcwaikiki.com/feed/service/api/TR/TR/Products-1/xml?regionId=1
 *
 * İkisi de «12 adres → 0 ürün sayfası» diye göründü, oysa bir kademe daha
 * inilecekti. Uzantıya bakmak kök etiketten sağlam: bir sayfa `.xml` ile
 * bitmiyor.
 */
export function looksLikeSitemapList(locs: string[]): boolean {
  if (locs.length === 0) return false;

  const xmlish = locs.filter((loc) => /\.xml(\.gz)?($|\?)|\/xml($|\?)/i.test(loc)).length;
  return xmlish / locs.length >= 0.8;
}

/**
 * Ürün adresi taşıması **en olası** sitemap'ler öne alınır.
 *
 * Büyük bir mağazanın sitemap dizini onlarca dosya taşıyor: kategoriler,
 * bloglar, mağaza konumları, ve ürünler. Hepsini indirmek hem yavaş hem
 * gereksiz; adın kendisi güçlü bir ipucu (`product`, `urun`, `p-`).
 *
 * **Eleme değil sıralama.** İpucu taşımayan dosya listenin sonuna gidiyor ama
 * listede kalıyor: adlandırması tanıdık olmayan bir mağazayı tamamen elemek,
 * ölçmeden reddetmek olurdu.
 */
/**
 * Türkiye dışı dil kodları.
 *
 * Ölçümde çıktı: Trendyol için seçilen dosya `/bg/sitemap_products1.xml` idi —
 * Bulgarca. Adında «product» geçtiği için en üste çıkmıştı ve ürün sitemap'i
 * olduğu doğru; ama Türkiye'den alışveriş yapan biri için Bulgaristan mağazasının
 * ürünleri bir işe yaramıyor.
 *
 * Eleme değil, ağır ceza: yabancı bir ürün dosyası, yerli bir kategori
 * dosyasının bile arkasına düşüyor. Yine de listede kalıyor — başka hiçbir şey
 * yoksa ölçülebilsin.
 */
const FOREIGN_LOCALES = [
  "bg", "en", "de", "fr", "es", "it", "ru", "ro", "el", "ar", "az",
  "nl", "pl", "cs", "hu", "sr", "uk", "sk", "hr", "pt", "sv", "da",
];

/** Gzip sihirli baytları: `1f 8b`. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function rankProductSitemaps(urls: string[]): string[] {
  /*
   * Kelime kelime, alt dize değil.
   *
   * İlk hâli `/item|sku|detail/` diye düz bir alt dize arıyordu ve **her**
   * dosyayı eşleştirdi: «s-item-ap». Yani kategori dalı hiç çalışmadı ve sıralama
   * girdi sırasına indi — ölçüm bunu daha ilk koşuda yakaladı.
   *
   * Bu depoda aynı hata sınıfı kayıtlı: «Chair» içindeki «hair» bir sandalyeyi
   * kozmetik yapmıştı (`visualSearch.ts`). Çözüm de aynı: kelimeye bak.
   */
  const score = (url: string) => {
    const words = url.toLowerCase().split(/[^a-z0-9ğıöşüç]+/);
    const has = (...stems: string[]) =>
      words.some((word) => stems.some((stem) => word.startsWith(stem)));

    /*
     * Türkçe dosya varsa o kazanır — yasak listesiyle değil, **tercihle**.
     *
     * İlk düzeltme yabancı dil kodlarını cezalandırıyordu ve liste eksikti:
     * ikinci koşuda Zara'nın 8655 ürün sayfası açıldı ama hiçbiri sorguya uymadı,
     * çünkü seçilen dosya Türkçe değildi ve o dilin kodu listede yoktu. Dünyadaki
     * bütün dil kodlarını saymak yerine, aradığımızı söylemek daha sağlam:
     * `tr` taşıyan dosya öne geçiyor.
     *
     * Yasak listesi yine duruyor ama ikinci sırada: `tr` hiçbir dosyada geçmiyorsa
     * (çoğu Türk mağazasında geçmiyor, çünkü zaten tek dilliler) bilinen yabancı
     * kodlar yine aşağı itiliyor.
     */
    const turkish = words.includes("tr") ? -8 : 0;
    /*
     * Yabancı kod, `tr` yanında dursa bile ceza alıyor.
     *
     * İlk hâli `tr` görünce cezayı kapatıyordu ve üçüncü koşu bunu yakaladı:
     * Zara için seçilen dosya `sitemap-product-tr-en.xml.gz` oldu — Türkiye
     * mağazası ama **İngilizce**. 10 324 ürün sayfası açıldı ve hiçbiri sorguya
     * uymadı, çünkü slug'lar İngilizce: «limited-edition-printed-midi-dress».
     *
     * İkisi ayrı ayrı sayılınca `tr-tr` (-8), `tr-en`'in (-8+4) önüne geçiyor.
     */
    const foreign = words.some((word) => FOREIGN_LOCALES.includes(word)) ? 4 : 0;

    if (has("product", "urun", "ürün")) return 0 + foreign + turkish;
    if (has("item", "sku", "detail")) return 1 + foreign + turkish;
    /*
     * `keyword` de bir liste dosyası — üçüncü koşuda Stradivarius için
     * `sitemap/keyword.xml` seçildi ve içinden `/tr/v/100-pamuk-elbiseler` gibi
     * kategori adresleri çıktı, tek bir ürün bile yok.
     */
    if (has("categor", "kategori", "keyword", "blog", "store", "magaza", "mağaza", "page", "sayfa", "brand", "marka")) {
      return 3 + foreign + turkish;
    }
    return 2 + foreign + turkish;
  };

  return [...urls].sort((a, b) => score(a) - score(b));
}

/**
 * Yaygın sitemap adresleri — mağaza `robots.txt`'te ilan etmemişse.
 *
 * `PROBE_SHAPES` ile aynı gerekçe: bunlar mağazaya değil, standarda ait. Bir
 * adres ancak XML dönerse kullanılıyor, yani «tuttu» demek ölçülmüş bir şey.
 */
export const SITEMAP_GUESSES = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];
