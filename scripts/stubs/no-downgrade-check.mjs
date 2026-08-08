/**
 * Canlı yol kataloğu kötüleştirebiliyor mu?
 * `node scripts/stubs/no-downgrade-check.mjs`
 *
 * Bir kez gerçek bir kusur yakaladı: çıkarım ürün sayfası adresi bulamadığında
 * canlı satır `productUrl: ""` ile geliyordu, yine de "en iyi" seçilebiliyordu ve
 * katalogdaki **doğrulanmış bağlantılı** satırın yerine geçiyordu. Yani canlı yol
 * açıldığı anda çalışan bir «Ürüne git» kaybolabiliyordu — canlı verinin
 * katalogdan kötü bir sonuç üretebildiği tek yer.
 *
 * Kural: canlı veri açıldığında hiçbir kullanıcı, kapalıyken sahip olduğu bir
 * şeyi kaybetmemeli. En somut hâli bağlantı — katalogda çalışan bir «Ürüne git»
 * varken, canlıdan gelen bağlantısız bir satır onun yerine geçmemeli.
 */
import { register } from "node:module";
register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevProductProvider } = await import("@/services/productProvider");
const { MOCK_SCENARIOS, hydrateItems } = await import("@/services/mockCatalog");

let pass = 0; const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

function providerReturning(cards) {
  return new ContextDevProductProvider(
    {
      findCandidateUrls: async () => cards.map((c) => c.productUrl || "https://www.trendyol.com/x-p-1"),
      productsFromUrls: async () => cards,
      enrichBrandMetadata: async () => null,
    },
    { maxLiveItems: 4, deadlineMs: 20000, visualRerank: false },
  );
}

const items = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);
const before = items.map((i) => ({ id: i.id, url: i.exactMatch?.productUrl ?? "" }));

// 1) Canlı satır bağlantısız gelirse katalog bağlantısı korunmalı.
{
  const provider = providerReturning([
    {
      title: "Pembe Fermuarlı Triko Hırka", price: 500, currency: "TRY",
      merchantName: "Trendyol", merchantDomain: "trendyol.com",
      productUrl: "", imageUrl: null, inStock: true, brand: null,
      rating: null, reviewCount: null,
    },
  ]);
  const out = await provider.enrich({ items, source: "mock", productSource: "mock", liveItemCount: 0, id: "x", processedAt: "", durationMs: 0 });
  for (const [i, item] of out.items.entries()) {
    const had = before[i].url;
    const now = item.exactMatch?.productUrl ?? "";
    if (had && !now) fails.push(`${item.id}: katalog bağlantısı kayboldu`);
  }
  t(true, "bağlantısız canlı satır");
  const kept = out.items.filter((it, i) => before[i].url && (it.exactMatch?.productUrl ?? "") === before[i].url);
  t(kept.length === before.filter((b) => b.url).length, "bağlantılı katalog satırlarının hepsi korundu");
}

// 2) Canlı satır bağlantılıysa devralması normal.
{
  const provider = providerReturning([
    {
      title: "Pembe Fermuarlı Triko Hırka", price: 500, currency: "TRY",
      merchantName: "Trendyol", merchantDomain: "trendyol.com",
      productUrl: "https://www.trendyol.com/x-p-9999999", imageUrl: null,
      inStock: true, brand: null, rating: 4.5, reviewCount: 10,
    },
  ]);
  const out = await provider.enrich({ items, source: "mock", productSource: "mock", liveItemCount: 0, id: "x", processedAt: "", durationMs: 0 });
  const live = out.items.filter((i) => i.exactMatch?.isLive);
  t(live.length > 0, "bağlantılı canlı satır devralıyor");
  t(live.every((i) => (i.exactMatch?.productUrl ?? "").length > 0), "devralan satırın bağlantısı var");
}

// 3) Hiçbir kartta boş bağlantılı bir CTA kalmamalı.
{
  const provider = providerReturning([
    { title: "Alakasız Ürün", price: 1, currency: "TRY", merchantName: "X",
      merchantDomain: "x.com", productUrl: "", imageUrl: null, inStock: true,
      brand: null, rating: null, reviewCount: null },
  ]);
  const out = await provider.enrich({ items, source: "mock", productSource: "mock", liveItemCount: 0, id: "x", processedAt: "", durationMs: 0 });
  const broken = out.items.flatMap((i) => [i.exactMatch, ...i.alternatives])
    .filter(Boolean)
    .filter((p) => p.isLive && !p.productUrl);
  t(broken.length === 0, `bağlantısız canlı kart kalmadı (${broken.length})`);
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
