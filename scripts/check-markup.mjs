/**
 * Dizinin adayları **satıra dönüşüyor mu?** — `npm run check:markup`
 *
 *   npm run check:markup
 *   npm run check:markup -- --sorgu 12      # kaç ürün adı denensin
 *
 * ## Hangi soruyu cevaplıyor
 *
 * Dizin aday buluyor (`check:index`, kapsam 56/56) ama aday bir sayfa adresi;
 * karta dönüşmesi için o sayfanın **okunabilmesi** gerekiyor. Üretim logu iki
 * tarama üst üste şunu yazdı:
 *
 *   4 sayfa, 0 satır — bershka: HTTP 403 ×2; beymen: ürün işaretlemesi yok ×2
 *
 * Yani dizinin yarısı (Bershka + Beymen, 57 bin yol) hiçbir şeye dönüşmüyor
 * olabilir. «Olabilir», çünkü iki tarama iki fotoğraf demek ve o fotoğraflarda
 * o mağazalar sıra almıştı — öteki dört mağaza hiç denenmedi.
 *
 * ## Neden ayrı bir betik
 *
 * Bu ölçüm üretim trafiğine bırakılırsa **şansa** bağlı kalıyor. Nitekim bir
 * sonraki tarama başka bir fotoğrafla geldi, mağaza araması iki parçada da aday
 * buldu ve dizine hiç sıra gelmedi — hiçbir şey ölçülmedi. Soru sabit, cevabı
 * da sabit bir koşuyla alınmalı.
 *
 * Ağ gerektiriyor ve **veri merkezinden** koşmalı: Bershka'nın 403'ü ev
 * bağlantısında görünmeyebilir, üretim ise Vercel'den çıkıyor. Actions → «Ürün
 * adres dizini» ile aynı gerekçe.
 *
 * ## Ne ölçüyor
 *
 * Mağaza başına: kaç aday verildi, kaçı okundu, sebebiyle birlikte kaçı düştü.
 * Uygulamanın kendi çıkarıcısını (`productsFromMarkup`) çağırıyor — ikinci bir
 * kopya, ölçülen davranışla çalışan davranışın ayrışması demekti.
 */
import { register } from "node:module";

import { parseArgs } from "./args.mjs";

process.env.ENABLE_PRODUCT_INDEX ??= "true";
process.env.ENABLE_MARKUP_EXTRACT ??= "true";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const arg = parseArgs(process.argv.slice(2), { queries: ["sorgu"], dir: ["dizin"] });

if (arg("dir")) process.env.PRODUCT_INDEX_DIR = arg("dir");

const { COVERAGE_CASES } = await import("../eval/coverageCases.ts");
const { ProductIndexSearch } = await import("@/services/productIndex");
const { productsFromMarkup } = await import("@/services/markupProducts");

/**
 * Kaç ürün adı denenecek.
 *
 * Elli altısının hepsi ~220 sayfa indirmek demek ve mağazalara karşı bu kadar
 * istek nezaketsiz. Varsayılan on iki: her mağazanın birkaç kez denenmesine
 * yetiyor, ve sayı azsa çıktı zaten «yetersiz örnek» diye uyarıyor.
 */
const DEFAULT_QUERIES = 12;
const count = Number(arg("queries") ?? DEFAULT_QUERIES);

if (!Number.isFinite(count) || count < 1) {
  console.error(`--sorgu bir sayı olmalı (verilen: ${arg("queries")})`);
  process.exit(2);
}

/*
 * Sorgular listenin **başından** değil, eşit aralıklarla seçiliyor.
 *
 * `coverageCases` kategoriye göre sıralı (üst, alt, elbise, dış giyim,
 * ayakkabı, çanta, takı, kozmetik). İlk on ikisini almak yalnızca üst ve alt
 * giyimi ölçerdi ve kozmetik satan Gratis hiç denenmezdi — mağaza başına ölçüm
 * yapan bir betikte bu, ölçülmeyen bir mağaza demek.
 */
const step = Math.max(1, Math.floor(COVERAGE_CASES.length / count));
const queries = [];
for (let i = 0; i < COVERAGE_CASES.length && queries.length < count; i += step) {
  queries.push(COVERAGE_CASES[i].label);
}

console.log(`\n${queries.length} ürün adı, dizinden gelen adaylar okunuyor.`);
console.log("Yalnızca mağazalara gidiyor; hiçbir yere veri göndermiyor.\n");

