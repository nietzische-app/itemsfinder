/**
 * Ücretsiz aday bulma yolu çalışıyor mu? — `npm run check:kesif`
 *
 *   npm run check:kesif
 *   npm run check:kesif -- --q "siyah deri ceket"
 *   npm run check:kesif -- --site trendyol.com
 *   npm run check:kesif -- --site x.com --url "https://x.com/ara?k={q}"
 *
 * ## Hangi soruyu cevaplıyor
 *
 * Google, Custom Search JSON API'yi yeni müşterilere kapattı (docs/BULUNAMADI.md
 * 4c). Aday bulma zincirin ilk halkası ve şu an sağlayıcısı yok. Ücretsiz tek
 * ihtimal şu: **mağazanın kendi arama sayfasından** ürün adresi toplayıp
 * `productsFromMarkup` ile okumak. Satıcı yok, ücret yok.
 *
 * Bilinmeyen tek şey mağazaların sunucu taraflı bir isteğe ne yaptığı — bazıları
 * bot duvarı çıkarıyor, bazıları sonuçları yalnızca tarayıcıda çiziyor. Bu betik
 * onu ölçüyor ve **hiçbir şey inşa edilmeden önce** cevabı vermek için var; bu
 * turun tamamı, ölçmeden önce yazılmış kodun bedelinden çıktı.
 *
 * ## Arama adresi uydurulmuyor
 *
 * Ezberden yazılan bir kalıp ölçümü sessizce bozar: 404 alan bir istek «bot
 * duvarı» gibi görünür ve mağaza haksız yere elenir. Sıra şu:
 *
 *   1. Mağazanın **kendi ilanı** — schema.org `SearchAction` ya da OpenSearch.
 *   2. İlan yoksa yaygın **şekiller** deneniyor (`PROBE_SHAPES`). Bunlar mağazaya
 *      değil, e-ticaret yazılımlarının arama yoluna ait; ve bir şekil ancak sayfa
 *      200 dönüp içinden ürün bağlantısı çıkarsa kabul ediliyor. Hangi adresin
 *      tuttuğu çıktıya yazılıyor, yani doğrulanabilir kalıyor.
 *
 * ## Satır çıkmazsa sayfa teşhis ediliyor
 *
 * «İşaretleme yok» üç ayrı ihtimali gizliyor ve biri bizim kusurumuz: okunan
 * adres hiç ürün sayfası olmayabilir. O yüzden sıfır satır çıkan her mağaza için
 * okunan adresler ve sayfada gerçekte ne olduğu yazılıyor.
 *
 * ## Ne ölçüldü, ne ölçülmedi
 *
 * Kararlar (kalıp okuma, bağlantı süzme, duvar teşhisi, sayfa teşhisi)
 * `kesif-lib.mjs` içinde ve `scripts/stubs/kesif-check.mjs` ile sahte bir
 * mağazaya karşı ölçüldü. Gerçek mağazaların davranışı ağ gerektiriyor:
 * GitHub Actions → «Ücretsiz keşif ölçümü».
 *
 * Hiçbir yere veri göndermiyor; yalnızca mağazalara gidiyor.
 */
import {
  PROBE_SHAPES,
  USER_AGENT,
  fillTemplate,
  looksLikeWall,
  openSearchHref,
  openSearchUrlFromXml,
  pageDiagnosis,
  probeUrls,
  productLinks,
  searchActionTemplate,
} from "./kesif-lib.mjs";

const { productsFromMarkup } = await import("@/services/markupProducts");

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = args.indexOf(`--${name}`);
  return at !== -1 ? args[at + 1] : undefined;
};

const query = arg("q") ?? "gri pantolon";
const only = arg("site");
const override = arg("url");

/**
 * Ölçülecek mağazalar — Türkiye'den alışveriş yapan biri için sıralanmış.
 *
 * `googleSearch.ts`'teki listenin aynısı değil: orada kapanan bir motorun
 * yapılandırmasının aynası duruyor, burada ölçülecek mağazalar var. İkisini tek
 * listeye bağlamak, ölü bir yolun mirasını yaşayan bir ölçüme taşırdı.
 */
