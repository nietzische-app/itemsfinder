/**
 * Görsel aday bulma yolu — `node scripts/stubs/lens-check.mjs`.
 *
 * Giysi kırpımını Vision'ın `WEB_DETECTION`'ına sorup dönen sayfalardan ürün
 * adresi süzen yol. Metin sorgusundan geçmiyor, yani «giysiyi kelimeye çevir,
 * kelimeyi ara» adımındaki kaybı atlıyor.
 *
 * Anahtar gerektiriyor, o yüzden burada Vision'ın **şekli** taklit ediliyor: yerel
 * bir sunucu `WEB_DETECTION` cevabı döndürüyor ve `VISION_BASE_URL` oraya
 * çevriliyor — `eval:record` için yazılan stub'larla aynı desen.
 *
 * Ölçülen şey kalite değil **karar**: hangi adres ürün sayfası sayılıyor, kredi
 * nerede harcanıyor, ve görsel yol boş dönünce metin merdiveni gerçekten devreye
 * giriyor mu. Kalite ancak gerçek anahtarla ölçülebilir.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/* -------------------------------------------------------------------------- */
/*  Vision şeklinde sahte sunucu                                              */
/* -------------------------------------------------------------------------- */

let nextPayload = { webDetection: {} };
let status = 200;
let calls = 0;

