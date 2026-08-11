/**
 * Ücretsiz sağlayıcı gerçekten çalışıyor mu? — `node scripts/stubs/gemini-attributes-check.mjs`
 *
 * ## Neden var
 *
 * Öznitelik çıkarımı bu boru hattındaki tek «kırpıma bakan» aşama, ve üretimde
 * kapalı: `describedItems: 0`. Kapalı olduğu için sorgular Vision'ın kaba
 * sınıfından ve kutunun ölçülen renginden kuruluyor — beyaz bir sneaker için
 * «Ayakkabı ve Çanta Koku Topu» birebir eşleşme oldu (`docs/BULUNAMADI.md`).
 *
 * Anthropic anahtarının kredisi bitti ve bu projede ödeme bir kısıt. Gemini'nin
 * ücretsiz kademesi aşamayı para vermeden geri açıyor — ama yeni bir taşıma
 * demek: yeni adres, yeni gövde şekli, yeni hata sözlüğü. Bunların hiçbiri
 * üretimde ilk kez denenmemeli.
 *
 * Sahte bir Gemini sunucusuna karşı sürülüyor: gerçek anahtar, kota ya da ağ
 * gerekmiyor — `VISION_BASE_URL` ile aynı gerekçe.
 *
 * ## Ne ölçüyor
 *
 * İstek şekli (yol, anahtarın **başlıkta** taşınması, kırpımın gövdeye girmesi),
 * **istemin ortak olması**, cevabın gerçekten okunması, kotanın kilitlemesi,
 * geçici hatanın kilitlememesi, bozuk cevabın reddedilmesi ve sağlayıcı
 * seçiminin doğru sırayla yapılması.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const seen = [];
let mode = "ok"; // "ok" | "quota" | "ödeme" | "askı" | "badkey" | "server" | "bozuk"

/** Emekli sayılan modeller — istek yoluna göre 404 döndürülüyor. */
let retired = new Set();

/**
 * Anahtarın **şekli**, kendisi değil.
 *
 * İlk hâlinde üretim logundan alınmış gerçek anahtar buraya yapıştırılmıştı ve
 * GitHub itmeyi reddetti — doğru yaptı. Sızıntıyı ölçen bir dosyanın sızıntının
 * kendisi olması, ölçümün anlamını tersine çevirirdi.
 *
 * Ölçülen şey uzunluk ya da içerik değil, `redact`'in bu diziyi ve Google'ın
 * `api_key:…` biçimini bulup bulmadığı. Ön ek ve karakter kümesi gerçek AI
 * Studio anahtarlarıyla aynı; gerisi belli ki uydurma.
 */