const STORES = [
  "trendyol.com", "hepsiburada.com", "boyner.com.tr", "lcw.com", "defacto.com.tr",
  "koton.com", "mavi.com", "flo.com.tr", "beymen.com", "vakko.com",
  "zara.com", "hm.com", "mango.com", "pullandbear.com", "bershka.com",
  "stradivarius.com", "gratis.com", "watsons.com.tr", "sephora.com.tr",
];

async function get(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });

    return { status: response.status, body: await response.text(), url: response.url };
  } catch (error) {
    return {
      status: 0,
      body: "",
      url,
      error: error instanceof Error ? error.message.slice(0, 60) : "istek başarısız",
    };
  }
}

async function templateFor(host) {
  if (override && (only === host || STORES.length === 1)) return { template: override };

  const home = await get(`https://www.${host}/`);

  if (home.status === 0) return { failure: `ulaşılamadı — ${home.error}` };
  if (home.status !== 200) return { failure: `ana sayfa HTTP ${home.status}` };
  if (looksLikeWall(home.body)) return { failure: "bot duvarı (ana sayfa)" };

  const declared = searchActionTemplate(home.body);
  if (declared) return { template: declared };

  const href = openSearchHref(home.body);
  if (href) {
    const xml = await get(new URL(href, home.url).href);
    if (xml.status === 200) {
      const template = openSearchUrlFromXml(xml.body);
      if (template) return { template };
    }
  }

  /*
   * İlan etmemiş — yaygın şekiller deneniyor.
   *
   * İlk ölçümde on dokuz mağazanın **sekizi** buraya düştü, yani ölçüm onlar
   * hakkında hiçbir şey söylemedi. «İlan etmemiş» bir cevap değil, cevabın
   * yokluğu; ve o sekizin arasında Zara, Mango, Bershka var.
   *
   * Adres uydurulmuyor: denenen şekil ancak sayfa 200 dönüp içinden ürün
   * bağlantısı çıkarsa kabul ediliyor ve hangi adresin tuttuğu çıktıya
   * yazılıyor, yani doğrulanabilir kalıyor.
   */
  for (const url of probeUrls(host, query)) {
    const page = await get(url);
    if (page.status !== 200 || looksLikeWall(page.body)) continue;
    if (productLinks(page.body, page.url, host).length === 0) continue;

    return { template: url.replace(encodeURIComponent(query), "{q}"), probed: true };
  }

  return {
    failure: `arama adresi bulunamadı (ilan yok, ${PROBE_SHAPES.length} şekil denendi)`,
  };
}

const stores = only ? [only] : STORES;

console.log(`\nSorgu: «${query}»  —  ${stores.length} mağaza`);
console.log("Yalnızca mağazalara gidiyor; hiçbir yere veri göndermiyor.\n");

const rows = [];