const server = createServer((req, res) => {
  calls += 1;
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(status === 200 ? { responses: [nextPayload] } : { error: "patladı" }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

// Modül yüklenirken okunuyor, o yüzden import'tan önce.
process.env.VISION_BASE_URL = `http://127.0.0.1:${port}`;
process.env.GOOGLE_CLOUD_VISION_API_KEY = "stub";
process.env.ENABLE_VISION_LENS = "true";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { VisionWebLookup, getVisualLookup } = await import("@/services/visualLookup");
const { ContextDevProductProvider } = await import("@/services/productProvider");
const { MOCK_SCENARIOS, hydrateItems } = await import("@/services/mockCatalog");

const lookup = new VisionWebLookup("stub");
const pages = (...urls) => ({ webDetection: { pagesWithMatchingImages: urls.map((url) => ({ url })) } });

/* -------------------------------------------------------------------------- */
/*  1. Süzme: ürün sayfası geçer, liste ve arama sayfası geçmez               */
/* -------------------------------------------------------------------------- */

{
  nextPayload = pages(
    "https://www.trendyol.com/marka/urun-p-123456789",
    "https://www.trendyol.com/sr?q=triko",              // arama
    "https://www.boyner.com.tr/kadin-triko-c-1234",     // kategori
    "https://www.zara.com/tr/tr/triko-ceket-p04387042.html",
  );
  const { urls, seen } = await lookup.findProductPages("aaa");

  t(seen === 4, `gelen aday sayısı sayılıyor (${seen})`);
  t(urls.length === 2, `yalnızca ürün sayfaları kaldı (${urls.length})`);
  t(
    urls.every((u) => !/[?&]q=|-c-\d+/.test(u)),
    `arama ve kategori adresleri elendi: ${JSON.stringify(urls)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Mağaza başına bir aday — aynı rafı on kez çıkarmak kredi yakmak         */
/* -------------------------------------------------------------------------- */

{
  nextPayload = pages(
    "https://www.trendyol.com/a/urun-p-111111111",
    "https://www.trendyol.com/a/urun-p-222222222",
    "https://www.trendyol.com/a/urun-p-333333333",
    "https://www.boyner.com.tr/a-p-444444444",
  );
  const { urls } = await lookup.findProductPages("aaa");

  const hosts = urls.map((u) => new URL(u).hostname);
  t(new Set(hosts).size === hosts.length, `mağaza başına tek aday (${JSON.stringify(hosts)})`);
  t(urls.length === 2, `iki mağazadan iki aday (${urls.length})`);
}

/* -------------------------------------------------------------------------- */
/*  3. Sayfa listesi öncelikli, görsel adresleri sonra                         */
/* -------------------------------------------------------------------------- */

{
  nextPayload = {
    webDetection: {
      visuallySimilarImages: [{ url: "https://www.lcw.com/z-o-99999" }],
      pagesWithMatchingImages: [{ url: "https://www.trendyol.com/a/urun-p-555555555" }],
    },
  };
  const { urls } = await lookup.findProductPages("aaa");
  t(
    urls[0]?.includes("trendyol"),
    `eşleşen sayfa, benzer görselden önce geliyor (${JSON.stringify(urls)})`,
  );
}

/* -------------------------------------------------------------------------- */
/*  4. Çekimserlik: hata da boş cevap da taramayı durdurmuyor                 */
/* -------------------------------------------------------------------------- */

{
  status = 500;
  const { urls } = await lookup.findProductPages("aaa");
  t(urls.length === 0, "Vision hatası boş dönüyor, fırlatmıyor");
  status = 200;
}

{
  nextPayload = { webDetection: {} };
  const { urls, seen } = await lookup.findProductPages("aaa");
  t(urls.length === 0 && seen === 0, "boş cevap boş sonuç");
}

{
  nextPayload = pages("https://www.trendyol.com/sr?q=triko");
  const { urls, seen } = await lookup.findProductPages("aaa");
  t(seen === 1 && urls.length === 0, "hepsi elenirse boş — ama geldiği sayılıyor");
}

/* -------------------------------------------------------------------------- */
/*  5. Bayrak kapalıyken tek çağrı bile yapılmıyor                            */
/* -------------------------------------------------------------------------- */

{
  process.env.ENABLE_VISION_LENS = "false";
  t(getVisualLookup() === null, "bayrak kapalıyken yol kurulmuyor");
  process.env.ENABLE_VISION_LENS = "true";
  t(getVisualLookup() !== null, "bayrak açıkken yol kuruluyor");
}

/* -------------------------------------------------------------------------- */
/*  6. Sağlayıcı: görsel yol bulursa metin araması hiç yapılmıyor             */
/* -------------------------------------------------------------------------- */

const items = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);
const RESULT = {
  items,
  source: "mock",
  productSource: "mock",
  liveItemCount: 0,
  id: "x",
  processedAt: "",
  durationMs: 0,
};

/** 1×1 PNG — kırpma için gerçek piksel gerekiyor. */
const sharp = (await import("sharp")).default;
const photo = await sharp({
  create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 120, b: 140 } },
})
  .png()
  .toBuffer();

const card = (url) => ({
  title: "Pembe Fermuarlı Triko Hırka",
  price: 500,
  currency: "TRY",
  merchantName: "Trendyol",
  merchantDomain: "trendyol.com",
  productUrl: url,
  imageUrl: null,
  inStock: true,
  brand: null,
  rating: null,
  reviewCount: null,
});

function makeProvider({ fromUrls, fromSearch }) {
  const log = { search: 0, extract: 0 };
  const provider = new ContextDevProductProvider(
    {
      findCandidateUrls: async () => {
        log.search += 1;
        return fromSearch.map((c) => c.productUrl);
      },
      /*
       * Artık iki yol da buradan geçiyor: aday bulma ile kart çıkarma ayrıldı.
       * Ayrımın kendisi ölçülmüş bir kusurdan geldi — işaretleme okuma yolu
       * yalnızca görsel dala takılıydı, çünkü metin dalının çıkarımı servisin
       * içine gömülüydü.
       */
      productsFromUrls: async (urls) => {
        log.extract += 1;
        return urls.length > 0 ? fromUrls : [];
      },
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 1, deadlineMs: 20000, visualRerank: false },
  );
  return { provider, log };
}

{
  nextPayload = pages("https://www.trendyol.com/a/urun-p-777777777");
  const { provider, log } = makeProvider({
    fromUrls: [card("https://www.trendyol.com/a/urun-p-777777777")],
    fromSearch: [card("https://www.boyner.com.tr/b-p-888888888")],
  });
  const trace = [];
  await provider.enrich(RESULT, {
    image: { buffer: photo },
    trace: { search: (e) => trace.push(e), reject() {}, degrade() {} },
  });

  t(log.extract === 1, `görsel adaylar çıkarıldı (${log.extract})`);
  t(log.search === 0, `görsel yol bulunca metin araması yapılmadı (${log.search})`);
  t(
    trace.some((e) => e.source === "görsel" && e.found > 0 && typeof e.ms === "number"),
    `muhasebe görsel kaynağı yazıyor: ${JSON.stringify(trace)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  7. Görsel yol boş dönerse metin merdiveni devreye giriyor                 */
/* -------------------------------------------------------------------------- */

{
  nextPayload = pages("https://www.trendyol.com/sr?q=hepsi-elenecek");
  const { provider, log } = makeProvider({
    fromUrls: [],
    fromSearch: [card("https://www.boyner.com.tr/b-p-888888888")],
  });
  const trace = [];
  await provider.enrich(RESULT, {
    image: { buffer: photo },
    trace: { search: (e) => trace.push(e), reject() {}, degrade() {} },
  });

  t(log.search === 1, `görsel boş dönünce metin merdiveni çalıştı (${log.search})`);
  t(
    trace.some((e) => e.source === "görsel" && e.found === 0),
    "boşa giden görsel arama da muhasebeye yazıldı",
  );
}

/* -------------------------------------------------------------------------- */
/*  8. Fotoğraf yoksa görsel yol denenmiyor                                   */
/* -------------------------------------------------------------------------- */

{
  const before = calls;
  const { provider, log } = makeProvider({
    fromUrls: [],
    fromSearch: [card("https://www.boyner.com.tr/b-p-888888888")],
  });
  await provider.enrich(RESULT, {});

  t(calls === before, `fotoğrafsız taramada Vision çağrılmadı (${calls - before})`);
  t(log.search === 1, "fotoğrafsız taramada metin merdiveni çalıştı");
}

/* -------------------------------------------------------------------------- */
/*  9. İşaretleme okuma yolu METİN dalında da çalışıyor mu                    */
/* -------------------------------------------------------------------------- */

/*
 * Üretimde ölçülen kusur: `ENABLE_MARKUP_EXTRACT=true` iken tek bir `[markup]`
 * satırı çıkmadı. Sebep, yolun yalnızca görsel arama dalına takılı olmasıydı —
 * metin dalının çıkarımı `searchLiveProducts`'ın **içine** gömülüydü, yani ana
 * yolda hiç uğranmıyordu. Aday bulma ile kart çıkarma ayrıldı; bu kontrol
 * ayrımın gerçekten işe yaradığını ölçüyor.
 */
{
  process.env.ENABLE_MARKUP_EXTRACT = "true";
  nextPayload = { webDetection: {} }; // görsel yol boş → metin dalına düşülüyor

  const log = { search: 0, extract: 0 };
  const provider = new ContextDevProductProvider(
    {
      findCandidateUrls: async () => {
        log.search += 1;
        return ["https://www.trendyol.com/a/urun-p-999999999"];
      },
      productsFromUrls: async () => {
        log.extract += 1;
        return [card("https://www.trendyol.com/a/urun-p-999999999")];
      },
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 1, deadlineMs: 20000, visualRerank: false },
  );

  /*
   * Ölçülen şey `[markup]` satırının çıkması.
   *
   * İlk hâlinde `productsFromUrls` çağrıldı mı diye bakmıştım ve kontrol
   * **ısırmıyordu**: eski wiring'de de o çağrılıyor, çünkü metin dalı doğrudan
   * ona gidiyordu. Ayırt edici olan işaretlemenin *denenmesi* — ve kullanıcının
   * «markup çıkmadı» derken kastettiği şey de tam olarak bu satırdı.
   */
  const lines = [];
  const realLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await provider.enrich(RESULT, { image: { buffer: photo } });
  } finally {
    console.log = realLog;
  }

  t(log.search === 1, `metin dalı aday buldu (${log.search})`);
  t(
    lines.some((line) => line.startsWith("[markup]")),
    `metin dalında işaretleme denendi: ${JSON.stringify(lines)}`,
  );
  // Okunamayınca `web.extract` geri düşüşü çalışmalı — açmak bir şey kaybettirmemeli.
  t(log.extract === 1, `okunamayınca çıkarıma düşüldü (${log.extract})`);

  delete process.env.ENABLE_MARKUP_EXTRACT;
}

/* -------------------------------------------------------------------------- */
/*  10. Aday yokken «okunamadı» denmemeli                                     */
/* -------------------------------------------------------------------------- */

/*
 * Üretim logu `degraded` içine iki kez «0 sayfanın işaretlemesi okunamadı»
 * yazdı. Okunamayan bir şey yoktu: arama 401 aldığı için hiç aday dönmemişti.
 * Olmayan bir başarısızlığı raporlamak, gerçek arızaların arasına gürültü
 * katıyor — ve `degraded` arayüzde amber bir uyarı olarak çiziliyor.
 */
{
  process.env.ENABLE_MARKUP_EXTRACT = "true";
  nextPayload = { webDetection: {} };

  const notes = [];
  let extractCalls = 0;
  const provider = new ContextDevProductProvider(
    {
      findCandidateUrls: async () => [],
      productsFromUrls: async () => {
        extractCalls += 1;
        return [];
      },
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 1, deadlineMs: 20000, visualRerank: false },
  );

  await provider.enrich(RESULT, {
    image: { buffer: photo },
    trace: { search() {}, reject() {}, degrade: (stage, reason) => notes.push(reason) },
  });

  t(
    !notes.some((reason) => /okunamadı/.test(reason)),
    `aday yokken «okunamadı» denmiyor: ${JSON.stringify(notes)}`,
  );
  t(extractCalls === 0, `aday yokken çıkarım da çağrılmıyor (${extractCalls})`);

  delete process.env.ENABLE_MARKUP_EXTRACT;
}

/* -------------------------------------------------------------------------- */
/*  11. Görsel yol devre dışıysa sebebini söylüyor mu                         */
/* -------------------------------------------------------------------------- */

/*
 * Üç ayrı üretim çalıştırmasında `img:` kaydı hiç çıkmadı ve her seferinde
 * sebebini tahmin etmek zorunda kaldık: bayrak mı, anahtar mı, fotoğraf mı.
 * Yol sessizce devre dışı kalıyordu. «Kapalı» olmak arıza değil; **görünmez**
 * olmak arıza.
 */
{
  const { visualLookupStatus } = await import("@/services/visualLookup");

  process.env.ENABLE_VISION_LENS = "false";
  t(/ENABLE_VISION_LENS/.test(visualLookupStatus()), `bayrak kapalı sebebiyle: «${visualLookupStatus()}»`);

  process.env.ENABLE_VISION_LENS = "true";
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  delete process.env.GOOGLE_CLOUD_VISION_API_KEY;
  t(/API_KEY/.test(visualLookupStatus()), `anahtar eksikliği sebebiyle: «${visualLookupStatus()}»`);

  /*
   * Takma ad da tanınmalı — ve bu, üretimde ölçülmüş bir kusurun kapısı.
   *
   * Dedektör `GOOGLE_VISION_API_KEY`'i de kabul ediyordu; sonradan yazılan görsel
   * yol yalnızca uzun adı okuyordu. Kullanıcı kısa adı ayarlamıştı, yani aynı
   * taramanın logunda `source: "google-vision"` ile `[lens] kapalı — … yok`
   * yan yana yazıyordu. Anahtar okuması artık tek yerde (`services/visionKey.ts`);
   * bu kontrol o tekliğin bozulmadığını ölçüyor.
   */
  process.env.GOOGLE_VISION_API_KEY = "takma-ad";
  t(visualLookupStatus() === "açık", `takma ad tanınıyor: «${visualLookupStatus()}»`);
  t(getVisualLookup() !== null, "takma adla yol kuruluyor");
  delete process.env.GOOGLE_VISION_API_KEY;

  process.env.GOOGLE_CLOUD_VISION_API_KEY = key;
  t(visualLookupStatus() === "açık", `her şey yerindeyken «açık»: «${visualLookupStatus()}»`);

  // Ve durum satırı gerçekten her taramada basılıyor mu?
  const lines = [];
  const realLog = console.log;
  const provider = new ContextDevProductProvider(
    {
      findCandidateUrls: async () => [],
      productsFromUrls: async () => [],
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 1, deadlineMs: 20000, visualRerank: false },
  );
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await provider.enrich(RESULT, { image: { buffer: photo } });
  } finally {
    console.log = realLog;
  }
  t(
    lines.some((line) => line.startsWith("[lens]")),
    `durum satırı her taramada yazılıyor: ${JSON.stringify(lines)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  11b. Mağaza olmayan ana bilgisayar ürün sayfası sayılmamalı               */
/* -------------------------------------------------------------------------- */

/*
 * Bu kontrolü yazarken gerçek bir kusur çıktı: `instagram.com/p/AbCdEf/`, Mango
 * ve H&M için yazılmış `/p/<kimlik>` kalıbına uyuyor ve ürün sayfası sayılıyordu.
 * Tersine görsel arama bir moda fotoğrafında bolca Instagram ve Pinterest
 * döndürüyor, yani bu yol açılsaydı «Ürüne git» bir gönderiye gidebilirdi.
 */
{
  nextPayload = pages(
    "https://www.instagram.com/p/AbCdEf/",
    "https://tr.pinterest.com/pin/123456789/",
    "https://www.trendyol.com/marka/urun-p-123456789",
  );
  const { urls } = await lookup.findProductPages("aaa");

  t(
    !urls.some((u) => /instagram|pinterest/.test(u)),
    `sosyal medya adresi ürün sayfası sayılmıyor: ${JSON.stringify(urls)}`,
  );
  t(
    urls.some((u) => u.includes("trendyol")),
    `gerçek mağaza yine geçiyor: ${JSON.stringify(urls)}`,
  );
}

/* -------------------------------------------------------------------------- */
/*  12. Kayıp nerede olduğunu söylüyor mu                                     */
/* -------------------------------------------------------------------------- */

/*
 * Üretimde iki satır kaybın **büyüklüğünü** söyledi ama **sebebini** söylemedi:
 *
 *   «görsel arama 41 sonuç buldu, hiçbiri ürün sayfası değildi»
 *   «[markup] 1 sayfa, 0 satır okundu»
 *
 * Birincisinde asıl soru şu: Vision blog ve Pinterest mi döndürdü, yoksa gerçek
 * mağaza adreslerini şekil süzgecim mi reddetti? İkisi bambaşka işler gerektiriyor
 * — «görsel arama bu iş için uygun değil» ile «süzgecim eksik».
 */
{
  const lines = [];
  const realWarn = console.warn;

  nextPayload = pages(
    "https://tr.pinterest.com/pin/123456789/",
    "https://www.instagram.com/p/AbCdEf/",
    "https://blog.example.com/2024/moda-trendleri",
    "https://www.trendyol.com/sr?q=triko",
  );

  console.warn = (...args) => lines.push(args.join(" "));
  try {
    await lookup.findProductPages("aaa");
  } finally {
    console.warn = realWarn;
  }

  const summary = lines.find((line) => line.includes("hiçbiri ürün sayfası değil")) ?? "";
  t(summary.length > 0, `elenme özeti yazılıyor: ${JSON.stringify(lines)}`);
  t(/pinterest/.test(summary), `elenen ana bilgisayarlar adıyla yazılıyor: «${summary}»`);
  t(/\b4\b/.test(summary), `kaç sonuç geldiği yazılıyor: «${summary}»`);
}

// 13) İşaretleme okunamayınca sayfa başına sebep yazılıyor mu?
{
  const lines = [];
  const realLog = console.log;
  const { productsFromMarkup } = await import("@/services/markupProducts");

  console.log = (...args) => lines.push(args.join(" "));
  try {
    // Bu ortamdan mağazaya ağ yolu yok; sebep ne olursa olsun yazılmalı.
    await productsFromMarkup(["https://www.trendyol.com/a/urun-p-123456789"]);
  } finally {
    console.log = realLog;
  }

  const summary = lines.find((line) => line.startsWith("[markup]")) ?? "";
  t(summary.length > 0, "markup özeti yazılıyor");
  t(
    /trendyol\.com: .+/.test(summary),
    `sayfa başına sebep, ana bilgisayar adıyla yazılıyor: «${summary}»`,
  );
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
