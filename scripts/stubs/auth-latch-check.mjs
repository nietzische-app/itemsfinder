/**
 * Reddedilen anahtar sonraki taramada da soruluyor mu? — `node scripts/stubs/auth-latch-check.mjs`
 *
 * Üretimde ölçüldü: context.dev'in kredisi bittiği hâlde **her** tarama marka
 * verisini yeniden sordu ve her seferinde aynı cevabı aldı.
 *
 *   [context.dev] enrichBrandMetadata failed for "gratis.com": 401 — …depleted
 *   [context.dev] enrichBrandMetadata failed for "koton.com":  401 — …depleted
 *   [context.dev] enrichBrandMetadata failed for "beymen.com": 401 — …depleted
 *
 * Kilit vardı ve doğru yazılmıştı — ama **örnek üzerindeydi**, ve servis nesnesi
 * her taramada yeniden kuruluyor (`getProductProvider()`). Yorumu «sunucusuz bir
 * instance dakikalarca ayakta kalıyor» diyordu; doğru olan buydu, yanlış olan
 * kilidin instance'la aynı ömre sahip olduğunu varsaymaktı.
 *
 * Ölçülen şey mesaj değil **gidiş dönüş**: «boş döndü» kontrolü kilit hiç
 * çalışmasa da yeşil kalırdı, çünkü 401 zaten `null` döndürüyor. `vlm-latch-check`
 * ile aynı desen, aynı gerekçe.
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
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message:
          "The key's credits have been completely depleted. Please upgrade your plan.",
        error_code: "USAGE_EXCEEDED",
      }),
    );
    return;
  }

  if (mode === "server") {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Overloaded" }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      brand: {
        domain: "koton.com",
        title: "Koton",
        colors: [{ hex: "#000000" }],
        logos: [{ formats: [{ src: "https://cdn.example.com/koton.png" }] }],
      },
    }),
  );
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

process.env.CONTEXT_DEV_BASE_URL = base;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevService, contextDevKeyRejected } = await import("@/services/contextDevService");

const COOLDOWN = 400;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Her tarama **yeni bir servis nesnesi** kuruyor — üretimde `getProductProvider()`
 * de öyle. Kusurun kaynağı tam olarak buydu, o yüzden ölçüm de böyle sürülüyor.
 */
const scan = (domain) =>
  new ContextDevService("stub-key", {
    authCooldownMs: COOLDOWN,
    requestTimeoutMs: 5_000,
  }).enrichBrandMetadata(domain);

/*
 * 1) İlk tarama soruyor, ikinci tarama sormuyor — **ayrı servis nesneleriyle**.
 *
 * Alan adı bilerek farklı: aynısı olsaydı marka önbelleği ikinci çağrıyı zaten
 * keserdi ve kontrol kilit olmadan da yeşil kalırdı. Ölçülen şey önbellek değil
 * kilit.
 */
{
  mode = "credit";
  requests = 0;

  const first = await scan("koton.com");
  const afterFirst = requests;
  const second = await scan("beymen.com");

  t(afterFirst === 1, `ilk tarama soruyor (${afterFirst})`);
  t(first === null, "kredi hatasında marka dönmüyor");
  t(requests === afterFirst, `ikinci tarama hiç sormuyor (${requests - afterFirst} istek)`);
  t(second === null, "ikinci tarama da boş dönüyor");
}

/*
 * 2) Kilit süreli — süresi dolunca aşama geri geliyor.
 *
 * Kalıcı olsaydı, kredi yükleyen kullanıcı süreç ölene kadar marka verisini geri
 * alamazdı ve bunu fark etmenin bir yolu da olmazdı.
 */
{
  mode = "ok";
  await sleep(COOLDOWN + 100);

  requests = 0;
  const brand = await scan("koton.com");

  t(requests === 1, `süre dolunca yeniden soruluyor (${requests})`);
  t(brand?.name === "Koton", `kredi dönünce marka geliyor (${brand?.name})`);
}

/*
 * 3) Geçici hata kilitlemiyor.
 *
 * Kilit «bu anahtar çalışmıyor» demek, «bu istek tutmadı» demek değil. Sunucu
 * hatasında susmak, çalışan bir aşamayı bir dakikalığına kapatırdı.
 */
{
  mode = "server";
  requests = 0;

  await scan("zara.com");
  const afterFirst = requests;
  await scan("bershka.com");

  t(afterFirst > 0, `sunucu hatasında istek gidiyor (${afterFirst})`);
  t(requests === afterFirst * 2, `geçici hata kilitlemiyor (toplam ${requests})`);
}

/*
 * 4) Sebep dışarıdan okunabiliyor mu?
 *
 * Kilit sunucusuz bir dağıtımda çoğu zaman kurtarmıyor: soğuk bir instance
 * kilidi de beraberinde kaybediyor. Kalıcı çözüm bayrağı kapatmak ve bunu ancak
 * operatör yapabilir — gerileme notunun yazılabilmesi için sebebin buradan
 * okunabilmesi gerekiyor.
 */
{
  mode = "ok";
  await sleep(COOLDOWN + 100);
  await scan("mavi.com");
  t(!contextDevKeyRejected(), "çalışan anahtarda uyarı yok");

  mode = "credit";
  await scan("lcw.com");
  t(contextDevKeyRejected(), "kredi bitince dışarıdan okunabiliyor");
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
