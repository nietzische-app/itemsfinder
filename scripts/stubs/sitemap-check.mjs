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
const { sitemapUrlsFromRobots, locsIn, isSitemapIndex, rankProductSitemaps, SITEMAP_GUESSES } =
  await import("@/lib/sitemapIndex");

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

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
