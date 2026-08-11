/**
 * Canlı ürün yolunu ne açıyor? — `node scripts/stubs/provider-gate-check.mjs`
 *
 * ## Neden var
 *
 * Üretimde ölçüldü. Kredisi bitmiş context.dev anahtarı ortamdan silindi — ki
 * bunu ben önerdim, çünkü her taramada iki kez 401 alıp hiçbir şey üretmiyordu —
 * ve **bütün canlı yol** kapandı:
 *
 *   {"products":"mock","live":"0/2","ms":{"products":0},"searchYield":[]}
 *
 * Sebebi şuydu: sağlayıcı seçimi yalnızca `CONTEXT_DEV_API_KEY`'e bakıyordu.
 * Oysa o anahtardan sonra üç kanal daha eklendi — mağaza araması, adres dizini,
 * ürün işaretlemesi okuma — ve hiçbiri context.dev'e ihtiyaç duymuyor. Ücretli
 * satıcı, kanallardan biri olmaktan çıkıp hepsinin kapısı olmuştu.
 *
 * Ölü bir anahtarı yerinde tutmayı gerektiren bir tasarım, tasarım değil.
 *
 * ## Ne ölçüyor
 *
 * Hangi ortam bileşiminin canlı yolu açtığını, ve açıldığında ürünlerin
 * kaynağının bir **satıcı adıyla** değil bir **yetenek adıyla** raporlandığını.
 */
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { getProductProvider } = await import("@/services/visualSearch");

const KEYS = [
  "CONTEXT_DEV_API_KEY",
  "ENABLE_CONTEXT_DEV_LIVE",
  "ENABLE_STORE_SEARCH",
  "ENABLE_PRODUCT_INDEX",
];

const env = { ...process.env };
const set = (values) => {
  for (const name of KEYS) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
};

const sourceWith = (values) => {
  set(values);
  return getProductProvider().source;
};

/*
 * 1) Hiçbir kanal yoksa sahte katalog.
 *
 * Bu doğru davranış ve korunması gerekiyor: taze bir klon, kimlik bilgisi
 * olmadan çalışabilmeli.
 */
{
  t(sourceWith({}) === "mock", `kanalsız sahte katalog (${sourceWith({})})`);
}

/*
 * 2) **Ücretsiz kanalların her biri tek başına yolu açıyor.**
 *
 * Asıl iddia bu. Mağaza araması ve adres dizini context.dev'e hiç dokunmuyor;
 * onların açık olması canlı yolun açık olması için yeterli olmalı.
 */
{
  t(
    sourceWith({ ENABLE_STORE_SEARCH: "true" }) === "live",
    "tek başına mağaza araması yolu açıyor",
  );
  t(
    sourceWith({ ENABLE_PRODUCT_INDEX: "true" }) === "live",
    "tek başına adres dizini yolu açıyor",
  );
  t(
    sourceWith({ ENABLE_STORE_SEARCH: "true", ENABLE_PRODUCT_INDEX: "true" }) === "live",
    "ikisi birlikte de açıyor",
  );
}

/*
 * 3) Ücretli kanal hâlâ tek başına yeterli — ama artık gerekli değil.
 *
 * Eklenen esneklik eskisini kaldırmamalı: context.dev'e krediyle dönen biri
 * için davranış aynı kalıyor.
 */
{
  t(
    sourceWith({ CONTEXT_DEV_API_KEY: "k", ENABLE_CONTEXT_DEV_LIVE: "true" }) === "live",
    "tek başına context.dev yolu açıyor",
  );
}

/*
 * 4) Yarım yapılandırılmış ücretli kanal yolu açmıyor.
 *
 * Anahtar var ama bayrak yok: bu, «henüz açma» demek. Bayrağı yok sayan bir
 * seçim, kullanıcıyı haberi olmadan ücretli bir kanala sokardı.
 */
{
  t(sourceWith({ CONTEXT_DEV_API_KEY: "k" }) === "mock", "anahtar tek başına yetmiyor");
  t(sourceWith({ ENABLE_CONTEXT_DEV_LIVE: "true" }) === "mock", "bayrak tek başına yetmiyor");
}

/*
 * 5) Ücretli kanal kapalıyken sağlayıcı yine de kuruluyor — ve servisi yok.
 *
 * Ücretsiz kanallarla açılmış bir sağlayıcının içinde ölü bir servis nesnesi
 * taşımasının anlamı yok; taşısaydı her taramada bir kez 401 alırdı, ki
 * üretimde ölçülen israfın ta kendisi buydu.
 */
{
  set({ ENABLE_STORE_SEARCH: "true" });
  const provider = getProductProvider();
  t(provider.source === "live", "ücretsiz kanalla canlı sağlayıcı");
  t(
    Object.values(provider).every((value) => value?.constructor?.name !== "ContextDevService"),
    "context.dev servisi hiç kurulmuyor",
  );
}

/*
 * 6) Kaynak adı bir **yetenek**, bir satıcı değil.
 *
 * Log eskiden canlı her kart için `products: "context-dev"` yazıyordu — kartlar
 * mağaza aramasından ve ürün işaretlemesinden gelirken bile, hatta context.dev
 * anahtarı hiç yokken bile. Bir satıcı adı, kanal listesi değiştiğinde yanlışa
 * dönüşür; yetenek adı dönmez.
 */
{
  const source = sourceWith({ ENABLE_STORE_SEARCH: "true" });
  t(source === "live", `kaynak yetenek adı taşıyor: ${source}`);
  t(!/context/i.test(source), "satıcı adı raporlanmıyor");
}

set(env);
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
