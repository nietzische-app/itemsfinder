/**
 * Sitemap okumanın kararları — `node scripts/stubs/sitemap-check.mjs`
 *
 * `check-sitemap.mjs` ağ gerektiriyor ve bu depodan mağazalara çıkış kapalı.
 * Ölçülebilen şey kararlar: `robots.txt`'ten sitemap adresi çıkarma, dizin ile
 * adres listesini ayırt etme, ve ürün taşıması olası dosyayı öne alma.
 *
 * Bunlar ölçülmezse ölçümün kendisi yanlış olur ve yanlış olduğu anlaşılmaz:
 * `robots.txt` okuyamayan bir betik her mağaza için «sitemap bulunamadı» yazar,
 * dizini adres listesi sanan bir betik ise sıfır ürün bulur. İkisi de sessizce
 * «bu kanal yürümüyor» sonucuna götürür — ölçülmemiş bir ret.
 */
import { register } from "node:module";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const {
  sitemapUrlsFromRobots,
  locsIn,
  isSitemapIndex,
  looksLikeSitemapList,
  isGzip,
  rankProductSitemaps,
  isTurkishStorefrontPath,
  SITEMAP_GUESSES,
} = await import("@/lib/sitemapIndex");
const { gzipSync } = await import("node:zlib");

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/* 1) `robots.txt` — büyük/küçük harf, boşluk ve tekrar. */
{
  const robots = `User-agent: *
Disallow: /sepet

Sitemap: https://www.magaza.com/sitemap.xml
SITEMAP:   https://www.magaza.com/sitemap-urun.xml
sitemap: https://www.magaza.com/sitemap.xml
`;
  const found = sitemapUrlsFromRobots(robots);

  t(found.length === 2, `iki ayrı sitemap (${found.length}): ${JSON.stringify(found)}`);
  t(found.includes("https://www.magaza.com/sitemap-urun.xml"), "büyük harfli anahtar da okunuyor");
  t(new Set(found).size === found.length, "tekrar eden adres iki kez sayılmıyor");
  t(sitemapUrlsFromRobots("User-agent: *\nDisallow:").length === 0, "ilan yoksa boş");

  /*
   * `Disallow: /sitemap` gibi bir satır sitemap ilanı değil. Satır başına
   * bakılmazsa böyle bir yol adres sanılırdı.
   */
  t(
    sitemapUrlsFromRobots("Disallow: /sitemaps/gizli").length === 0,
    "yasak yolu sitemap ilanı sayılmıyor",
  );
}

/* 2) Dizin mi, adres listesi mi? */
{
  const index = `<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://m.com/sitemap-urun-1.xml</loc></sitemap>
      <sitemap><loc>https://m.com/sitemap-kategori.xml</loc></sitemap>
    </sitemapindex>`;

  const urlset = `<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://m.com/gri-pantolon-p-1234</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc><![CDATA[https://m.com/bej-bluz-p-5678]]></loc></url>
    </urlset>`;

  t(isSitemapIndex(index), "dizin tanınıyor");
  t(!isSitemapIndex(urlset), "adres listesi dizin sayılmıyor");

  t(locsIn(index).length === 2, `dizinden iki adres (${locsIn(index).length})`);
  t(locsIn(urlset).length === 2, `listeden iki adres (${locsIn(urlset).length})`);
  /*
   * CDATA gerçek sitemap'lerde yaygın ve okunmazsa adres `<![CDATA[…` olarak
   * çıkar — sonra `new URL` patlar ve mağaza sessizce «0 ürün» görünür.
   */
  t(
    locsIn(urlset).includes("https://m.com/bej-bluz-p-5678"),
    `CDATA çözülüyor: ${JSON.stringify(locsIn(urlset))}`,
  );
  t(!locsIn(urlset).some((loc) => /lastmod|CDATA/.test(loc)), "başka etiket adrese karışmıyor");
}

