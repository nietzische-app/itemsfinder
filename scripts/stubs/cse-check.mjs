/**
 * Google Programmable Search ile aday bulma — `node scripts/stubs/cse-check.mjs`.
 *
 * Aday bulma zincirin ilk halkası ve tek satıcıya bağlıydı: `web.search` ölünce
 * (üretimde `401 USAGE_EXCEEDED`) çıkarılacak sayfa da kalmıyordu.
 *
 * Ölçülen şey kalite değil **karar** — kotayı ve sonuç kalitesini bu ortamdan
 * ölçmek mümkün değil. Ölçülen: hangi adres ürün sayfası sayılıyor, mağaza
 * olmayan ana bilgisayar eleniyor mu, hata nasıl bildiriliyor, ve boş dönünce
 * merdiven gerçekten devreye giriyor mu.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

let nextItems = [];
let status = 200;
let lastQuery = null;

const server = createServer((req, res) => {
  lastQuery = new URL(req.url, "http://x").searchParams;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify(
      status === 200
        ? { items: nextItems.map((link) => ({ link })) }
        : { error: { code: status, message: "Quota exceeded for quota metric 'Queries'" } },
    ),
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.GOOGLE_CSE_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ENABLE_GOOGLE_CSE = "true";
process.env.GOOGLE_CSE_ID = "stub-engine";
process.env.GOOGLE_CSE_API_KEY = "stub-key";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { GoogleProductSearch, getGoogleSearch, googleSearchStatus } = await import(
  "@/services/googleSearch"
);

const search = new GoogleProductSearch("stub-key", "stub-engine");

// 1) Ürün sayfası geçer; arama, kategori ve mağaza olmayan adres geçmez.
{
  nextItems = [
    "https://www.trendyol.com/marka/urun-p-123456789",
    "https://www.trendyol.com/sr?q=triko",
    "https://www.boyner.com.tr/kadin-triko-c-1234",
    /*
     * Instagram, pinterest değil — ve bu ayrım kasıtlı. Pinterest'i şekil süzgeci
     * zaten eliyor, yani onunla yazılan bir kontrol mağaza kapısını ölçmüyor,
     * yalnızca ölçtüğünü sanıyor. `instagram.com/p/<kimlik>` ise Mango ve H&M için
     * yazılmış kalıba uyuyor ve görsel yolda tam da bu yüzden ürün sayfası
     * sayılmıştı.
     */
    "https://www.instagram.com/p/AbCdEf/",
    "https://www.zara.com/tr/tr/triko-ceket-p04387042.html",
  ];
  const { urls, seen } = await search.findProductPages("triko ceket", "clothing");

  t(seen === 5, `gelen sonuç sayılıyor (${seen})`);
  t(urls.length === 2, `yalnızca ürün sayfaları kaldı (${urls.length})`);
  t(!urls.some((u) => /instagram/.test(u)), `mağaza olamayacak ana bilgisayar elendi: ${JSON.stringify(urls)}`);
}

/*
 * 1b) Tanımadığımız bir mağaza da geçebilmeli — global arama bunun için var.
 *
 * İlk sürümde burada izin listesi vardı ve yalnızca 17 perakendeci geçiyordu;
 * motor bütün web'i tarasa da sonuç o listeye iniyordu, yani «global» sözü
 * boştu. Asıl garanti izin listesi değil **fiyat kanıtı**: her iki çıkarma yolu
 * da fiyatsız sayfayı reddediyor, yani bir blog yazısı karta dönüşemiyor.
 */
{
  nextItems = [
    "https://www.instagram.com/p/AbCdEf/",
    "https://www.vogue.com/article/moda-p-123456",
    "https://www.bilinmeyenmagaza.com.tr/kadin-triko-p-987654321",
  ];
  const { urls } = await search.findProductPages("triko", "clothing");

  t(
    urls.some((u) => /bilinmeyenmagaza/.test(u)),
    `tanınmayan mağaza geçiyor: ${JSON.stringify(urls)}`,
  );
  t(
    !urls.some((u) => /instagram|vogue/.test(u)),
    `sosyal ve yayın adresleri eleniyor: ${JSON.stringify(urls)}`,
  );
}

