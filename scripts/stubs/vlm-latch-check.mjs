/**
 * Kredisi biten anahtar sonraki taramada da soruluyor mu? — `node scripts/stubs/vlm-latch-check.mjs`
 *
 * Üretimde ölçüldü: kredi bittiği hâlde her tarama, parça sayısı kadar çağrı ve
 * ~330 ms harcamaya devam ediyordu. Kredi bitmesi kırpımı değiştirerek çözülecek
 * bir şey değil — sıradaki parça da, sıradaki tarama da aynı cevabı alıyor.
 *
 * `contextDevService` ve `googleSearch` ile aynı desen, **bir farkla**: bir
 * taramanın bütün parçaları tek bir `allSettled` içinde aynı anda yola çıkıyor,
 * yani örnek durumu aynı tarama içinde hiçbir şey kesemez. Kilit bu yüzden modül
 * düzeyinde, ve kazanç sonraki taramalarda. Ölçülen şey de tam olarak bu: ikinci
 * taramada sahte sunucuya kaç istek geliyor.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

let requests = 0;
let mode = "credit"; // "credit" | "server" | "ok"

const server = createServer((req, res) => {
  requests += 1;

  if (mode === "credit") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          message:
            "Your credit balance is too low to access the Anthropic API. " +
            "Please go to Plans & Billing to upgrade or purchase credits.",
        },
      }),
    );
    return;
  }

  if (mode === "server") {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "Overloaded" } }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            visible: true,
            garmentType: "pantolon",
            colorName: "antrasit",
            colorHex: "#3a3a3a",
            material: "",
            pattern: "",
            details: [],
            fit: "",
            confidence: 0.9,
          }),
        },
      ],
    }),
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { createAttributeExtractor } = await import("@/services/attributeExtractor");
const sharp = (await import("sharp")).default;

/** İki parçanın kırpılabileceği düz bir görsel. */
const image = await sharp({
  create: { width: 400, height: 800, channels: 3, background: { r: 120, g: 120, b: 120 } },
})
  .jpeg()
  .toBuffer();

const boxes = [
  { key: "a", itemType: "Top", box: { x: 0.1, y: 0.1, width: 0.5, height: 0.3 } },
  { key: "b", itemType: "Jeans", box: { x: 0.1, y: 0.5, width: 0.5, height: 0.3 } },
];

/**
 * Her tarama yeni bir örnek kuruyor — üretimde `getAttributeExtractor()` da öyle.
 *
 * Kilit süresi 400 ms: gerçek değeri 60 sn ve onu beklemek ölçümü kullanılamaz
 * hâle getirirdi. Süreyi parametreye almak, `GoogleProductSearch` ile aynı çözüm.
 */
const COOLDOWN = 400;
const scan = () =>
  createAttributeExtractor("stub-key", {
    baseUrl: base,
    deadlineMs: 8_000,
    requestTimeoutMs: 8_000,
    cooldownMs: COOLDOWN,
  }).extract(image, boxes);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * 1) İlk tarama soruyor, ikinci tarama sormuyor.
 *
 * Ölçülen şey mesaj değil **gidiş dönüş**: «boş döndü» kontrolü kilit hiç
 * çalışmasa da yeşil kalırdı, çünkü kredi hatası zaten boş döndürüyor.
 */
{
  mode = "credit";
  requests = 0;

  const first = await scan();
  const afterFirst = requests;
  const second = await scan();

  t(afterFirst === 2, `ilk tarama iki parçayı da soruyor (${afterFirst})`);
  t(first.size === 0, "kredi hatasında öznitelik dönmüyor");
  t(requests === afterFirst, `ikinci tarama hiç sormuyor (${requests - afterFirst} istek)`);
  t(second.size === 0, "ikinci tarama da boş dönüyor");
}

/*
 * 2) Kilit süreli — ve süresi dolunca aşama geri geliyor.
 *
 * Kalıcı olsaydı, kredi yükleyen kullanıcı instance ölene kadar aşamayı geri
 * alamazdı, ve bunu fark etmenin bir yolu da olmazdı.
 */
{
  mode = "ok";
  await sleep(COOLDOWN + 100);

  requests = 0;
  const result = await scan();

  t(requests === 2, `süre dolunca yeniden soruluyor (${requests})`);
  t(result.size === 2, `kredi dönünce öznitelikler geliyor (${result.size})`);
  t(result.get("a")?.colorName === "antrasit", "cevap gerçekten okunuyor");
}

/*
 * 3) Geçici hata kilitlemiyor.
 *
 * Kilit «bu anahtar çalışmıyor» demek, «bu istek tutmadı» demek değil. Sunucu
 * hatasında susmak, çalışan bir aşamayı bir dakikalığına kapatırdı.
 *
 * İstek sayısı doğrudan karşılaştırılmıyor: SDK 5xx'te bir kez yeniden deniyor,
 * yani bir taramanın kaç isteğe dönüştüğü SDK'nın kararı. Ölçülen şey iki
 * taramanın **aynı** sayıda istek üretmesi — yani ikincisinin susmamış olması.
 */
{
  mode = "server";
  requests = 0;

  await scan();
  const afterFirst = requests;
  await scan();

  t(afterFirst > 0, `sunucu hatasında istek gidiyor (${afterFirst})`);
  t(
    requests === afterFirst * 2,
    `geçici hata kilitlemiyor (ilk tarama ${afterFirst}, toplam ${requests})`,
  );
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
