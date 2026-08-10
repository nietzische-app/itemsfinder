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

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
