/**
 * Mağaza arama sağlayıcısı — `node scripts/stubs/store-search-check.mjs`
 *
 * `kesif-check.mjs` kararları ölçüyor (hangi adres kalıp sayılıyor, hangi
 * bağlantı ürün sayfası). Bu süit **servisi** ölçüyor: kalıp önbelleğe alınıyor
 * mu, mağaza başına aday tavanı tutuyor mu, bir mağaza patlarken öteki devam
 * ediyor mu, ve bayrak kapalıyken yol gerçekten kurulmuyor mu.
 *
 * Ayrımın sebebi şu: üç gerçek koşu kararların doğru olduğunu gösterdi ama
 * servisin doğru olduğunu göstermedi. Servis her taramada çalışacak ve her
 * kusuru bir gidiş dönüş ya da yanlış bir kart demek.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/** İstek muhasebesi: önbelleğin gerçekten kestiğini ölçmenin tek yolu. */
const hits = { home: 0, search: 0 };
let searchStatus = 200;
let homeDeclares = true;
let productCount = 5;
let base = "";

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  // Yol: /<host>/... — servis `originFor` ile mağaza adını öne koyuyor.
  const [, host, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;

  if (path === "/") {
    hits.home += 1;
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      homeDeclares
        ? `<html><head><script type="application/ld+json">${JSON.stringify({
            "@type": "WebSite",
            potentialAction: {
              "@type": "SearchAction",
              target: `${base}/${host}/ara?q={search_term_string}`,
            },
          })}</script></head><body>ana sayfa</body></html>`
        : "<html><body>ilan yok</body></html>",
    );
    return;
  }

  if (path === "/ara") {
    hits.search += 1;
    if (searchStatus !== 200) {
      res.writeHead(searchStatus);
      res.end("hayır");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    const links = Array.from(
      { length: productCount },
      (_, i) => `<a href="/${host}/urun/gri-pantolon-p-11111111${i}">ürün ${i}</a>`,
    ).join("");
    // Gezinme bağlantıları da var — gerçek arama sayfalarında olduğu gibi.
    res.end(`<html><body>${links}<a href="/${host}/kadin-tisort-c-1050">kategori</a></body></html>`);
    return;
  }

  res.writeHead(404);
  res.end("yok");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;

process.env.STORE_SEARCH_BASE_URL = base;
process.env.ENABLE_STORE_SEARCH = "true";
process.env.STORE_SEARCH_DOMAINS = "magaza-bir.com,magaza-iki.com";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { StoreProductSearch, getStoreSearch, storeSearchStatus } = await import(
  "@/services/storeSearch"
);

/*
 * 1) İki mağaza, mağaza başına en fazla iki aday.
 *
 * Tek mağazadan gelen birbirine benzeyen dört ilan, iki mağazadan gelen dört
 * seçenekten kötü — metin merdivenindeki kuralın aynısı.
 */
{
  const search = new StoreProductSearch(["magaza-bir.com", "magaza-iki.com"]);
  const { urls, seen, samples } = await search.findProductPages("gri pantolon");

  t(urls.length === 4, `dört aday (${urls.length})`);
  t(seen === 10, `süzmeden önce on bağlantı görüldü (${seen})`);

  /*
   * Aday varken örnek yazılmıyor: eleme satırı zaten çıkmıyor ve o hâlde
   * örnekler yalnızca gürültü olurdu.
   */
  t(samples.length === 0, `aday bulununca örnek taşınmıyor (${samples.length})`);

  const hosts = urls.map((url) => new URL(url).pathname.split("/")[1]);
  t(
    hosts.filter((h) => h === "magaza-bir.com").length === 2,
    `mağaza başına iki aday: ${JSON.stringify(hosts)}`,
  );
  t(
    !urls.some((url) => url.includes("-c-1050")),
    "kategori bağlantısı aday sayılmıyor",
  );
}

/*
 * 1b) Hiçbiri eşleşmediğinde **elenen adres** taşınıyor.
 *
 * Üretimde iki kez «24 ürün sayfası buldu, hiçbiri sorguyla eşleşmedi» yazdı ve
 * o satır kararı vermeye yetmiyordu: süzgeç fazla mı katı, yoksa gelenler
 * gerçekten alakasız mı? Birincisi bizim kusurumuz, ikincisi mağazanın öneri
 * karuseli — ve aralarındaki farkı yalnızca adres söylüyor.
 *
 * Sorgu bilerek mağazanın hiçbir ürününe uymuyor: ölçülen şey «sıfır aday»
 * değil, sıfırın **yanında ne yazıldığı**.
 */
{
  const search = new StoreProductSearch(["magaza-bir.com"]);
  const { urls, seen, samples } = await search.findProductPages("Halka küpe");

  t(urls.length === 0, `uymayan sorguda aday yok (${urls.length})`);
  t(seen > 0, `ama bağlantı görüldü (${seen})`);
  t(samples.length > 0, `elenen adres taşınıyor (${samples.length})`);
  t(
    samples.every((url) => url.includes("magaza-bir.com")),
    `örnekler gerçek adres: ${samples.join(", ")}`,
  );
}

/*
 * 2) Arama kalıbı örnek ömrü boyunca bir kez okunuyor.
 *
 * Kalıp mağazanın ana sayfasından geliyor ve her parça için yeniden okumak,
 * taramaya parça sayısı kadar fazladan gidiş dönüş eklerdi. Ölçülen şey mesaj
 * değil **istek sayısı**.
 */
{
  hits.home = 0;
  hits.search = 0;

  const search = new StoreProductSearch(["magaza-bir.com"]);
  await search.findProductPages("gri pantolon");
  const afterFirst = { ...hits };
  await search.findProductPages("bej bluz");

  t(afterFirst.home <= 1, `ilk aramada ana sayfa bir kez okundu (${afterFirst.home})`);
  t(hits.home === afterFirst.home, `ikinci aramada ana sayfa hiç okunmadı (${hits.home})`);
  t(hits.search === afterFirst.search + 1, `ama arama yine yapıldı (${hits.search})`);
}

/*
 * 3) Bir mağaza patlarken öteki devam ediyor.
 *
 * Bu yol `web.search`'ün yerine geçiyor; bir mağazanın 503'ü taramayı
 * durdurmamalı, kataloğa bırakmalı.
 */
{
  // Önce kalıpları ısıt, sonra yalnızca aramayı bozmadan tek mağazayı düşür.
  const search = new StoreProductSearch(["magaza-bir.com"]);
  await search.findProductPages("ısınma");

  searchStatus = 503;
  const { urls, error } = await search.findProductPages("gri pantolon");
  t(urls.length === 0, "arama hatasında boş dönüyor");
  t(error === undefined, "hata sayfası «ulaşılamadı» sayılmıyor — mağaza cevap verdi");
  searchStatus = 200;

  const back = await search.findProductPages("gri pantolon");
  t(back.urls.length === 2, `mağaza düzelince adaylar geri geliyor (${back.urls.length})`);
}

/*
 * 4) İlan etmeyen mağaza her taramada yeniden sorulmuyor.
 *
 * Olumsuz cevap da saklanmazsa, hiçbir zaman işe yaramayacak bir gidiş dönüş her
 * taramaya eklenirdi.
 */
{
  homeDeclares = false;
  const search = new StoreProductSearch(["sessiz-magaza.com"]);

  hits.home = 0;
  await search.findProductPages("gri pantolon");
  const afterFirst = hits.home;
  await search.findProductPages("gri pantolon");

  t(afterFirst === 1, `ilan aranıyor (${afterFirst})`);
  t(hits.home === 1, `ilan etmeyen mağaza yeniden sorulmuyor (${hits.home})`);
  homeDeclares = true;
}

/*
 * 5) Bayrak ve yapılandırma durumu okunabilir.
 *
 * «Kapalı aşama sessiz kalmıyor» kuralı burada da geçerli: sebebi olmayan bir
 * boşluk, hata ayıklarken en pahalı şey.
 */
{
  t(/açık/.test(storeSearchStatus()), `açıkken söylüyor: «${storeSearchStatus()}»`);
  t(getStoreSearch() !== null, "açıkken yol kuruluyor");
  t(getStoreSearch() === getStoreSearch(), "aynı yapılandırma aynı örneği veriyor");

  /*
   * İşaretleme okuma kapalıysa bulunan adaylar hiçbir şeye dönüşmüyor — ve bu,
   * «mağazada ürün yok» gibi görünüyor. Durum satırı bunu söylemeli.
   */
  const markup = process.env.ENABLE_MARKUP_EXTRACT;
  delete process.env.ENABLE_MARKUP_EXTRACT;
  t(
    /ENABLE_MARKUP_EXTRACT/.test(storeSearchStatus()),
    `çıkarıcı kapalıyken uyarıyor: «${storeSearchStatus()}»`,
  );
  process.env.ENABLE_MARKUP_EXTRACT = markup ?? "true";

  process.env.ENABLE_STORE_SEARCH = "false";
  t(/ENABLE_STORE_SEARCH/.test(storeSearchStatus()), "bayrak kapalı sebebiyle yazılıyor");
  t(getStoreSearch() === null, "bayrak kapalıyken yol kurulmuyor");
  process.env.ENABLE_STORE_SEARCH = "true";
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