/* 3) Ürün sitemap'i öne alınıyor — eleme değil sıralama. */
{
  const files = [
    "https://m.com/sitemap-kategori.xml",
    "https://m.com/sitemap-blog.xml",
    "https://m.com/sitemap-urun-1.xml",
    "https://m.com/sitemap-bilinmeyen.xml",
  ];
  const ranked = rankProductSitemaps(files);

  t(ranked[0]?.includes("urun"), `ürün dosyası başta: ${ranked[0]}`);
  t(ranked.length === files.length, "hiçbiri elenmiyor, sıra değişiyor");
  /*
   * Tanımadığımız adlandırma kategoriden ÖNCE geliyor: bir mağazayı kendi
   * adlandırmasını tanımadığımız için elemek, ölçmeden reddetmek olurdu.
   */
  t(
    ranked.indexOf("https://m.com/sitemap-bilinmeyen.xml") <
      ranked.indexOf("https://m.com/sitemap-kategori.xml"),
    `tanınmayan ad kategoriden önce: ${JSON.stringify(ranked)}`,
  );

  t(rankProductSitemaps([]).length === 0, "boş liste boş dönüyor");
  t(SITEMAP_GUESSES.length > 0 && SITEMAP_GUESSES.every((g) => g.startsWith("/")), "tahminler yol");
}

/*
 * 4) İlk gerçek koşunun bulduğu iki kusur.
 *
 * Altı mağaza «0 adres» dedi (Zara, Pull&Bear, Bershka, Stradivarius, Vakko,
 * Flo) ve Trendyol için **Bulgarca** sitemap seçildi. İkisi de ölçümün
 * kendisini yanlış yapıyordu: birincisi «bu mağazada sitemap yok» diyordu,
 * ikincisi doğru mağazanın yanlış ülkesini ölçüyordu.
 */
{
  // Gzip: `.xml.gz` taşıma sıkıştırması değil, gövdenin kendisi.
  const xml = '<urlset><url><loc>https://m.com/gri-pantolon-p-1234</loc></url></urlset>';
  const packed = gzipSync(Buffer.from(xml, "utf-8"));

  t(isGzip(new Uint8Array(packed)), "gzip gövde tanınıyor");
  t(!isGzip(new TextEncoder().encode(xml)), "düz XML gzip sayılmıyor");
  t(!isGzip(new Uint8Array([0x1f])), "tek bayt gzip sayılmıyor");

  /*
   * Yabancı dil dosyası ağır ceza alıyor: Trendyol'un Bulgarca ürün sitemap'i,
   * Türkçe olanın arkasına düşmeli. Adında «product» geçtiği için eskiden en
   * üste çıkıyordu.
   */
  const trendyol = rankProductSitemaps([
    "https://www.trendyol.com/bg/sitemap_products1.xml",
    "https://www.trendyol.com/sitemap_products1.xml",
  ]);
  t(!trendyol[0]?.includes("/bg/"), `yerli ürün dosyası önce: ${trendyol[0]}`);

  // Yabancı ürün dosyası, yerli kategori dosyasının bile arkasında.
  const karisik = rankProductSitemaps([
    "https://m.com/en/sitemap-products.xml",
    "https://m.com/sitemap-kategori.xml",
  ]);
  t(!karisik[0]?.includes("/en/"), `yerli kategori bile yabancı üründen önce: ${karisik[0]}`);

  /*
   * Türkçe dosya varsa o kazanır — yasak listesi eksik kalabilir, tercih kalmaz.
   *
   * İkinci koşuda Zara'nın 8655 ürün sayfası açıldı ve hiçbiri sorguya uymadı:
   * seçilen dosya Türkçe değildi ve o dilin kodu listede yoktu. Dünyadaki bütün
   * dil kodlarını saymak yerine aradığımızı söylemek daha sağlam.
   */
  const zara = rankProductSitemaps([
    "https://www.zara.com/sitemaps/sitemap-ja-jp-products.xml",
    "https://www.zara.com/sitemaps/sitemap-tr-tr-products.xml",
  ]);
  t(zara[0]?.includes("tr-tr"), `Türkçe dosya kazanıyor: ${zara[0]}`);

  // Türkçe dosya, tanınmayan bir adlandırmaya sahip olsa bile öne geçiyor.
  const karma = rankProductSitemaps([
    "https://m.com/sitemap-products.xml",
    "https://m.com/tr/sitemap-bilinmeyen.xml",
  ]);
  t(karma[0]?.includes("/tr/"), `Türkçe her şeyin önünde: ${karma[0]}`);

  // Ama eleme değil: başka hiçbir şey yoksa yabancı dosya yine ölçülebilmeli.
  t(
    rankProductSitemaps(["https://m.com/de/sitemap-products.xml"]).length === 1,
    "tek seçenek yabancıysa yine listede",
  );
}

