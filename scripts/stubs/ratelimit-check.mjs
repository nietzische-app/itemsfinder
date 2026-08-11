/**
 * Upstash yolu gerçekten çalışıyor mu? — `node scripts/stubs/ratelimit-check.mjs`
 *
 * ## Neden var
 *
 * Hız sınırı bugün süreç-yerel sayaçlarla çalışıyor ve üretim logu bunu her
 * taramada yüksek sesle söylüyor: sunucusuz instance'lar hiçbir şey paylaşmıyor,
 * yani «IP başına sınır» aslında «instance başına sınır».
 *
 * Kod Upstash'i destekliyor ve iki ortam değişkeni bekliyor. Ama o yol bugüne
 * kadar **hiç sürülmedi**: değişkenler yapıştırıldığı an ya çalışacak ya da
 * üretimde bozulacak, ve ikisinin arasında bir ölçüm yoktu. «Yapıştır ve dua et»
 * bir kurulum yordamı değil.
 *
 * Sahte bir Upstash REST sunucusuna karşı sürülüyor: gerçek bir hesap, ödeme ya
 * da ağ gerekmiyor — `VISION_BASE_URL` ile aynı gerekçe.
 *
 * ## Ne ölçüyor
 *
 * İstek şekli (yol, kimlik doğrulama, gövde), sayacın gerçekten artması,
 * **pencerenin kapanması**, ve değişkenler yokken sessizce Upstash'e gidiyormuş
 * gibi davranmaması.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/** Sahte Upstash: komutları kaydediyor ve basit bir sayaç tutuyor. */
