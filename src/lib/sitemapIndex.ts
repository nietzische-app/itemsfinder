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

    if (has("product", "urun", "ürün")) return 0;
    if (has("item", "sku", "detail")) return 1;
    if (has("categor", "kategori", "blog", "store", "magaza", "mağaza", "page", "sayfa", "brand", "marka")) {
      return 3;
    }
    return 2;
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
