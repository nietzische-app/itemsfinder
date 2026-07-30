/**
 * Worklist for `src/data/verifiedProductUrls.ts`.
 *
 * Storefront search links are banned as product CTAs (`src/lib/productUrl.ts`), so
 * a catalogue product with no entry in that file renders with no "Ürüne git" button
 * at all. This prints what is missing, in the order the work actually gets done.
 *
 *   npm run check:pdp                    everything, grouped by retailer
 *   npm run check:pdp -- --exact         only the rows a shopper sees first
 *   npm run check:pdp -- --merchant=Zara one retailer at a time
 *   npm run check:pdp -- --paste         just the code block to paste
 *
 * Grouped by **retailer**, not by look: filling this in means opening one store,
 * finding its products, then moving to the next. Each row carries a search link
 * for that store so the product page is one click away — a research aid, not a
 * product URL. Pasting one of those links into the file by mistake is caught at
 * import: `verifiedProductUrls.ts` throws on a search-shaped URL.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const { MOCK_SCENARIOS, hydrateProduct } = await import("@/services/mockCatalog");
const { isDirectProductUrl } = await import("@/lib/productUrl");
const { merchantHost } = await import("@/services/merchantSearch");

const args = process.argv.slice(2);
const EXACT_ONLY = args.includes("--exact");
const PASTE_ONLY = args.includes("--paste");
const MERCHANT = args.find((arg) => arg.startsWith("--merchant="))?.split("=")[1];

/** Where a human would look this product up on that retailer. */
function researchUrl(merchant, query) {
  const host = merchantHost(merchant);
  const term = encodeURIComponent(query);

  if (/trendyol/.test(host)) return `https://www.trendyol.com/sr?q=${term}`;
  if (/zara/.test(host)) return `https://www.zara.com/tr/tr/search?searchTerm=${term}`;
  if (/amazon/.test(host)) return `https://www.amazon.com.tr/s?k=${term}`;
  if (/sephora/.test(host)) return `https://www.sephora.com.tr/search?q=${term}`;
  if (/hm\.com/.test(host)) return `https://www2.hm.com/tr_tr/search-results.html?q=${term}`;
  if (/mango/.test(host)) return `https://shop.mango.com/tr/search?q=${term}`;
  if (/asos/.test(host)) return `https://www.asos.com/search/?q=${term}`;
  return `https://${host}`;
}

let total = 0;
let linked = 0;
const missing = [];

for (const [scenario, items] of Object.entries(MOCK_SCENARIOS)) {
  for (const item of items) {
    const rows = [...(item.exactMatch ? [item.exactMatch] : []), ...item.alternatives];
    for (const row of rows) {
      const product = hydrateProduct(row);
      total += 1;

      if (product.productUrl && isDirectProductUrl(product.productUrl)) {
        linked += 1;
        continue;
      }

      missing.push({
        scenario,
        id: product.id,
        merchant: product.merchant,
        title: product.title,
        query: row.searchQuery || product.title,
        exact: row.matchType === "exact",
      });
    }
  }
}

const filtered = missing.filter(
  (row) =>
    (!EXACT_ONLY || row.exact) &&
    (!MERCHANT || row.merchant.toLowerCase() === MERCHANT.toLowerCase()),
);

if (!PASTE_ONLY) {
  const pct = total === 0 ? 0 : Math.round((linked / total) * 100);
  console.log(`\nDoğrulanmış PDP: ${linked}/${total} (%${pct})`);
}

if (missing.length === 0) {
  console.log("\nEksik yok — her ürün doğrulanmış bir ürün sayfasına bağlı.\n");
  process.exit(0);
}

// Group by retailer, most work first: that is the order someone actually works in.
const byMerchant = new Map();
for (const row of filtered) {
  if (!byMerchant.has(row.merchant)) byMerchant.set(row.merchant, []);
  byMerchant.get(row.merchant).push(row);
}

const groups = Array.from(byMerchant.entries()).sort(
  (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
);

// Exact matches first within a retailer: those are the CTAs a shopper sees before
// expanding anything.
for (const [, rows] of groups) {
  rows.sort((a, b) => Number(b.exact) - Number(a.exact) || a.id.localeCompare(b.id));
}

if (!PASTE_ONLY) {
  const exactCount = filtered.filter((row) => row.exact).length;
  console.log(
    `Eksik: ${filtered.length} satır, ${groups.length} mağaza ` +
      `(${exactCount} tanesi birebir eşleşme — önce bunlar)\n`,
  );

  for (const [merchant, rows] of groups) {
    const exact = rows.filter((row) => row.exact).length;
    console.log(
      `\n▸ ${merchant} — ${rows.length} ürün` +
        (exact > 0 ? ` (${exact} birebir eşleşme)` : ""),
    );

    for (const row of rows) {
      console.log(`  ${row.exact ? "★" : "·"} ${row.id}`);
      console.log(`      ${row.title}`);
      console.log(`      ara: ${researchUrl(row.merchant, row.query)}`);
    }
  }

  console.log(
    "\n" +
      "Nasıl doldurulur:\n" +
      "  1. «ara» bağlantısını aç, ürünü bul, ürün sayfasının URL'ini kopyala.\n" +
      "  2. Aşağıdaki bloğu src/data/verifiedProductUrls.ts içindeki\n" +
      "     VERIFIED_PDP_URLS nesnesine yapıştır ve boş stringleri doldur.\n" +
      "  3. `npm run check:pdp` ile kontrol et. Yanlış şekilli bir URL\n" +
      "     (arama sayfası, kategori sayfası) import sırasında hata verir —\n" +
      "     yani kırık bir bağlantı siteye çıkamaz.\n" +
      "\n" +
      "  Kısmi doldurma sorun değil: girdisi olmayan ürün CTA'sız render edilir,\n" +
      "  «Bağlantı doğrulanmadı» yazar. Uydurma bağlantıdan iyidir.\n",
  );
}

console.log("/* ---- verifiedProductUrls.ts ---- */");
for (const [merchant, rows] of groups) {
  console.log(`  // ${merchant}`);
  for (const row of rows) {
    console.log(`  "${row.id}": "",${row.exact ? " // ★ birebir eşleşme" : ""}`);
  }
}
console.log("/* -------------------------------- */\n");