const KEY = "AQ.SAHTE_anahtar-bu-bir-olcum-degeri_0123456789";

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    seen.push({
      path: req.url,
      key: req.headers["x-goog-api-key"],
      contentType: req.headers["content-type"],
      body: JSON.parse(body || "{}"),
    });

    /*
     * Emekli model — üretimden alınmış gerçek gövde.
     *
     *   404 This model models/gemini-2.0-flash is no longer available.
     *
     * Kotadan ve anahtar reddinden önce sınanıyor çünkü ayrı bir sınıf: susmayı
     * değil, listede ilerlemeyi gerektiriyor.
     */
    const askedModel = /models\/([^:]+):/.exec(req.url ?? "")?.[1];
    if (askedModel && retired.has(askedModel)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 404,
            message: `This model models/${askedModel} is no longer available. Please update your code to use a newer model.`,
            status: "NOT_FOUND",
          },
        }),
      );
      return;
    }

    if (mode === "quota") {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }));
      return;
    }
    /*
     * Ön ödemeli kredinin bitmesi — üretimden alınmış gerçek gövde.
     *
     * Bu da 429, ama kotayla ilgisi yok: proje ücretsiz kademede değil. Aynı
     * durum koduna iki farklı iş düşüyor ve ayıran tek şey gövde.
     */
    if (mode === "ödeme") {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 429,
            message:
              "Your prepayment credits are depleted. Please go to AI Studio at " +
              "https://ai.studio/projects to manage your project and billing.",
            status: "RESOURCE_EXHAUSTED",
          },
        }),
      );
      return;
    }
    if (mode === "badkey") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "API key not valid", status: "INVALID_ARGUMENT" } }));
      return;
    }
    /*
     * Askıya alınmış anahtar — üretimden alınmış gerçek gövde şekli.
     *
     * Google anahtarı hata mesajında **geri yazıyor**. Kelimesi kelimesine
     * taklit ediliyor, çünkü ölçülecek şey tam olarak bu: gövdeyi olduğu gibi
     * loga basmak anahtarı sızdırıyordu.
     */
    if (mode === "askı") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 403,
            message: `Permission denied: Consumer 'api_key:${KEY}' has been suspended.`,
            status: "PERMISSION_DENIED",
          },
        }),
      );
      return;
    }
    if (mode === "server") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "The model is overloaded." } }));
      return;
    }

    /*
     * `bozuk` dalı, modelin JSON yerine düz metin döndürdüğü durumu taklit
     * ediyor. `responseMimeType` bunu engellemeli ama garanti sunucu tarafında:
     * ayrıştırılamayan bir cevabın taramayı düşürmemesi ölçülmeli.
     */
    const text =
      mode === "bozuk"
        ? "Elbette! İşte istediğiniz öznitelikler:"
        : JSON.stringify({
            visible: true,
            garmentType: "triko polo yaka tişört",
            colorName: "krem",
            colorHex: "#e8dcc8",
            material: "triko",
            pattern: "düz",
            details: ["fitilli", "kısa kollu"],
            fit: "regular",
            confidence: 0.82,
          });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { GeminiAttributeExtractor, geminiBlocked } = await import("@/services/geminiAttributes");
const { ATTRIBUTE_SYSTEM_PROMPT } = await import("@/services/attributeExtractor");
const sharp = (await import("sharp")).default;

/** İki parçanın kırpılabileceği düz bir görsel. */
const image = await sharp({
  create: { width: 400, height: 800, channels: 3, background: { r: 200, g: 190, b: 170 } },
})
  .jpeg()
  .toBuffer();

const boxes = [
  { key: "a", itemType: "Top", box: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 } },
  { key: "b", itemType: "Trousers", box: { x: 0.1, y: 0.5, width: 0.5, height: 0.3 } },
];

/**
 * Kilit süresi 400 ms: gerçek değeri 60 sn ve onu beklemek ölçümü kullanılamaz
 * hâle getirirdi. Süreyi parametreye almak, `vlm-latch-check` ile aynı çözüm.
 */
const COOLDOWN = 400;

/**
 * Her tarama **yeni bir örnek** kuruyor — üretimde `getGeminiExtractor()` de
 * öyle. Kilidin örnek üzerinde değil modül üzerinde durması gerektiği,
 * `auth-latch-check`'te bir kez ödenmiş ders.
 */
const scan = () =>
  new GeminiAttributeExtractor(KEY, {
    baseUrl: base,
    deadlineMs: 8_000,
    requestTimeoutMs: 8_000,
    cooldownMs: COOLDOWN,
  }).extract(image, boxes);

/** Kilidin dolmasını sabit uykuyla değil, durumu yoklayarak bekliyor. */
const untilUnlocked = async () => {
  while (geminiBlocked()) await new Promise((resolve) => setTimeout(resolve, 20));
};