/*
 * 5) Üçüncü koşunun bulduğu üç kusur — hepsi gerçek adreslerle.
 *
 * Teşhis satırı eklendikten sonra her sıfırın sebebi okunabilir oldu.
 */
{
  /*
   * Zara: seçilen dosya `sitemap-product-tr-en.xml.gz` idi — Türkiye mağazası
   * ama İNGİLİZCE. 10 324 ürün sayfası açıldı, hiçbiri sorguya uymadı, çünkü
   * slug'lar İngilizce: «limited-edition-printed-midi-dress».
   *
   * `tr` görünce yabancı cezasını kapatmak buna yol açıyordu. İkisi ayrı ayrı
   * sayılınca `tr-tr` öne geçiyor.
   */
  const zaraGercek = rankProductSitemaps([
    "https://www.zara.com/sitemaps/sitemap-product-tr-en.xml.gz",
    "https://www.zara.com/sitemaps/sitemap-product-tr-tr.xml.gz",
  ]);
  t(zaraGercek[0]?.includes("tr-tr"), `Türkçe dosya İngilizceyi geçiyor: ${zaraGercek[0]}`);

  /*
   * Stradivarius: `sitemap/keyword.xml` seçildi ve içinden `/tr/v/100-pamuk-
   * elbiseler` gibi kategori adresleri çıktı — 2982 adres, tek ürün yok.
   */
  const strad = rankProductSitemaps([
    "https://www.stradivarius.com/tr/v/nc/sitemap/keyword.xml",
    "https://www.stradivarius.com/tr/v/nc/sitemap/product.xml",
  ]);
  t(strad[0]?.includes("product"), `keyword dosyası ürünün arkasında: ${strad[0]}`);

  /*
   * Boyner ve LCW `<urlset>` içinde BAŞKA SİTEMAP dosyaları listeledi. Kök
   * etikete bakan kural bir kademe daha inmedi ve ikisi de «0 ürün sayfası»
   * göründü.
   */
  t(
    looksLikeSitemapList([
      "https://sitemap.boyner.com.tr/bynsitemap/product.xml",
      "https://sitemap.boyner.com.tr/bynsitemap/productimage.xml",
      "https://sitemap.boyner.com.tr/bynsitemap/category.xml",
    ]),
    "Boyner'in dosya listesi sitemap listesi sayılıyor",
  );
  t(
    looksLikeSitemapList([
      "https://api.lcwaikiki.com/feed/service/api/TR/TR/Products-1/xml?regionId=1",
      "https://api.lcwaikiki.com/feed/service/api/TR/TR/Products-2/xml?regionId=1",
    ]),
    "LCW'nin uzantısız `/xml` uçları da sayılıyor",
  );

  /*
   * Ama gerçek ürün adresleri sitemap listesi SAYILMAMALI — sayılsaydı, dolu
   * bir dosyanın içine inilmeye çalışılır ve mağaza boş görünürdü.
   */
  t(
    !looksLikeSitemapList([
      "https://www.koton.com/jogger-pantolon-gri-3911563-1/",
      "https://www.koton.com/chino-pantolon-bej-3911564-1/",
    ]),
    "ürün adresleri sitemap listesi sayılmıyor",
  );
  t(!looksLikeSitemapList([]), "boş liste sayılmıyor");

  /*
   * Dördüncü koşu: dizin dizini işaret edebiliyor.
   *
   * Boyner'in `sitemap.xml`'i `product.xml`'e, o da `product1.xml…`e işaret
   * ediyor. Tek kademe inen kural ikinci durakta kalıyor ve mağaza «0 ürün
   * sayfası» görünüyordu — oysa ürünler bir kademe aşağıdaydı.
   */
  t(
    looksLikeSitemapList([
      "https://sitemap.boyner.com.tr/bynsitemap/product1.xml",
      "https://sitemap.boyner.com.tr/bynsitemap/product2.xml",
      "https://sitemap.boyner.com.tr/bynsitemap/product3.xml",
    ]),
    "üçüncü kademe de sitemap listesi sayılıyor",
  );

  // Trendyol için seçilen `rs` (Sırbistan) dosyası artık ceza alıyor.
  const trendyolRs = rankProductSitemaps([
    "https://www.trendyol.com/rs/sitemap_products1.xml",
    "https://www.trendyol.com/sitemap_products1.xml",
  ]);
  t(!trendyolRs[0]?.includes("/rs/"), `Sırbistan dosyası arkada: ${trendyolRs[0]}`);
}

