/**
 * Sitemap kanalı çalışıyor mu? — `npm run check:sitemap`
 *
 *   npm run check:sitemap
 *   npm run check:sitemap -- --q "gri pantolon"
 *   npm run check:sitemap -- --site trendyol.com
 *
 * ## Hangi soruyu cevaplıyor
 *
 * Arama sayfası kanalı çalışıyor ama on dokuz mağazanın **ikisinde**
 * (`docs/BULUNAMADI.md` 4d). Kalanlar ya veri merkezi IP'sine 403 veriyor
 * (Trendyol, Hepsiburada, DeFacto, H&M, Watsons, Sephora — Türkiye'nin en
 * büyükleri dahil) ya da arama sonuçlarını sunucuda çizmiyor.
 *
 * Sitemap ikisini de aşabilir: bot duvarları genelde arama ve ürün sayfalarına
 * konuyor, `sitemap.xml` ise arama motorları için var ve engellenmesi mağazanın
 * kendi çıkarına aykırı. Üstelik düz XML, yani istemci tarafı çatıyla ilgisiz.
 *
 * **Ölçmeden inşa edilmeyecek.** Bu turun her adımı bunu öğretti: Google kapısı,
 * görsel yol, dört haksız yere elenen mağaza. Bu betik kanalın ölçüsü.
 *
 * ## Ne ölçüyor
 *
 *  1. `robots.txt` sitemap ilan ediyor mu, ve veri merkezi IP'sine veriyor mu?
 *  2. Sitemap dizini açılıyor mu, içinde ürün sitemap'i var mı?
 *  3. İçindeki adresler `isDirectProductUrl` süzgecinden geçiyor mu?
 *  4. **Asıl soru:** slug'lar arama kelimesi taşıyor mu — yani `rankByQuery` bir
 *     sorguya karşılık aday bulabiliyor mu?
 *
 * Ağ gerektiriyor: Actions → «Ücretsiz keşif ölçümü» → kanal «sitemap».
 */
import { gunzipSync } from "node:zlib";

import { USER_AGENT, productLinks, rankByQuery } from "./kesif-lib.mjs";

const { sitemapUrlsFromRobots, locsIn, isSitemapIndex, isGzip, rankProductSitemaps, SITEMAP_GUESSES } =
  await import("@/lib/sitemapIndex");

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = args.indexOf(`--${name}`);
  return at !== -1 ? args[at + 1] : undefined;
};

const query = arg("q") ?? "gri pantolon";
const only = arg("site");

const STORES = [
  "trendyol.com", "hepsiburada.com", "boyner.com.tr", "lcw.com", "defacto.com.tr",
  "koton.com", "mavi.com", "flo.com.tr", "beymen.com", "vakko.com",
  "zara.com", "hm.com", "mango.com", "pullandbear.com", "bershka.com",
  "stradivarius.com", "gratis.com", "watsons.com.tr", "sephora.com.tr",
];

/** Sitemap dosyaları büyük; gövde sınırı olmadan tek dosya ölçümü yiyebilir. */
const MAX_BYTES = 25 * 1024 * 1024;

async function get(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/xml,text/xml,text/plain,*/*",
        "accept-encoding": "gzip, deflate",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { status: response.status, body: "", url: response.url, tooBig: buffer.byteLength };
    }

    /*
     * `.xml.gz` dosyaları TAŞIMA sıkıştırması değil, gövdenin kendisi gzip.
     *
     * İlk koşuda altı mağaza «0 adres» dedi — Zara, Pull&Bear, Bershka,
     * Stradivarius, Vakko, Flo. `robots.txt` sitemap ilan ediyordu ve dosya 200
     * dönüyordu; gövde gzip olduğu için `TextDecoder` çöp üretti ve içinde
     * `<loc>` bulunamadı. Ölçüm «bu mağazada sitemap yok» diyordu, oysa vardı.
     */
    const bytes = new Uint8Array(buffer);
    const body = isGzip(bytes)
      ? gunzipSync(bytes).toString("utf-8")
      : new TextDecoder("utf-8").decode(bytes);

    return { status: response.status, body, url: response.url };
  } catch (error) {
    return {
      status: 0,
      body: "",
      url,
      error: error instanceof Error ? error.message.slice(0, 60) : "istek başarısız",
    };
  }
}

/** Mağazanın ilan ettiği ya da standart yerdeki sitemap adresleri. */
async function sitemapsFor(host) {
  const robots = await get(`https://www.${host}/robots.txt`);

  if (robots.status === 200) {
    const declared = sitemapUrlsFromRobots(robots.body);
    if (declared.length > 0) return { urls: declared, from: "robots.txt" };
  }

  for (const guess of SITEMAP_GUESSES) {
    const page = await get(`https://www.${host}${guess}`);
    if (page.status === 200 && /<(sitemapindex|urlset)[\s>]/i.test(page.body)) {
      return { urls: [page.url], from: `tahmin ${guess}` };
    }
  }

  return {
    urls: [],
    from: null,
    robotsStatus: robots.status,
    robotsError: robots.error,
  };
}