/*
 * 1) İstek şekli.
 *
 * Yanlış yol ya da yanlış gövde alanı, Gemini'de 400 olarak döner ve logda
 * «betimlenemedi» gibi görünür — yani bir taşıma hatası bir doğruluk sorunu
 * kılığına girer. Şekil burada bir kez sabitleniyor.
 */
{
  mode = "ok";
  seen.length = 0;

  const result = await scan();

  t(seen.length === 2, `iki parça için iki istek (${seen.length})`);
  t(
    /^\/v1beta\/models\/gemini-[\w.-]+:generateContent$/.test(seen[0]?.path ?? ""),
    `doğru yol: ${seen[0]?.path}`,
  );

  /*
   * Anahtar **başlıkta**. `?key=…` de kabul edilirdi ama anahtarı adresin
   * parçası yapardı: ağ hatası mesajı ya da ara sunucu kaydı adresi olduğu gibi
   * yazdığında sır loga düşerdi. Adreste anahtar olmadığı ayrıca ölçülüyor.
   */
  t(seen[0]?.key === KEY, "anahtar x-goog-api-key başlığında");
  t(!(seen[0]?.path ?? "").includes(KEY), "anahtar adreste geçmiyor");

  const parts = seen[0]?.body?.contents?.[0]?.parts ?? [];
  const inline = parts.find((part) => part.inline_data);
  t(inline?.inline_data?.mime_type === "image/jpeg", "kırpım JPEG olarak gidiyor");
  t((inline?.inline_data?.data?.length ?? 0) > 100, "kırpım gerçekten dolu");
  /*
   * Sınıflar **iki isteğin toplamında** aranıyor, `seen[0]` içinde değil.
   *
   * İki parça paralel gidiyor, yani hangisinin önce ulaştığı yarışın sonucu.
   * `seen[0]`'ın "Top" olduğunu varsaymak, makine yükü değiştiğinde kırmızıya
   * dönen bir ölçüm demekti — ve yanlış alarm veren bir ölçüm, bir süre sonra
   * bakılmayan bir ölçüm.
   */
  const prompts = seen.flatMap((entry) =>
    (entry.body?.contents?.[0]?.parts ?? []).map((part) => part.text ?? ""),
  );
  t(
    prompts.some((text) => /Kaba sınıf: "Top"/.test(text)) &&
      prompts.some((text) => /Kaba sınıf: "Trousers"/.test(text)),
    "her parçanın kaba sınıfı kendi istemine yazılıyor",
  );

  /*
   * **İstem ortak.** Bu, dosyanın var oluş gerekçesinin yarısı: ikinci bir istem
   * yazmak, iki sağlayıcının aynı fotoğrafı sessizce farklı betimlemesi
   * demekti — ve fark hiçbir logda görünmezdi. Metin burada karakterine kadar
   * karşılaştırılıyor.
   */
  t(
    seen[0]?.body?.systemInstruction?.parts?.[0]?.text === ATTRIBUTE_SYSTEM_PROMPT,
    "sistem istemi Anthropic yoluyla birebir aynı",
  );

  t(
    seen[0]?.body?.generationConfig?.responseMimeType === "application/json",
    "JSON çıktı isteniyor",
  );
  t(seen[0]?.body?.generationConfig?.temperature === 0, "sıcaklık sıfır — aynı kırpım aynı cevap");

  t(result.size === 2, `iki parça da betimlendi (${result.size})`);
  t(result.get("a")?.colorName === "krem", `cevap gerçekten okunuyor (${result.get("a")?.colorName})`);
  t(result.get("a")?.material === "triko", "malzeme taşınıyor");
  t(result.get("a")?.details?.includes("fitilli"), "detaylar taşınıyor");
}

/*
 * 2) Kota reddi kilitliyor — ve kilit **modül düzeyinde**.
 *
 * Ölçülen şey mesaj değil **gidiş dönüş**: «boş döndü» kontrolü kilit hiç
 * çalışmasa da yeşil kalırdı, çünkü 429 zaten boş döndürüyor. Ücretsiz kademede
 * bu asıl mesele: kota dolduğunda susmayan bir aşama her taramaya saniyeler
 * ekler ve karşılığında hiçbir şey üretmez.
 */
{
  mode = "quota";
  await untilUnlocked();
  seen.length = 0;

  const first = await scan();
  const afterFirst = seen.length;
  const second = await scan();

  t(afterFirst === 2, `ilk tarama iki parçayı da soruyor (${afterFirst})`);
  t(first.size === 0, "kota hatasında öznitelik dönmüyor");
  t(seen.length === afterFirst, `ikinci tarama hiç sormuyor (${seen.length - afterFirst} istek)`);
  t(second.size === 0, "ikinci tarama da boş dönüyor");
  t(geminiBlocked(), "kilit dışarıdan okunabiliyor");
}

