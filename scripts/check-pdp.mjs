/**
 * Lists catalogue products that still have no verified product detail page.
 *
 * Storefront search links are banned (`src/lib/productUrl.ts`), so a product
 * without an entry in `src/data/verifiedProductUrls.ts` renders with no CTA.
 * This is the worklist for filling that file in.
 *
 *   npm run check:pdp
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const { MOCK_SCENARIOS, hydrateProduct } = await import("@/services/mockCatalog");
const { isDirectProductUrl } = await import("@/lib/productUrl");

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
      } else {
        missing.push({
          scenario,
          id: product.id,
          merchant: product.merchant,
          title: product.title,
          exact: row.matchType === "exact",
        });
      }
    }
  }
}

const pct = total === 0 ? 0 : Math.round((linked / total) * 100);
console.log(`\nDoğrulanmış PDP: ${linked}/${total} (%${pct})\n`);

if (missing.length === 0) {
  console.log("Eksik yok — her ürün doğrulanmış bir ürün sayfasına bağlı.");
  process.exit(0);
}

// Exact matches first: those are the CTAs a shopper sees before any alternative.
missing.sort((a, b) => Number(b.exact) - Number(a.exact) || a.id.localeCompare(b.id));

let current = "";
for (const row of missing) {
  if (row.scenario !== current) {
    current = row.scenario;
    console.log(`\n  ${current}`);
  }
  console.log(
    `    ${row.exact ? "★" : " "} ${row.id.padEnd(24)} ${row.merchant.padEnd(9)} ${row.title}`,
  );
}

console.log(
  `\n${missing.length} ürünün bağlantısı yok; bunlar CTA'sız render ediliyor.` +
    "\nDoldurmak için: src/data/verifiedProductUrls.ts (★ = birebir eşleşme, önce bunlar)\n",
);