const index = new ProductIndexSearch();

/** Mağaza başına: verilen aday, okunan satır, düşme sebepleri. */
const stores = new Map();
const bucket = (host) => {
  if (!stores.has(host)) stores.set(host, { given: 0, rows: 0, reasons: new Map() });
  return stores.get(host);
};

for (const query of queries) {
  const { urls } = index.findProductPages(query);
  if (urls.length === 0) {
    console.log(`  ${query.padEnd(20)} aday yok`);
    continue;
  }

  for (const url of urls) bucket(new URL(url).hostname.replace(/^www\./, "")).given += 1;

  /*
   * Adaylar **tek tek** okunuyor, hepsi bir arada değil.
   *
   * `productsFromMarkup` sebepleri tek bir satırda topluyor ve o satırdan hangi
   * adresin hangi sebeple düştüğü çıkarılamıyor — üretimde tam olarak bu
   * eksiklik yüzünden «bershka mı beymen mi» sorusu tahminle cevaplandı. Burada
   * soru mağaza başına, yani eşleme kesin olmalı.
   */
  const outcomes = [];
  for (const url of urls) {
    const host = new URL(url).hostname.replace(/^www\./, "");

    /*
     * Sebep **uygulamanın kendi cümlesinden** okunuyor.
     *
     * `productsFromMarkup` sebebi döndürmüyor, `[markup]` satırına yazıyor —
     * ve o cümleler zaten insan için yazılmış: «HTTP 403», «ürün işaretlemesi
     * yok», «fiyat okunamadı». Burada ikinci bir teşhis yazmak, üretimde
     * görülenden farklı bir sebep üretme riski demekti; asıl soru tam olarak
     * «üretimde ne yazıyor».
     *
     * Tek adres verildiği için satırdaki sebep o adresin sebebi — eşleme kesin.
     */
    const captured = [];
    const original = console.log;
    console.log = (line) => captured.push(String(line));
    let rows;
    try {
      rows = await productsFromMarkup([url]);
    } finally {
      console.log = original;
    }

    if (rows.length > 0) {
      bucket(host).rows += 1;
      outcomes.push(`${host} ✓`);
      continue;
    }

    const line = captured.find((entry) => entry.startsWith("[markup]")) ?? "";
    const why = line.split(" — ").slice(2).join(" — ").replace(`${host}: `, "") || "sebep yazılmadı";

    const reasons = bucket(host).reasons;
    reasons.set(why, (reasons.get(why) ?? 0) + 1);
    outcomes.push(`${host} ✗`);
  }

  console.log(`  ${query.padEnd(20)} ${outcomes.join("  ")}`);
}

console.log("");
console.log("  Mağaza başına — aday → satır:");

const rows = [...stores].sort((a, b) => b[1].given - a[1].given);
for (const [host, stat] of rows) {
  const pct = stat.given > 0 ? Math.round((stat.rows / stat.given) * 100) : 0;
  const why = [...stat.reasons]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${reason} ×${n}`)
    .join("; ");

  console.log(
    `    ${host.padEnd(18)} ${String(stat.given).padStart(3)} → ${String(stat.rows).padStart(3)}` +
      `  (%${pct})${why ? `  ${why}` : ""}`,
  );
}

const given = rows.reduce((sum, [, stat]) => sum + stat.given, 0);
const produced = rows.reduce((sum, [, stat]) => sum + stat.rows, 0);

console.log("");
console.log(`  Toplam: ${given} aday → ${produced} satır (%${Math.round((produced / given) * 100)}).`);

/*
 * Az örneği olan mağaza ayrıca yazılıyor.
 *
 * «0/1» bir mağazayı listeden çıkarmaya yetmez, «0/8» yeter. İkisini ayırmadan
 * yazılan bir yüzde, tek denemeyi kanıt sanmaya yol açar — bu turda üç kez
 * cezası ödenmiş hata.
 */
const thin = rows.filter(([, stat]) => stat.given < 4);
if (thin.length > 0) {
  console.log(`  Yetersiz örnek (<4 aday): ${thin.map(([host]) => host).join(", ")}`);
  console.log("  Bunlar için karar vermeden önce: npm run check:markup -- --sorgu 30\n");
} else {
  console.log("");
}