/*
 * 3) Geçersiz anahtar da kilitliyor.
 *
 * Gemini kotayı 429, geçersiz anahtarı **400** ile söylüyor — ve 400 tek başına
 * kilitlememeli, çünkü bozuk bir gövde de 400 döndürür. Ayıran şey mesaj.
 */
{
  mode = "badkey";
  await untilUnlocked();
  seen.length = 0;

  await scan();
  const afterFirst = seen.length;
  await scan();

  t(afterFirst === 2, `geçersiz anahtar bir kez soruluyor (${afterFirst})`);
  t(seen.length === afterFirst, "geçersiz anahtardan sonra susuluyor");
}

/*
 * 3b) **Anahtar loga düşmüyor** — hata gövdesi onu geri yazsa bile.
 *
 * Üretimde ölçüldü ve tam da kapattığımızı sandığımız sınıftan:
 *
 *   [gemini] "Jeans" — HTTP 403: {"error":{"code":403,"message":
 *   "Permission denied: Consumer 'api_key:AQ.…' has been suspended."}}
 *
 * Anahtarı `x-goog-api-key` başlığına taşımak **giden** yolu kapatmıştı; bu
 * **dönen** yol. Sızıntının iki ucu var ve biri açıkken diğerini kapatmanın
 * hiçbir değeri yok — anahtar yine Vercel loguna, oradan da panoya düşüyor.
 */
{
  mode = "askı";
  await untilUnlocked();
  seen.length = 0;

  const lines = [];
  const originalWarn = console.warn;
  console.warn = (...args) => lines.push(args.map(String).join(" "));
  try {
    await scan();
  } finally {
    console.warn = originalWarn;
  }

  t(lines.length > 0, `hata yine de yazılıyor (${lines.length} satır)`);
  t(
    lines.every((line) => !line.includes(KEY)),
    `anahtar hiçbir satıra düşmüyor: ${lines.find((line) => line.includes(KEY))?.slice(0, 90) ?? "—"}`,
  );
  t(
    lines.some((line) => /api_key:«anahtar»/.test(line)),
    "yerine ne olduğu görünüyor — satır teşhis için hâlâ okunabilir",
  );
  t(
    lines.some((line) => /suspended/.test(line)),
    "hatanın kendisi korunuyor — sansür teşhisi yutmuyor",
  );
}

/*
 * 3c) Askıya alınmış anahtar «kota» diye anlatılmıyor.
 *
 * İkisinin çözümü zıt: kota beklemekle geçer, askı geçmez. Not «bir süre sonra
 * açılıyor» dediğinde operatör hiç gelmeyecek bir şeyi bekler ve aşama süresiz
 * kapalı kalır — panelde her şey normal görünerek.
 */
{
  const { attributeProviderRemedy } = await import("@/services/attributeProvider");
  const { geminiBlockReason } = await import("@/services/geminiAttributes");

  t(geminiBlockReason() === "anahtar", `403 anahtar reddi sayılıyor (${geminiBlockReason()})`);

  const remedy = attributeProviderRemedy("gemini");
  t(/kendiliğinden düzelmez/.test(remedy), `askıda beklemek önerilmiyor: ${remedy}`);
  t(/aistudio\.google\.com/.test(remedy), "ne yapılacağı adresiyle yazılıyor");
  t(!/kota/.test(remedy), "kota denmiyor");

  // Kota gerçekten kota olduğunda ise beklemek doğru cevap.
  mode = "quota";
  await untilUnlocked();
  await scan();

  const quotaRemedy = attributeProviderRemedy("gemini");
  t(geminiBlockReason() === "kota", `429 kota sayılıyor (${geminiBlockReason()})`);
  t(/kendiliğinden açılıyor/.test(quotaRemedy), `kotada beklemek öneriliyor: ${quotaRemedy}`);
}

