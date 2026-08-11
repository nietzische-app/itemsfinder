/**
 * Kırpıma bakan ücretsiz taban — `node scripts/stubs/crop-label-check.mjs`
 *
 * ## Neden var
 *
 * Kaba sınıf bugün fotoğrafın **tamamına** sorulan tek bir Vision çağrısından
 * geliyor; kırpımlar hesaplanıyor ama kimseye sorulmuyor. Tavan bu:
 * `docs/BULUNAMADI.md`'de beyaz bir sneaker için sorgu «Beyaz Footwear».
 *
 * Bir VLM bu işi daha iyi yapardı, ama iki tur boyunca ücretsiz anahtar
 * edinilemedi ve bu projede ödeme bir kısıt. Vision anahtarı zaten çalışıyor.
 *
 * ## Ne ölçüyor
 *
 * En kritik iki şey **süzgeç** ve **hizalama**. Bir kırpımda ten, arka plan ve
 * komşu parçalar da var; Vision hepsini etiketliyor. Süzgeçsiz «en yüksek skor»
 * bir ayakkabıya «Human leg» yazdırırdı. Ve kırpılamayan bir parça istekten
 * düştüğünde, cevapları gönderilen listeyle değil özgün listeyle eşlemek her
 * etiketi bir parça kaydırırdı — sessizce yanlış, çünkü etiketler yine makul
 * görünür.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const seen = [];
let mode = "ok"; // "ok" | "auth" | "kota" | "server"

/** Kırpım sırasına göre dönecek etiket kümeleri. */
let labelSets = [];

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    seen.push({ path: req.url, requests: parsed.requests ?? [] });

    if (mode === "auth" || mode === "kota") {
      res.writeHead(mode === "auth" ? 403 : 429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "reddedildi" } }));
      return;
    }
    if (mode === "server") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "boom" } }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        responses: (parsed.requests ?? []).map((_, index) => ({
          labelAnnotations: labelSets[index] ?? [],
        })),
      }),
    );
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/v1/images:annotate`;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { CropLabelReader, cropLabelsBlocked, cropLabelStatus } = await import(
  "@/services/cropLabels"
);
const sharp = (await import("sharp")).default;

const image = await sharp({
  create: { width: 400, height: 800, channels: 3, background: { r: 200, g: 190, b: 170 } },
})
  .jpeg()
  .toBuffer();

const COOLDOWN = 400;
const reader = () =>
  new CropLabelReader("sahte-vision-anahtari", {
    baseUrl: base,
    cooldownMs: COOLDOWN,
    requestTimeoutMs: 5_000,
  });

const untilUnlocked = async () => {
  while (cropLabelsBlocked()) await new Promise((resolve) => setTimeout(resolve, 20));
};

const requests = [
  { key: "ust", itemType: "Top", box: { x: 0.1, y: 0.05, width: 0.5, height: 0.3 } },
  { key: "ayakkabi", itemType: "Footwear", box: { x: 0.1, y: 0.7, width: 0.4, height: 0.2 } },
];

/*
 * 1) İstek şekli ve toplu gönderim.
 *
 * Toplu göndermek **birim harcamıyor** — Vision görsel başına faturalandırıyor —
 * ama gidiş dönüşü kırpım sayısına değil taramaya bağlıyor. İki kırpım için iki
 * HTTP isteği atmak, gecikmeyi karşılıksız ikiye katlardı.
 */
{
  mode = "ok";
  seen.length = 0;
  labelSets = [
    [
      { description: "Sleeve", score: 0.95 },
      { description: "polo shirt", score: 0.88 },
      { description: "Beige", score: 0.8 },
    ],
    [{ description: "sneakers", score: 0.91 }],
  ];

  const result = await reader().read(image, requests);

  t(seen.length === 1, `iki kırpım tek istekte gidiyor (${seen.length})`);
  t(seen[0]?.requests?.length === 2, `istekte iki görsel var (${seen[0]?.requests?.length})`);
  t(
    seen[0]?.requests?.[0]?.features?.[0]?.type === "LABEL_DETECTION",
    `istenen özellik: ${seen[0]?.requests?.[0]?.features?.[0]?.type}`,
  );
  t((seen[0]?.requests?.[0]?.image?.content?.length ?? 0) > 100, "kırpım gerçekten gönderiliyor");

  t(result.get("ust") === "polo shirt", `üst parça adlandırıldı: ${result.get("ust")}`);
  t(result.get("ayakkabi") === "sneakers", `ayakkabı adlandırıldı: ${result.get("ayakkabi")}`);
}

/*
 * 2) **Aile süzgeci** — asıl iddia.
 *
 * "Sleeve" 0.95 ile en yüksek skorlu etiketti ve seçilmedi; 0.88'lik
 * "polo shirt" seçildi. Süzgeçsiz bir «en yüksek skor» seçimi bir giysiye
 * «Kol» dedirtirdi, ve bu sorguya girdiğinde hiçbir ürünle eşleşmezdi.
 *
 * Kural yeni değil: web varlıkları için zaten aynısı uygulanıyor.
 */
{
  mode = "ok";
  labelSets = [
    [
      { description: "Human leg", score: 0.99 },
      { description: "Wall", score: 0.97 },
      { description: "Skin", score: 0.96 },
      { description: "boot", score: 0.65 },
    ],
    [],
  ];

  const result = await reader().read(image, [requests[1], requests[0]]);

  t(
    result.get("ayakkabi") === "boot",
    `aileye uymayan yüksek skorlular eleniyor: ${result.get("ayakkabi")}`,
  );
  t(!result.has("ust"), "etiketi olmayan parça haritada yok — boş string değil");
}

/*
 * 2b) **Hizalama** — kırpılamayan bir parça istekten düştüğünde.
 *
 * Vision cevapları gönderilen sırayla dönüyor. Onları özgün listeyle eşlemek,
 * ortadaki bir kırpım düştüğü anda sonraki her etiketi bir parça kaydırırdı — ve
 * bu sessizce yanlış olurdu, çünkü kayan etiketler yine makul görünür:
 * ayakkabıya «polo shirt» değil, bir üstteki üste ayakkabının etiketi yazılır.
 *
 * Ortadaki kutu bilerek kırpılamayacak kadar ince: `cropRegion` 8 pikselin
 * altındaki kırpımı `null` döndürüyor.
 */
{
  mode = "ok";
  seen.length = 0;
  // Gönderilecek iki kırpım için iki cevap — ortadaki hiç gitmiyor.
  labelSets = [
    [{ description: "polo shirt", score: 0.9 }],
    [{ description: "sneakers", score: 0.9 }],
  ];

  const result = await reader().read(image, [
    requests[0],
    { key: "kil", itemType: "Top", box: { x: 0.5, y: 0.5, width: 0.0001, height: 0.0001 } },
    requests[1],
  ]);

  t(seen[0]?.requests?.length === 2, `kırpılamayan parça isteğe girmiyor (${seen[0]?.requests?.length})`);
  t(!result.has("kil"), "kırpılamayan parça sonuçta yok");
  t(result.get("ust") === "polo shirt", `ilk parça doğru: ${result.get("ust")}`);
  t(
    result.get("ayakkabi") === "sneakers",
    `düşen parçadan sonraki etiket kaymıyor: ${result.get("ayakkabi")}`,
  );
}

/*
 * 3) Düşük skorlu etiket alınmıyor.
 *
 * Vision uzun bir kuyruk döndürüyor ve kuyruğun sonu tahmin. Eşiksiz bir seçim,
 * ailesi tutan ama %20 güvenle söylenmiş bir kelimeyi sorguya yazardı.
 */
{
  /*
   * Etiketin ailesi bilerek **tutuyor** — "polo shirt", 1. durumda seçilen
   * kelimenin ta kendisi. İlk yazdığımda burada "cardigan" vardı ve kontrol
   * yeşildi, ama yanlış sebepten: onu aile süzgeci zaten eliyordu, yani eşik
   * hiç sınanmıyordu. Eşiği kaldırıp ölçtüm, kontrol yeşil kaldı; kusuru
   * gösteren bir ölçüm olmadığı böyle anlaşıldı.
   */
  labelSets = [[{ description: "polo shirt", score: 0.2 }], []];
  const result = await reader().read(image, requests);
  t(!result.has("ust"), `eşiğin altındaki etiket alınmıyor (${result.get("ust")})`);
}

/*
 * 4) Bilinmeyen aile hiç sorulmuyor.
 *
 * Ailesi çözülemeyen bir tespitte süzgecin dayanağı yok — her etiket eşit
 * derecede makul görünür, yani seçim rastgeleye döner. Uydurmaktansa boş dönmek.
 */
{
  labelSets = [[{ description: "polo shirt", score: 0.95 }]];
  const result = await reader().read(image, [
    { key: "belirsiz", itemType: "Zırzop", box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } },
  ]);
  t(!result.has("belirsiz"), "aile bilinmiyorsa etiket seçilmiyor");
}

/*
 * 5) Anahtar reddi ve kota kilitliyor, geçici hata kilitlemiyor.
 *
 * Kota burada kilide dahil, çünkü Vision'ın aylık ücretsiz birimi dolduğunda
 * kalan her tarama boşa gidiş dönüş olurdu — ve birimler zaten bitmiş olurdu.
 * 5xx ise «bu istek tutmadı» demek: susmak çalışan bir aşamayı kapatırdı.
 */
{
  mode = "auth";
  await untilUnlocked();
  seen.length = 0;

  await reader().read(image, requests);
  const afterFirst = seen.length;
  await reader().read(image, requests);

  t(afterFirst === 1, `anahtar reddinde istek gidiyor (${afterFirst})`);
  t(seen.length === afterFirst, "reddedilen anahtar sonraki taramada sorulmuyor");
  t(cropLabelsBlocked(), "kilit dışarıdan okunabiliyor");

  mode = "kota";
  await untilUnlocked();
  seen.length = 0;
  await reader().read(image, requests);
  const afterQuota = seen.length;
  await reader().read(image, requests);
  t(seen.length === afterQuota, "kota dolduğunda da susuluyor");

  mode = "server";
  await untilUnlocked();
  seen.length = 0;
  await reader().read(image, requests);
  const afterServer = seen.length;
  await reader().read(image, requests);
  t(seen.length === afterServer * 2, `geçici hata kilitlemiyor (${seen.length})`);
  t(!cropLabelsBlocked(), "5xx kilit kurmuyor");
}

/*
 * 6) Durum satırı, ve **kotayı harcayan aşama kendini açmıyor**.
 *
 * Bu aşama Vision'ın aylık ücretsiz biriminden kırpım başına bir birim
 * harcıyor: tarama başına 3'ten ~5-6'ya, yani ayda ~1000 taramadan ~170-200'e.
 * Anahtarın ortamda bulunuvermesi bunu açmaya yetmemeli.
 */
{
  const { getCropLabelReader } = await import("@/services/cropLabels");
  const env = { ...process.env };
  const set = (values) => {
    for (const name of [
      "GOOGLE_VISION_API_KEY",
      "GOOGLE_CLOUD_VISION_API_KEY",
      "ENABLE_CROP_LABELS",
    ]) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
  };

  set({ GOOGLE_VISION_API_KEY: "k" });
  t(getCropLabelReader() === null, "bayrak olmadan aşama açılmıyor");
  t(/ENABLE_CROP_LABELS/.test(cropLabelStatus()), `eksik bayrak yazılıyor: ${cropLabelStatus()}`);
  t(/birim/.test(cropLabelStatus()), "neye mal olduğu söyleniyor");

  set({ ENABLE_CROP_LABELS: "true" });
  t(getCropLabelReader() === null, "anahtarsız aşama açılmıyor");

  /*
   * **İki yazım da kabul ediliyor.**
   *
   * `visionKey.ts` tam olarak bu hatadan doğdu: iki kabul edilen yazımdan
   * yalnızca birini okuyan bir yol, kullanıcı diğerini ayarladığında sessizce
   * kapalı kalıyordu — ve aynı taramanın logunda hem `source: "google-vision"`
   * hem «anahtar yok» yan yana yazıyordu.
   */
  set({ ENABLE_CROP_LABELS: "true", GOOGLE_CLOUD_VISION_API_KEY: "uzun-ad" });
  t(getCropLabelReader() !== null, "uzun yazımla açılıyor");

  set({ ENABLE_CROP_LABELS: "true", GOOGLE_VISION_API_KEY: "kısa-ad" });
  t(getCropLabelReader() !== null, "kısa yazımla da açılıyor");
  t(cropLabelStatus() === "açık", `açıkken açık yazıyor: ${cropLabelStatus()}`);

  set(env);
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
