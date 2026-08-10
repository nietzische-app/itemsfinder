/**
 * Ürün aşamasının içi ölçülüyor mu? — `node scripts/stubs/spend-check.mjs`
 *
 * ## Neden var
 *
 * `ms.products` üretimde 3.5–4.9 saniye ve tek bir sayı. «Yavaş» demeye yetiyor,
 * «neyi hızlandıracağız» demeye yetmiyor: içinde üç ayrı iş var — mağaza araması,
 * sayfa indirip işaretleme okuma, ve ürün görsellerini indirip kırpımla
 * karşılaştırma. Hangisinin ne yediğini bilmeden hızlandırmaya çalışmak, bu
 * projede üç kez pişman olunan şeyin aynısı olurdu.
 *
 * Ama muhasebenin kendisi de ölçülmeli. Boş bir alan yazıp «ölçtük» sanmak,
 * ölçmemekten kötü: sayı olmadığında insan bakar, yanlış sayı olduğunda bakmaz.
 *
 * ## Neden `görsel` anahtarının YOKLUĞU da ölçülüyor
 *
 * Yapılmamış bir iş sıfır milisaniye değil, **hiç** olmalı. Sıfır yazan bir alan
 * «yapıldı ve bedavaydı» diyor; olmayan bir alan «yapılmadı» diyor. İkisi ayrı
 * şeyler ve karışırlarsa, kapalı bir aşama hızlı bir aşama gibi görünür.
 */
import { register } from "node:module";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevProductProvider } = await import("@/services/productProvider");
const { MOCK_SCENARIOS, hydrateItems } = await import("@/services/mockCatalog");
const { createTrace } = await import("@/lib/scanTrace");

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const CARD = {
  title: "Pembe Fermuarlı Triko Hırka",
  price: 500,
  currency: "TRY",
  merchantName: "Trendyol",
  merchantDomain: "trendyol.com",
  productUrl: "https://www.trendyol.com/marka/hirka-p-123456789",
  imageUrl: null,
  inStock: true,
  brand: null,
  rating: null,
  reviewCount: null,
};

/** Çıkarımı yavaşlatan sahte bir sağlayıcı: süre gerçekten ölçülüyor mu? */
function provider(extractDelayMs = 0) {
  return new ContextDevProductProvider(
    {
      findCandidateUrls: async () => [CARD.productUrl],
      productsFromUrls: async () => {
        if (extractDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, extractDelayMs));
        return [CARD];
      },
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 4, deadlineMs: 20_000, visualRerank: false },
  );
}

const items = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);
const result = { items, source: "mock", productSource: "mock", liveItemCount: 0, id: "x", processedAt: "", durationMs: 0 };

/*
 * 1) Çıkarım süresi kaydediliyor ve gerçek.
 *
 * Sahte sağlayıcı 120 ms bekletiliyor; kayıtlı süre bunun altındaysa ölçüm
 * gerçek işi değil, kendi çağrı masrafını sayıyor demektir.
 */
{
  const trace = createTrace({ detail: false });
  await provider(120).enrich(result, { trace });
  const spent = trace.snapshot().spent;

  t(typeof spent["çıkarım"] === "number", `çıkarım süresi kaydedildi: ${JSON.stringify(spent)}`);
  t(spent["çıkarım"] >= 120, `kaydedilen süre gerçek işi kapsıyor (${spent["çıkarım"]} ≥ 120)`);
}

/*
 * 2) Yapılmayan iş yazılmıyor.
 *
 * Fotoğraf taşınmadığında görsel karşılaştırma hiç çalışmıyor. Sıfır yazan bir
 * alan «yapıldı ve bedavaydı» der; olmayan alan «yapılmadı» der.
 */
{
  const trace = createTrace({ detail: false });
  await provider().enrich(result, { trace });
  const spent = trace.snapshot().spent;

  t(!("görsel" in spent), `fotoğrafsız taramada görsel anahtarı yok: ${JSON.stringify(Object.keys(spent))}`);
  t(!("arama" in spent), "mağaza yolu kapalıyken arama anahtarı yok");
}

/*
 * 3) Anahtarlar taramanın tamamı için toplanıyor.
 *
 * Parça başına değil: bir taramada dört parça çözülüyor ve dördünün çıkarımı da
 * aynı kalemde birikmeli, yoksa toplam okunamaz.
 */
{
  const trace = createTrace({ detail: false });
  await provider(40).enrich(result, { trace });
  const spent = trace.snapshot().spent;

  t(
    spent["çıkarım"] >= 40 * Math.min(items.length, 4),
    `dört parçanın çıkarımı da toplanıyor (${spent["çıkarım"]}, ${items.length} parça)`,
  );
}

/*
 * 4) Parçalar tek dalgada çözülüyor mu?
 *
 * Üretim ölçümü sebebi verdi: bir taramada harcanan iş 6762 ms, aşama 3883 ms
 * sürdü. Yani iş paralel yapılıyor ama **yetince paralel değil** — dört parça
 * iki dalga hâlindeydi ve ikinci dalga birincinin bitmesini bekliyordu.
 *
 * Ölçülen şey ayar değeri değil **duvar saati**: `concurrency` alanına 4 yazıp
 * «paralel oldu» saymak, ayarın gerçekten dalgayı birleştirdiğini göstermez.
 * Sahte sağlayıcı her parçada 150 ms bekletiliyor; tek dalgada toplam süre bir
 * beklemeye yakın kalmalı, iki dalgada ikiye katlanır.
 */
{
  const DELAY = 150;
  const trace = createTrace({ detail: false });

  const startedAt = Date.now();
  await provider(DELAY).enrich(result, { trace });
  const wall = Date.now() - startedAt;

  const parcalar = Math.min(items.length, 4);
  t(parcalar >= 3, `ölçüm anlamlı olacak kadar parça var (${parcalar})`);

  /*
   * Eşik ikisinin **ortasında**, sınırında değil.
   *
   * İlk hâli `2×DELAY` idi ve bozarak ölçünce 303 ms çıktı — sınırın üç
   * milisaniye üstünde. Hızlı bir makinede 299 çıkıp yanlış tarafa düşerdi, yani
   * kontrol bazen ısırır bazen ısırmazdı. Tek dalga ~DELAY, iki dalga ~2×DELAY;
   * 1.5 ikisini de rahat ayırıyor.
   */
  t(
    wall < DELAY * 1.5,
    `parçalar tek dalgada çözülüyor (${wall} ms < ${DELAY * 1.5} ms)`,
  );
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