/*
 * 3d) **Ön ödemeli kredinin bitmesi kota değil** — aynı 429, başka iş.
 *
 * Üretimde ölçüldü:
 *
 *   429 Your prepayment credits are depleted. Please go to AI Studio … billing.
 *
 * Not o sırada «günlük ücretsiz kota doldu, bir süre sonra açılıyor» diyordu.
 * Oysa proje ücretsiz kademede değil ve bekleyerek düzelmiyor; üstelik çözümü
 * kotanınkinin **tersi** — faturalandırma açmak projeyi ücretsiz kademeden
 * çıkarıyor, yani sorunu büyütüyor.
 */
{
  const { attributeProviderRemedy } = await import("@/services/attributeProvider");
  const { geminiBlockReason } = await import("@/services/geminiAttributes");

  mode = "ödeme";
  await untilUnlocked();
  seen.length = 0;

  await scan();
  const afterFirst = seen.length;
  await scan();

  t(afterFirst === 2, `ödeme reddinde istek gidiyor (${afterFirst})`);
  t(seen.length === afterFirst, "ödeme reddinden sonra susuluyor");
  t(geminiBlockReason() === "ödeme", `429 ödeme olarak ayrılıyor (${geminiBlockReason()})`);

  const remedy = attributeProviderRemedy("gemini");
  t(!/kendiliğinden açılıyor/.test(remedy), `beklemek önerilmiyor: ${remedy}`);
  t(/ücretsiz kademede\s+değil/.test(remedy), "projenin ücretsiz kademede olmadığı söyleniyor");
  t(
    /faturalandırma/i.test(remedy) && /yeni bir proje/i.test(remedy),
    "faturalandırmanın sorunu büyüttüğü ve ne yapılacağı yazılıyor",
  );
}

/*
 * 4) Geçici hata kilitlemiyor.
 *
 * Kilit «bu anahtar çalışmıyor» demek, «bu istek tutmadı» demek değil. 503'te
 * susmak, çalışan bir aşamayı bir dakikalığına kapatırdı — `contextDevService`
 * ve VLM'de üç kez ödenmiş ders.
 */
{
  mode = "server";
  await untilUnlocked();
  seen.length = 0;

  await scan();
  const afterFirst = seen.length;
  await scan();

  t(afterFirst === 2, `sunucu hatasında istek gidiyor (${afterFirst})`);
  t(seen.length === afterFirst * 2, `geçici hata kilitlemiyor (toplam ${seen.length})`);
  t(!geminiBlocked(), "503 kilit kurmuyor");
}

/*
 * 5) Bozuk cevap reddediliyor — ve taramayı düşürmüyor.
 *
 * Uydurma bir öznitelik, hiç öznitelik olmamasından kötü: sorguya girer ve
 * yanlış ürünü birebir eşleşme yapar. Ayrıştırılamayan cevap sessizce atılıyor,
 * çağıran ölçülen renge düşüyor.
 */
{
  mode = "bozuk";
  seen.length = 0;

  const result = await scan();

  t(seen.length === 2, `bozuk cevapta da istek gidiyor (${seen.length})`);
  t(result.size === 0, `ayrıştırılamayan cevap kabul edilmiyor (${result.size})`);
  t(!geminiBlocked(), "bozuk cevap kilit kurmuyor");
}

/*
 * 5b) **Emekli model listede bir sonrakine geçiriyor.**
 *
 * Üretimde ölçüldü: `gemini-2.0-flash` emekli oldu ve aşama 404 ile durdu.
 * Bunun bir dağıtım gerektirmesi yanlış — model emekliliği öngörülebilir ve
 * tekrarlanabilir bir olay.
 */
{
  mode = "ok";
  await untilUnlocked();
  seen.length = 0;

  // Listedeki ilk model emekli; ikincisi çalışıyor.
  const { MODEL_CANDIDATES_FOR_TEST } = await import("@/services/geminiAttributes");
  retired = new Set([MODEL_CANDIDATES_FOR_TEST[0]]);

  const result = await scan();
  const asked = seen.map((entry) => /models\/([^:]+):/.exec(entry.path)?.[1]);

  t(asked.includes(MODEL_CANDIDATES_FOR_TEST[0]), "emekli model bir kez deneniyor");
  t(asked.includes(MODEL_CANDIDATES_FOR_TEST[1]), "sonraki model deneniyor");
  t(result.size === 2, `emeklilikten sonra betimleme geliyor (${result.size})`);
  t(!geminiBlocked(), "emeklilik kilit kurmuyor — kota da anahtar da değil");

  /*
   * Ve çalışan model **hatırlanıyor**: sonraki tarama ölü modele hiç gitmiyor.
   * Hatırlamamak, her taramanın ilk isteğini boşa harcamak demekti.
   */
  seen.length = 0;
  await scan();
  const askedAgain = seen.map((entry) => /models\/([^:]+):/.exec(entry.path)?.[1]);
  t(
    !askedAgain.includes(MODEL_CANDIDATES_FOR_TEST[0]),
    `çalışan model hatırlanıyor (${[...new Set(askedAgain)].join(", ")})`,
  );

  retired = new Set();
}