// 1c) Bilinen perakendeci öne alınıyor — eleme değil sıralama.
{
  nextItems = [
    "https://www.bilinmeyenmagaza.com.tr/a-p-111111111",
    "https://www.trendyol.com/a/urun-p-222222222",
  ];
  const { urls } = await search.findProductPages("triko", "clothing");
  t(urls[0]?.includes("trendyol"), `bilinen mağaza başta: ${JSON.stringify(urls)}`);
  t(urls.length === 2, `öteki elenmedi, sadece sonra geldi (${urls.length})`);
}

// 2) Mağaza başına tek aday.
{
  nextItems = [
    "https://www.trendyol.com/a/urun-p-111111111",
    "https://www.trendyol.com/a/urun-p-222222222",
    "https://www.boyner.com.tr/b-p-333333333",
  ];
  const { urls } = await search.findProductPages("gömlek", "clothing");
  const hosts = urls.map((u) => new URL(u).hostname);
  t(new Set(hosts).size === hosts.length, `mağaza başına tek aday (${JSON.stringify(hosts)})`);
}

// 3) Sorgu gerçekten gönderiliyor ve motor kimliği taşınıyor.
{
  nextItems = ["https://www.trendyol.com/a/urun-p-444444444"];
  await search.findProductPages("bej bluz", "clothing");
  t(lastQuery.get("q") === "bej bluz", `sorgu gönderiliyor: «${lastQuery.get("q")}»`);
  t(lastQuery.get("cx") === "stub-engine", "motor kimliği gönderiliyor");
}

// 4) Kota hatası: boş dönüyor, fırlatmıyor, ve gerekçe taşınıyor.
{
  status = 429;
  const { urls, error } = await search.findProductPages("triko", "clothing");
  t(urls.length === 0, "kota hatasında boş dönüyor");
  t(/Quota/.test(error ?? ""), `gerekçe taşınıyor: «${error}»`);
  status = 200;
}

// 5) Bayrak ve yapılandırma durumu okunabilir.
{
  t(googleSearchStatus() === "açık", `her şey yerindeyken «açık»: «${googleSearchStatus()}»`);

  process.env.ENABLE_GOOGLE_CSE = "false";
  t(/ENABLE_GOOGLE_CSE/.test(googleSearchStatus()), "bayrak kapalı sebebiyle yazılıyor");
  t(getGoogleSearch() === null, "bayrak kapalıyken yol kurulmuyor");
  process.env.ENABLE_GOOGLE_CSE = "true";

  const id = process.env.GOOGLE_CSE_ID;
  delete process.env.GOOGLE_CSE_ID;
  t(/GOOGLE_CSE_ID/.test(googleSearchStatus()), "motor kimliği eksikliği yazılıyor");
  t(getGoogleSearch() === null, "motor kimliği yoksa yol kurulmuyor");
  process.env.GOOGLE_CSE_ID = id;
}

/*
 * 6) Vision anahtarı yeniden kullanılabiliyor.
 *
 * Custom Search API aynı Google Cloud projesinde açılabiliyor, yani ayrı bir
 * anahtar zorunlu değil. Anahtar okuması burada da tek yerden geçmeli — görsel
 * yolda takma adın görülmemesi tam olarak bu tür bir ayrışmadan doğmuştu.
 */
{
  const own = process.env.GOOGLE_CSE_API_KEY;
  delete process.env.GOOGLE_CSE_API_KEY;
  process.env.GOOGLE_VISION_API_KEY = "vision-anahtari";

  t(googleSearchStatus() === "açık", `Vision anahtarı devralınıyor: «${googleSearchStatus()}»`);
  t(getGoogleSearch() !== null, "Vision anahtarıyla yol kuruluyor");

  delete process.env.GOOGLE_VISION_API_KEY;
  process.env.GOOGLE_CSE_API_KEY = own;
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
