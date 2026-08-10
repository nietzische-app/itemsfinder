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
let errorMessage = "Quota exceeded for quota metric 'Queries'";
/** Kaç istek geldiği — kilidin çağrıyı gerçekten kestiğini ölçmenin tek yolu. */
let requests = 0;

const server = createServer((req, res) => {
  requests += 1;
  lastQuery = new URL(req.url, "http://x").searchParams;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify(
      status === 200
        ? { items: nextItems.map((link) => ({ link })) }
        : { error: { code: status, message: errorMessage } },
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

/*
 * Ortak örneğin kurulum kilidi kapalı (`cooldownMs = 0`).
 *
 * Kilit ayrı ayrı ölçülüyor; buradaki kontroller süzme ve sıralama hakkında ve
 * bir hata kontrolünün ardından gelenlerin sessizce atlanması, o kontrolleri
 * ölçüyor gibi görünüp hiçbir şey ölçmemesine yol açardı.
 */
const search = new GoogleProductSearch("stub-key", "stub-engine", 0);

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
  // Ham «Quota exceeded» değil, yapılacak işe çevrilmiş hâli taşınıyor.
  t(/kota/i.test(error ?? ""), `gerekçe yönergeye çevrilmiş hâlde taşınıyor: «${error}»`);
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

/*
 * 7) Hata mesajı yapılacak işe çevriliyor mu?
 *
 * Ham mesaj doğru ama eyleme geçirmiyor: «Requests to this API … are blocked»
 * cümlesi okuyan kişiye konsolda hangi düğmeye basacağını söylemiyor. Kurulumun
 * altı adımı var ve hangisinin atlandığı ancak buradan okunabiliyor.
 */
{
  const { cseAdvice } = await import("@/services/googleSearch");

  const cases = [
    ["Custom Search API has not been used in project 123 before or it is disabled", /Library.*Enable|Enable/i],
    ["Requests to this API customsearch method … are blocked", /Credentials|API restrictions/i],
    ["Invalid Value", /cx|kimliği/i],
    ["API key not valid. Please pass a valid API key.", /Anahtar geçersiz/i],
    ["Quota exceeded for quota metric 'Queries'", /kota/i],
  ];

  for (const [message, expected] of cases) {
    const advice = cseAdvice(message);
    t(expected.test(advice), `«${message.slice(0, 40)}…» → «${advice.slice(0, 60)}»`);
    t(advice !== message, `gerekçe yönergeye çevrildi: «${message.slice(0, 30)}…»`);
  }

  // Tanınmayan hata olduğu gibi kalmalı — uydurulmuş yönerge, yönergesizlikten kötü.
  const unknown = "Something nobody has seen before";
  t(cseAdvice(unknown) === unknown, "tanınmayan hata olduğu gibi bırakılıyor");

  /*
   * 7b) İki hata **ayrı** düğmeye basılmasını istiyor.
   *
   * İlk sürüm ikisini tek yönergede topluyordu ve üretimde yanlış olanı söyledi:
   * gelen mesaj «are blocked» idi, yani API değil anahtar kapalıydı, ama yönerge
   * Library sayfasına yolladı. Oradaki düğmeye basmak hatayı değiştirmiyor.
   *
   * Aynı metni vermeleri yetmez, **birbirinden farklı** olmaları gerekiyor —
   * ikisini de `/Enable/` ile ölçen bir kontrol, tek yönergeye geri dönülse bile
   * yeşil kalırdı.
   */
  const blocked = cseAdvice("Requests to this API customsearch method … are blocked.");
  const disabled = cseAdvice("Custom Search API has not been used in project 123 before or it is disabled");

  t(blocked !== disabled, "kapalı anahtar ile kapalı API ayrı yönerge alıyor");

  /*
   * Üçüncü cevap: kurulum hatası değil, **kapı kapalı**.
   *
   * Google, Custom Search JSON API'yi yeni müşterilere kapattı (1 Ocak 2027'de
   * tamamen kapanıyor). Yeni bir projede API'yi etkinleştirmek de anahtar
   * kısıtlamasını açmak da bu cevabı değiştirmiyor. Öteki hatalarla aynı cümleyi
   * vermek, olmayan bir düğmeyi aratmak olurdu — üretimde iki tur boyunca tam
   * olarak bu oldu.
   */
  const closed = cseAdvice("This project does not have the access to Custom Search JSON API.");

  t(closed !== disabled && closed !== blocked, "kapalı kapı öteki iki hatadan ayrı");
  t(!/Enable|Credentials/.test(closed), `konsolda düğme aratmıyor: «${closed.slice(0, 60)}…»`);
  t(/ENABLE_GOOGLE_CSE=false/.test(closed), `yapılacak işi söylüyor: «${closed.slice(0, 60)}…»`);
  t(/Credentials/.test(blocked), `anahtar kısıtlaması Credentials'a yolluyor: «${blocked.slice(0, 45)}…»`);
  t(!/^Custom Search API bu projede açık değil/.test(blocked), "kapalı anahtar Library'ye yollanmıyor");
  t(/Library/.test(disabled), `kapalı API Library'ye yolluyor: «${disabled.slice(0, 45)}…»`);
}

/*
 * 7c) Özetteki hata etiketi ilk cümlede kesiliyor.
 *
 * `[scan]` satırı özet olsun diye var; kör bir `slice(0, 40)` yönergeyi
 * ortasından kesip «Anahtar bu API'ye kapalı. Credentials → » gibi bir kırıntı
 * bırakıyordu.
 */
{
  const { createTrace, logScanTrace } = await import("@/lib/scanTrace");
  const { cseAdvice } = await import("@/services/googleSearch");
  const trace = createTrace({ detail: false });

  trace.search({
    itemId: "a", source: "cse", tier: "tr", rung: 0, query: "gri pantolon",
    found: 0, ms: 12,
    error: cseAdvice("Requests to this API customsearch method … are blocked."),
  });

  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    logScanTrace(trace.snapshot(), { id: "det_test", source: "stub" });
  } finally {
    console.log = original;
  }

  const [entry] = JSON.parse(lines.find((line) => line.startsWith("[scan] ")).slice(7)).searchYield;

  t(/\.$/.test(entry), `etiket cümlenin sonunda bitiyor: «${entry}»`);
  t(!/→\s*$/.test(entry), `ok işaretiyle yarım kalmıyor: «${entry}»`);
}

/*
 * 8) Motora tanımlı her mağaza öncelikli sayılıyor mu?
 *
 * Ölçülmüş bir uyumsuzluktan geldi: motora beş yeni mağaza eklendi (beymen,
 * vakko, flo, hepsiburada, mango) ama kodun öncelik listesinde yoktular, yani
 * sonuç verseler bile sıralamada arkaya düşüyorlardı. Sıra önemli çünkü çıkarma
 * aday listesini baştan tüketiyor.
 */
{
  const engineSites = [
    "beymen.com", "vakko.com", "flo.com.tr", "hepsiburada.com", "mango.com",
    "trendyol.com", "boyner.com.tr", "lcw.com", "defacto.com.tr", "mavi.com",
    "koton.com", "zara.com", "pullandbear.com", "stradivarius.com", "bershka.com",
    "hm.com", "amazon.com.tr", "sephora.com.tr", "gratis.com", "watsons.com.tr",
    "rossmann.com.tr",
  ];

  const missed = [];
  for (const domain of engineSites) {
    // Bilinmeyen bir mağazayla yan yana koyup hangisinin öne geçtiğine bak.
    nextItems = [
      "https://www.bilinmeyenmagaza.com.tr/a-p-111111111",
      `https://www.${domain}/urun-p-222222222`,
    ];
    const { urls } = await search.findProductPages("triko", "clothing");
    if (!urls[0]?.includes(domain)) missed.push(domain);
  }

  t(
    missed.length === 0,
    `motora tanımlı her mağaza öncelikli: eksik ${JSON.stringify(missed)}`,
  );
  console.log(`  motora tanımlı ${engineSites.length} mağazanın hepsi öncelik listesinde`);
}

/*
 * 9) Kurulum hatasından sonra susuyor mu?
 *
 * Üretimde ölçüldü: Custom Search API kapalıyken **tek** bir taramada dört parça
 * için dört ayrı çağrı yapıldı, dördü de aynı «are blocked» cevabını aldı ve log
 * sekiz özdeş satırla doldu. Kapalı bir API sorgu değiştirerek açılmıyor.
 *
 * Ölçülen şey mesaj değil **gidiş dönüş**: ikinci çağrının sunucuya hiç
 * ulaşmaması gerekiyor. Sunucuya sayaç bunun için kondu — «boş döndü» kontrolü
 * kilit hiç çalışmasa da yeşil kalırdı.
 */
{
  const latching = new GoogleProductSearch("stub-key", "stub-engine");
  status = 403;
  errorMessage = "Requests to this API customsearch method … are blocked.";

  const before = requests;
  const first = await latching.findProductPages("gri pantolon", "clothing");
  const afterFirst = requests;
  const second = await latching.findProductPages("gümüş ayakkabı", "clothing");

  t(afterFirst === before + 1, `ilk çağrı gerçekten gidiyor (${afterFirst - before})`);
  t(/Credentials/.test(first.error ?? ""), `ilk çağrının gerekçesi yönerge: «${first.error}»`);
  t(requests === afterFirst, `ikinci çağrı hiç gitmiyor (${requests - afterFirst} istek)`);
  t(
    /çağrı yapılmadı/.test(second.error ?? ""),
    `atlanan çağrı kendini böyle bildiriyor: «${second.error}»`,
  );

  // Aynı koşulda kilitsiz örnek gidiyor — yani yukarıdaki kontrol boş değil.
  const openBefore = requests;
  await search.findProductPages("gri pantolon", "clothing");
  t(requests === openBefore + 1, "kilitsiz örnek aynı hatada denemeye devam ediyor");

  status = 200;
  errorMessage = "Quota exceeded for quota metric 'Queries'";
}

/*
 * 10) Geçici hata kilitlemiyor.
 *
 * Kilit «bu kurulum bozuk» demek, «bu istek tutmadı» demek değil. Sunucu hatası
 * ya da zaman aşımı bir sonraki denemede geçebilir; onları da susturmak,
 * çalışan bir kurulumu bir dakikalığına kapatırdı.
 */
{
  const transient = new GoogleProductSearch("stub-key", "stub-engine");
  status = 500;
  errorMessage = "Backend Error";

  const before = requests;
  const first = await transient.findProductPages("triko", "clothing");
  await transient.findProductPages("triko", "clothing");

  t(requests === before + 2, `tanınmayan hata kilitlemiyor (${requests - before} istek)`);
  t(first.error === "Backend Error", `tanınmayan hata olduğu gibi taşınıyor: «${first.error}»`);

  status = 200;
  errorMessage = "Quota exceeded for quota metric 'Queries'";
}

// 11) Kilit süreli — süresi dolunca yeniden deneniyor.
{
  const brief = new GoogleProductSearch("stub-key", "stub-engine", 5);
  status = 403;
  errorMessage = "Requests to this API customsearch method … are blocked.";
  await brief.findProductPages("triko", "clothing");

  const blocked = requests;
  await brief.findProductPages("triko", "clothing");
  t(requests === blocked, "süre dolmadan susuyor");

  status = 200;
  nextItems = ["https://www.trendyol.com/a/urun-p-555555555"];
  await new Promise((resolve) => setTimeout(resolve, 20));
  const { urls } = await brief.findProductPages("triko", "clothing");

  t(requests === blocked + 1, "süre dolunca yeniden deniyor");
  t(urls.length === 1, `kurulum düzelirse aday yine geliyor (${urls.length})`);

  errorMessage = "Quota exceeded for quota metric 'Queries'";
}

/*
 * 12) Parça başına yeni örnek üretilmiyor.
 *
 * Kilit örnek durumu ve `discoverCandidates` her parça için `getGoogleSearch()`
 * çağırıyor. Her çağrıda yeni bir örnek dönseydi kilit hiçbir şey tutmazdı ve
 * üretimde ölçülen dört özdeş çağrı aynen tekrarlanırdı.
 */
{
  t(getGoogleSearch() === getGoogleSearch(), "aynı yapılandırma aynı örneği veriyor");

  const own = process.env.GOOGLE_CSE_ID;
  const first = getGoogleSearch();
  process.env.GOOGLE_CSE_ID = "baska-motor";
  t(getGoogleSearch() !== first, "yapılandırma değişince örnek yenileniyor");
  process.env.GOOGLE_CSE_ID = own;
}

/*
 * 13) `[scan]` özeti Google'ı kendi adıyla yazıyor mu?
 *
 * İlk hâli `görsel` dışındaki her şeye katman adını yazıyordu ve üretimde yanlış
 * yeri suçladı: Google'ın reddettiği dört çağrı `tr:0=HATA…` diye göründü, yani
 * satırı okuyan kişi context.dev'in Türkiye katmanının bozulduğunu sanırdı.
 */
{
  const { createTrace, logScanTrace } = await import("@/lib/scanTrace");
  const trace = createTrace({ detail: false });

  trace.search({
    itemId: "a", source: "cse", tier: "tr", rung: 0,
    query: "gri pantolon", found: 0, ms: 12,
    error: "Custom Search API bu projede açık değil.",
  });
  trace.search({
    itemId: "b", source: "metin", tier: "tr", rung: 1,
    query: "gri pantolon satın al", found: 2, ms: 30,
  });

  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    logScanTrace(trace.snapshot(), { id: "det_test", source: "stub" });
  } finally {
    console.log = original;
  }

  const yielded = JSON.parse(lines.find((line) => line.startsWith("[scan] ")).slice(7)).searchYield;

  t(
    yielded.some((entry) => entry.startsWith("cse:")),
    `Google başarısızlığı «cse:» diye yazılıyor: ${JSON.stringify(yielded)}`,
  );
  t(
    !yielded.some((entry) => entry.startsWith("tr:0=HATA")),
    `context.dev katmanı suçlanmıyor: ${JSON.stringify(yielded)}`,
  );
  t(
    yielded.some((entry) => entry === "tr:1=2"),
    `metin merdiveni katman adıyla kalıyor: ${JSON.stringify(yielded)}`,
  );
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