/*
 * Yabancı vitrin dizine girmiyor.
 *
 * Dosya seçimindeki dil cezası yetmiyordu: **seçilen dosyanın içi** karışık
 * çıktı. Depoya yazılan ilk dizin ölçüldü ve 151.976 yolun 52.401'i (%34,5)
 * yabancı vitrindi — Beymen'in yarısı İngilizce kopya, Bershka'nın çoğunluğu
 * Estonya. Türkiye'den alışveriş yapan biri için `bershka.com/ee/…` yanlış dil,
 * yanlış para birimi ve çoğu zaman ulaşılamayan bir sepet.
 *
 * Aşağıdaki adresler o dizinden, uydurma değil.
 */
{
  // Türkiye vitrini — geçmeli.
  t(isTurkishStorefrontPath("/tr/tr/kadin-keten-gomlek-p12345.html"), "zara /tr/tr geçiyor");
  t(isTurkishStorefrontPath("/tr/p_04651-mavi-keten-gomlek_1968686"), "beymen /tr geçiyor");
  t(isTurkishStorefrontPath("/tr/oversize-gomlek-c0p123.html"), "bershka /tr geçiyor");

  // Yabancı vitrin — düşmeli.
  t(!isTurkishStorefrontPath("/en/p_04651-light-blue-linen-bermuda_1968682"), "beymen /en düşüyor");
  t(!isTurkishStorefrontPath("/ee/luhikeste-varrukatega-sark-c0p123.html"), "bershka /ee düşüyor");
  t(!isTurkishStorefrontPath("/mx/es/traje-de-bano-p05664699.html"), "zara /mx/es düşüyor");
  t(!isTurkishStorefrontPath("/uk/en/linen-shirt-p07099690.html"), "zara /uk/en düşüyor");
  t(!isTurkishStorefrontPath("/ie/oversize-shirt-l07683312"), "pullandbear /ie düşüyor");
  t(!isTurkishStorefrontPath("/gr/pack-4-vrachiolia-l03016508"), "pullandbear /gr düşüyor");

  /*
   * **Dil kodu taşımayan yol dokunulmadan geçiyor** — kuralın en kritik yanı.
   *
   * Koton ve Gratis'in 38.757 yolunda dil parçası yok. Kural «ilk parça iki
   * harfliyse» diye başlamasaydı ya da fazla hevesli olsaydı, iki mağaza birden
   * dizinden silinirdi ve kapsam bunu ancak yüzde olarak gösterirdi.
   */
  t(isTurkishStorefrontPath("/10-lu-yuzuk-seti-altin-rengi-4203129-1/"), "koton yolu geçiyor");
  t(isTurkishStorefrontPath("/oje/flormar-oje-p-123"), "gratis kategori yolu geçiyor");
  t(isTurkishStorefrontPath("/ruj/mat-ruj-p-9"), "üç harfli ilk parça dil sanılmıyor");

  /*
   * Ret listesi değil şekil sınaması — ve fark bu satırda.
   *
   * `ee`, `ie`, `gr`, `no` `FOREIGN_LOCALES`'te **yoktu** ve dördü de gerçek
   * ölçümde çıktı. Bir sonraki mağazanın dili de listede olmayacak; şekil
   * sınaması onu da yakalıyor.
   */
  t(!isTurkishStorefrontPath("/fi/takki-p-1"), "listede olmayan dil de düşüyor");
  t(!isTurkishStorefrontPath("/pt-br/camisa-p-1"), "iki parçalı dil kodu da düşüyor");
  t(isTurkishStorefrontPath("/tr-tr/gomlek-p-1"), "tr-tr geçiyor");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