const seen = [];
const counters = new Map();
const ttls = new Map();
let fail = false;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    seen.push({
      path: req.url,
      auth: req.headers.authorization,
      contentType: req.headers["content-type"],
      commands: JSON.parse(body || "[]"),
    });

    if (fail) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "boom" }));
      return;
    }

    const results = JSON.parse(body).map((command) => {
      const [name, key, value] = command;

      if (name === "INCR") {
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return { result: next };
      }
      if (name === "EXPIRE") {
        /*
         * `NX` yalnızca TTL yokken kuruyor — gerçek Redis'in davranışı.
         *
         * Sahte sunucunun bunu taklit etmesi şart: `NX` düşerse pencere her
         * istekte ileri kayar ve sınır hiç dolmaz. Yanlış taklit eden bir sahte
         * sunucu, ölçümü kusuru gizleyecek şekilde yeşil tutardı.
         */
        if (command[3] === "NX" && ttls.has(key)) return { result: 0 };
        ttls.set(key, value);
        return { result: 1 };
      }
      if (name === "GET") return { result: counters.get(key) ?? null };
      return { error: `bilinmeyen komut ${name}` };
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(results));
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { getRateLimitStore, resetRateLimitStore, rateLimitStatus } = await import(
  "@/services/rateLimitStore"
);

/*
 * 1) Değişkenler varken Upstash'e gidiliyor — ve istek şekli doğru.
 *
 * Şekil ayrıca ölçülüyor çünkü yanlış yol ya da eksik kimlik doğrulama üretimde
 * `Upstash responded 404` diye görünür ve o satır «Redis çalışmıyor» ile «kod
 * yanlış istek atıyor» arasında ayrım yapmaz.
 */
{
  process.env.UPSTASH_REDIS_REST_URL = base;
  process.env.UPSTASH_REDIS_REST_TOKEN = "sahte-jeton";
  resetRateLimitStore();

  const store = getRateLimitStore();
  const first = await store.increment("ip:1.2.3.4", 60);
  const second = await store.increment("ip:1.2.3.4", 60);

  t(first === 1 && second === 2, `sayaç artıyor (${first}, ${second})`);
  t(seen.length === 2, `iki istek gitti (${seen.length})`);
  t(seen[0]?.path === "/pipeline", `doğru yol: ${seen[0]?.path}`);
  t(seen[0]?.auth === "Bearer sahte-jeton", `jeton taşınıyor: ${seen[0]?.auth}`);
  t(seen[0]?.contentType === "application/json", "gövde JSON olarak gönderiliyor");
  t(
    seen[0]?.commands?.[0]?.[0] === "INCR" && seen[0]?.commands?.[1]?.[0] === "EXPIRE",
    `tek gidiş dönüşte INCR + EXPIRE: ${JSON.stringify(seen[0]?.commands)}`,
  );
}

/*
 * 2) **Pencere kapanıyor** — `EXPIRE ... NX` her istekte ileri kaymıyor.
 *
 * Asıl iddia bu. `NX` olmadan TTL her istekte yenilenir ve sürekli istek atan
 * bir istemcinin penceresi hiç dolmaz: sınır kâğıt üstünde vardır, pratikte yok.
 * Ve bu, çalışıyormuş gibi görünen bir arıza — sayaç artıyor, hata yok, yalnızca
 * anahtar hiç silinmiyor.
 */
{
  const nx = seen
    .flatMap((entry) => entry.commands)
    .filter((command) => command[0] === "EXPIRE");

  t(nx.length > 0, "EXPIRE gönderiliyor");
  t(
    nx.every((command) => command[3] === "NX"),
    `hepsi NX ile: ${JSON.stringify(nx)}`,
  );
  t(ttls.get("ip:1.2.3.4") === "60", `TTL bir kez kuruldu (${ttls.get("ip:1.2.3.4")})`);
}

/*
 * 3) Okuma da aynı yoldan.
 */
{
  const store = getRateLimitStore();
  const value = await store.read("ip:1.2.3.4");
  t(value === 2, `okunan sayaç doğru (${value})`);

  const value2 = await store.read("ip:9.9.9.9");
  t(value2 === 0, `bilinmeyen anahtar sıfır (${value2})`);
}

/*
 * 4) Upstash patlarsa hata **yutulmuyor**.
 *
 * Sessizce sıfır döndürmek, sınırı tamamen kaldırmak demek — ve bunu kimse fark
 * etmez. Çağıranın kararı «hata alınca ne yapılacağı»; buranın işi doğruyu
 * söylemek.
 */
{
  fail = true;
  const store = getRateLimitStore();
  let threw = false;
  try {
    await store.increment("ip:5.5.5.5", 60);
  } catch {
    threw = true;
  }
  fail = false;

  t(threw, "Upstash hatası yukarı taşınıyor");
}

/*
 * 5) Değişkenler yokken bellek deposu — ve **yüksek sesle**.
 *
 * Süreç-yerel sayaç sunucusuz bir dağıtımda hız sınırı değil; sessiz kalmak,
 * sınırın var olduğunu sanmaya yol açar. Üretimde ilk belirtisi fatura olurdu.
 */
{
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  resetRateLimitStore();

  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(String(line));
  let store;
  try {
    store = getRateLimitStore();
  } finally {
    console.error = original;
    process.env.NODE_ENV = previousEnv;
  }

  const before = seen.length;
  const value = await store.increment("ip:7.7.7.7", 60);

  t(value === 1, `bellek deposu sayıyor (${value})`);
  t(seen.length === before, `Upstash'e istek gitmiyor (${seen.length - before})`);
  t(
    errors.some((line) => /UPSTASH_REDIS_REST_URL/.test(line)),
    `eksiklik yüksek sesle yazılıyor: ${errors[0]?.slice(0, 60)}`,
  );
}

/*
 * 6) Durum satırı üç durumu ayırt ediyor mu?
 *
 * Bugüne kadar tek sinyal, eksiklik uyarısının **görünmemesiydi** — ve o
 * sessizlik üç ayrı şey demek olabiliyordu: değişkenler doğru mu, dağıtım
 * yenilendi mi, Redis gerçekten cevap veriyor mu. Kurulumu yapan kişinin
 * «çalışıyor mu» sorusuna bakacağı bir satır olmalı.
 *
 * Jetonun yazılmadığı ayrıca ölçülüyor: log'a sır düşmesi, teşhis uğruna
 * ödenecek bir bedel değil.
 */
{
  process.env.UPSTASH_REDIS_REST_URL = "https://eu2-brave-mole-12345.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "çok-gizli-jeton";

  const line = rateLimitStatus();
  t(/Upstash/.test(line), `kurulduğunda Upstash yazıyor: ${line}`);
  t(/eu2-brave-mole-12345\.upstash\.io/.test(line), "hangi örnek olduğu görünüyor");
  t(!/çok-gizli-jeton/.test(line), "jeton log'a düşmüyor");

  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const half = rateLimitStatus();
  t(/TOKEN/.test(half) && !/URL/.test(half), `eksik olan tek tek yazılıyor: ${half}`);

  delete process.env.UPSTASH_REDIS_REST_URL;
  const none = rateLimitStatus();
  t(/URL \+ TOKEN/.test(none), `ikisi de yoksa ikisi de yazılıyor: ${none}`);
  t(/hız sınırı değil/.test(none), "süreç-yerel sayacın ne olmadığı söyleniyor");
}

resetRateLimitStore();
server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
