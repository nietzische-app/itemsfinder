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
      searchLiveProducts: async () => {
        log.search += 1;
        return fromSearch;
      },
      productsFromUrls: async () => {
        log.extract += 1;
        return fromUrls;
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
    trace.some((e) => e.source === "görsel" && e.found > 0),
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

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
