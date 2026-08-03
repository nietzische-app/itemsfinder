/**
 * Stok tercihi — `node scripts/stubs/stock-check.mjs`.
 *
 * Tükenmiş bir ürün başrolü alabiliyor mu?
 *
 * Kart «Tükendi» yazıyor, yani kimse kandırılmıyor — ama sonucun en görünür yeri
 * tıklanınca alınamayan bir ürün olursa hedef tersine dönmüş olur. Öte yandan
 * stok her şeyi ezmemeli: doğru ürünün tükenmişi yerine yanlış ürünün stoktakisi
 * başrole geçerse bu daha kötü.
 */
import { register } from "node:module";
register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevProductProvider } = await import("@/services/productProvider");
const { MOCK_SCENARIOS, hydrateItems } = await import("@/services/mockCatalog");

let pass = 0; const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const card = (title, over) => ({
  title, price: 500, currency: "TRY", merchantName: "Trendyol",
  merchantDomain: "trendyol.com", productUrl: "https://www.trendyol.com/x-p-1234567",
  imageUrl: null, inStock: true, brand: null, rating: null, reviewCount: null, ...over,
});

async function run(cards) {
  const provider = new ContextDevProductProvider(
    { searchLiveProducts: async () => cards, enrichBrandMetadata: async () => null },
    { maxLiveItems: 4, deadlineMs: 20000, visualRerank: false },
  );
  const items = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);
  const out = await provider.enrich({ items, source: "mock", productSource: "mock", liveItemCount: 0, id: "x", processedAt: "", durationMs: 0 });
  return out.items.find((i) => i.id === "po-cardigan")?.exactMatch ?? null;
}

// 1) Aynı puanda: stokta olan başrolü almalı.
{
  const best = await run([
    card("Pembe Fermuarlı Triko Hırka", { inStock: false, price: 400 }),
    card("Pembe Fermuarlı Triko Hırka", { inStock: true, price: 500 }),
  ]);
  t(best?.inStock === true, "eşit puanda stokta olan başrolde");
}

// 2) Puan farkı büyükse, daha iyi eşleşme tükenmiş olsa da kazanmalı.
{
  const best = await run([
    card("Pembe Fermuarlı Triko Ceket Yüksek Yaka", { inStock: false }),
    card("Siyah Deri Ceket", { inStock: true }),
  ]);
  t(best !== null, "belirgin daha iyi eşleşme korunuyor");
  t(!/Siyah Deri/.test(best?.title ?? ""), "stok, yanlış ürünü başrole taşımıyor");
}

// 3) Hepsi tükenmişse yine bir sonuç dönmeli (boş ekran değil).
{
  const best = await run([card("Pembe Fermuarlı Triko Hırka", { inStock: false })]);
  t(best !== null, "hepsi tükenmişse bile ürün gösteriliyor");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