for (const host of stores) {
  process.stdout.write(`  ${host.padEnd(18)}`);

  const { template, failure, probed } = await templateFor(host);
  if (!template) {
    console.log(failure);
    rows.push({ host, outcome: failure });
    continue;
  }

  const page = await get(fillTemplate(template, query));

  if (page.status === 0) {
    console.log(`arama isteği başarısız — ${page.error}`);
    rows.push({ host, outcome: "arama isteği başarısız" });
    continue;
  }
  if (page.status !== 200) {
    console.log(`arama HTTP ${page.status}`);
    rows.push({ host, outcome: `arama HTTP ${page.status}` });
    continue;
  }
  if (looksLikeWall(page.body)) {
    console.log("bot duvarı (arama sayfası)");
    rows.push({ host, outcome: "bot duvarı" });
    continue;
  }

  const links = productLinks(page.body, page.url, host);

  if (links.length === 0) {
    /*
     * Sayfa geldi ama ürün bağlantısı yok — büyük olasılıkla sonuçlar yalnızca
     * tarayıcıda çiziliyor. Bot duvarından bambaşka bir şey: biri «girme» diyor,
     * öteki «girdin ama burada bir şey yok». İkisi ayrı yazılıyor çünkü çözümleri
     * de ayrı.
     */
    console.log("sayfa geldi, ürün bağlantısı yok (sonuçlar tarayıcıda çiziliyor olabilir)");
    rows.push({ host, outcome: "bağlantı yok" });
    continue;
  }

  /*
   * Asıl soru bağlantı değil **satır**: fiyatı olan bir kart çıkıyor mu?
   *
   * Üç değil altı sayfa okunuyor. Üçüncü koşu sebebini gösterdi: arama
   * sayfasından çıkan bağlantıların bir kısmı sonuç değil **gezinme** — LCW'nin
   * dokuz adayının hepsi menüden gelen kategorilerdi. İlk üçü menüye denk gelen
   * bir mağaza, gerçek sonuç verse bile «0 satır» diye görünürdü.
   *
   * Altıda duruyor çünkü bu bir tarama değil ölçüm: on dokuz mağaza × altı sayfa
   * zaten yüzden fazla istek, ve menüsü bağlantı listesini baştan sona dolduran
   * bir mağazada (Beymen'de 1175 aday) hiçbir sayı yetmiyor — orada cevap «daha
   * fazla oku» değil, «bu mağaza sonuçları sunucuda çizmiyor».
   */
  const top = links.slice(0, 6);
  const cards = await productsFromMarkup(top);

  console.log(
    `${String(links.length).padStart(4)} aday → ${top.length} sayfa okundu, ${cards.length} satır` +
      (probed ? "  (adres denenerek bulundu)" : ""),
  );

  for (const card of cards.slice(0, 2)) {
    console.log(`${" ".repeat(22)}«${card.title.slice(0, 48)}» ${card.price ?? "?"} ${card.currency ?? ""}`);
  }

  /*
   * Satır çıkmadıysa okunan sayfanın ne olduğu yazılıyor.
   *
   * «İşaretleme yok» tek başına üç ayrı ihtimali gizliyor ve biri bizim
   * kusurumuz: okunan adres hiç ürün sayfası olmayabilir. O ihtimali görmeden
   * mağazayı elemek, mağazayı haksız yere suçlamak olur.
   */
  if (cards.length === 0) {
    for (const url of top.slice(0, 3)) {
      const page = await get(url);
      const where = url.replace(/^https?:\/\/(www\.)?/, "");
      console.log(
        `${" ".repeat(22)}${where.slice(0, 62)}\n${" ".repeat(24)}${
          page.status === 200 ? pageDiagnosis(page.body) : `HTTP ${page.status}`
        }`,
      );
    }
  }

  rows.push({ host, links: links.length, cards: cards.length });
}

const working = rows.filter((row) => row.cards > 0);
const linked = rows.filter((row) => row.links > 0);

console.log("");
console.log(`  ${working.length}/${rows.length} mağazadan gerçek ürün satırı çıktı.`);
console.log(`  ${linked.length}/${rows.length} mağaza arama sayfasında ürün bağlantısı verdi.\n`);

if (working.length === 0) {
  console.log("  Ücretsiz yol bu hâliyle yürümüyor: hiçbir mağazadan satır çıkmadı.");
  console.log("  Sebebi yukarıdaki satırlarda — «bot duvarı» ile «bağlantı yok» bambaşka");
  console.log("  şeyler. İkincisi ağır basıyorsa mağazalar sonuçları tarayıcıda çiziyor");
  console.log("  demektir ve çözüm ayrıştırma değil, başka bir aday kaynağı.\n");
} else {
  console.log("  Çalışan mağazalar:");
  for (const row of working) console.log(`    ${row.host} — ${row.links} aday, ${row.cards} satır`);
  console.log("\n  Bu liste, üretimde hangi mağazalara sorulacağının ölçülmüş hâli.");
  console.log("  Sıradaki adım: aday bulmayı `productProvider` içine bir sağlayıcı olarak");
  console.log("  eklemek — `googleSearch.ts` ile aynı sözleşme.\n");
}