const stores = only ? [only] : STORES;

console.log(`\nSorgu: «${query}»  —  ${stores.length} mağaza`);
console.log("Yalnızca mağazalara gidiyor; hiçbir yere veri göndermiyor.\n");

const rows = [];

for (const host of stores) {
  process.stdout.write(`  ${host.padEnd(18)}`);

  const found = await sitemapsFor(host);

  if (found.urls.length === 0) {
    const why =
      found.robotsError ??
      (found.robotsStatus && found.robotsStatus !== 200
        ? `robots.txt HTTP ${found.robotsStatus}`
        : "sitemap bulunamadı");
    console.log(why);
    rows.push({ host, outcome: why });
    continue;
  }

  /*
   * Dizinse bir kademe daha in. İkiden fazla inilmiyor: iç içe dizin nadir ve
   * her kademe bir indirme demek.
   */
  let target = rankProductSitemaps(found.urls)[0];
  let first = await get(target);

  if (first.status === 200 && isSitemapIndex(first.body)) {
    const children = rankProductSitemaps(locsIn(first.body));
    if (children.length === 0) {
      console.log(`dizin boş (${found.from})`);
      rows.push({ host, outcome: "dizin boş" });
      continue;
    }
    target = children[0];
    first = await get(target);
  }

  if (first.status !== 200) {
    const why = first.tooBig
      ? `çok büyük (${Math.round(first.tooBig / 1024 / 1024)} MB)`
      : first.error
        ? `ulaşılamadı — ${first.error}`
        : `HTTP ${first.status}`;
    console.log(`${why}  ${target.slice(0, 50)}`);
    rows.push({ host, outcome: why });
    continue;
  }

  const locs = locsIn(first.body);

  /*
   * Uygulamanın kendi süzgeçleri: «kaç adres var» değil, **kaç adres
   * kullanılabilir** ve **kaçı bu sorguya karşılık geliyor**.
   */
  const products = productLinks(
    locs.map((loc) => `<a href="${loc.replace(/"/g, "&quot;")}">x</a>`).join(""),
    `https://www.${host}/`,
    host,
  );
  const matching = rankByQuery(products, query);

  const short = (url) => url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 74);

  console.log(
    `${String(locs.length).padStart(6)} adres → ${products.length} ürün sayfası → ` +
      `${matching.length} sorguya uyan  (${found.from})`,
  );

  /*
   * Sıfır çıkan her adımda **örnek adres** yazılıyor.
   *
   * İkinci koşuda Zara'nın 8655 ürün sayfası açıldı ve hiçbiri sorguya uymadı.
   * Sebebi sayıdan okunamıyor: yanlış dil dosyası mı, tanınmayan adres şekli mi,
   * yoksa gerçekten o üründen yok mu? Üçü üç ayrı iş. Bir tur önce aynı dersi
   * eleme satırında almıştık — adressiz bir sayı yarım teşhis.
   */
  if (matching.length > 0) {
    for (const url of matching.slice(0, 2)) console.log(`${" ".repeat(22)}${short(url)}`);
  } else {
    console.log(`${" ".repeat(22)}okunan dosya: ${short(target)}`);
    const samples = products.length > 0 ? products : locs;
    const etiket = products.length > 0 ? "ürün sayfası" : "ham adres";
    for (const url of samples.slice(0, 3)) {
      console.log(`${" ".repeat(22)}${etiket}: ${short(url)}`);
    }
  }

  rows.push({ host, locs: locs.length, products: products.length, matching: matching.length });
}

const usable = rows.filter((row) => row.matching > 0);
const reachable = rows.filter((row) => row.locs > 0);

console.log("");
console.log(`  ${reachable.length}/${rows.length} mağazanın sitemap'i açıldı.`);
console.log(`  ${usable.length}/${rows.length} mağazada bu sorguya uyan ürün adresi bulundu.\n`);

if (usable.length === 0) {
  console.log("  Sitemap kanalı bu sorgu için yürümüyor. Sebebi yukarıdaki satırlarda:");
  console.log("  «ulaşılamadı» duvar demek, «0 ürün sayfası» adres şeklinin tanınmadığı,");
  console.log("  «0 sorguya uyan» ise ilk sitemap dosyasının o ürünleri taşımadığı anlamına");
  console.log("  gelir — sonuncusu kanalın değil, dosya seçiminin sorunudur.\n");
} else {
  console.log("  Sitemap'i kullanılabilir mağazalar:");
  for (const row of usable) {
    console.log(`    ${row.host} — ${row.locs} adres, ${row.matching} sorguya uyan`);
  }
  console.log("\n  Bu, arama sayfası kanalının ulaşamadığı mağazalara ikinci bir yol.");
  console.log("  Üretime bağlanmadan önce cevaplanacak soru: adres sayısı tarama anında");
  console.log("  indirilemeyecek kadar büyükse dizin nerede tutulacak.\n");
}