/*
 * 5c) `GEMINI_MODEL` verildiyse liste hiç sürülmüyor.
 *
 * Operatörün açık seçimi, denenip geçilecek bir öneri değil. Sessizce başka bir
 * modele geçmek, faturayı ya da davranışı onun bilmediği bir yere taşırdı.
 */
{
  mode = "ok";
  seen.length = 0;
  retired = new Set(["gemini-sabit-secim"]);

  const { GeminiAttributeExtractor } = await import("@/services/geminiAttributes");
  await new GeminiAttributeExtractor(KEY, {
    baseUrl: base,
    model: "gemini-sabit-secim",
    cooldownMs: COOLDOWN,
  }).extract(image, boxes);

  const asked = [...new Set(seen.map((entry) => /models\/([^:]+):/.exec(entry.path)?.[1]))];
  t(
    asked.length === 1 && asked[0] === "gemini-sabit-secim",
    `yalnızca verilen model deneniyor: ${asked.join(", ")}`,
  );

  retired = new Set();
}

/*
 * 6) Sağlayıcı seçimi.
 *
 * Anthropic önce — ölçülmüş ve sürülmüş yol o. Gemini eksiği kapatıyor, ölçülmüş
 * bir yolu kaldırmıyor. Ve iki anahtar da yokken durum satırı **ücretsiz
 * seçeneği adıyla** söylemeli: bu projede ödeme bir kısıt, ve «anahtar yok»
 * demek kullanıcıyı kredi yüklemeye gönderirdi.
 */
{
  const { selectAttributeProvider, attributeProviderStatus, attributeProviderOffReason } =
    await import("@/services/attributeProvider");

  const env = { ...process.env };
  const set = (values) => {
    for (const name of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "ENABLE_VLM_ATTRIBUTES"]) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
  };

  set({ ENABLE_VLM_ATTRIBUTES: "true", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
  t(selectAttributeProvider()?.name === "anthropic", "iki anahtar varsa Anthropic seçiliyor");
  t(/gemini yedekte/.test(attributeProviderStatus()), `yedek yazılıyor: ${attributeProviderStatus()}`);

  set({ ENABLE_VLM_ATTRIBUTES: "true", GEMINI_API_KEY: "g" });
  t(selectAttributeProvider()?.name === "gemini", "Anthropic yoksa Gemini seçiliyor");

  /*
   * **Durum satırı gerçekten sorulan modeli yazıyor.**
   *
   * Burada sabit bir isim aranıyordu ve üretimde tam olarak beklenmesi gereken
   * şey oldu: aday listesi güncellendi, istek yeni modele gitti, satır hâlâ
   * eskisini yazdı. Artık aday listesinden okunuyor — kontrolün kendisi de
   * listeyi elle yazmıyor.
   */
  const { MODEL_CANDIDATES_FOR_TEST: candidates } = await import("@/services/geminiAttributes");
  const line = attributeProviderStatus();
  t(
    candidates.some((name) => line.includes(name)),
    `satır aday listesinden bir model yazıyor: ${line}`,
  );
  t(!/\bg\b/.test(attributeProviderStatus()), "anahtar durum satırına düşmüyor");

  set({ GEMINI_API_KEY: "g" });
  t(selectAttributeProvider() === null, "bayrak olmadan aşama açılmıyor");
  t(/ENABLE_VLM_ATTRIBUTES/.test(attributeProviderOffReason()), "eksik bayrak yazılıyor");

  set({ ENABLE_VLM_ATTRIBUTES: "true" });
  t(selectAttributeProvider() === null, "anahtarsız aşama açılmıyor");
  t(
    /GEMINI_API_KEY/.test(attributeProviderOffReason()) &&
      /ücretsiz/.test(attributeProviderOffReason()),
    `ücretsiz seçenek adıyla anılıyor: ${attributeProviderOffReason()}`,
  );

  set(env);
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
