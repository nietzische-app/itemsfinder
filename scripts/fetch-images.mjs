/**
 * Collects real product photographs for the catalogue.
 *
 * Reads every verified PDP from `src/data/verifiedProductUrls.ts`, fetches the
 * page, and pulls its canonical image out of the Open Graph tags — which is the
 * image the retailer itself nominates to represent the product, so it is the right
 * one to show and the right one to attribute.
 *
 *   npm run fetch:images
 *   npm run fetch:images -- --paste     just the code block
 *
 * **Runs on your machine, not in CI.** It needs a network route to the retailers,
 * and the sandbox this was written in has none.
 *
 * The output is a URL, not a file: the image stays on the retailer's CDN. Copying it
 * into `public/` would be republishing someone else's photograph; hotlinking the
 * image of a product you are linking to is the normal arrangement.
 *
 * Nothing is written automatically — it prints a block for you to paste, so a
 * wrong-looking image never lands in the repo without someone having seen it.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const { VERIFIED_PDP_URLS } = await import("@/data/verifiedProductUrls");

const PASTE_ONLY = process.argv.includes("--paste");
const TIMEOUT_MS = 15_000;

const entries = Object.entries(VERIFIED_PDP_URLS);

if (entries.length === 0) {
  console.error(
    "\nVERIFIED_PDP_URLS boş. Görselleri toplamak için önce ürün sayfası\n" +
      "adreslerine ihtiyaç var: «npm run check:pdp» çalışma listesini basar.\n",
  );
  process.exit(1);
}

/**
 * First matching Open Graph / Twitter / JSON-LD image.
 *
 * Implementation lives in `src/lib/productImage.ts` so the live extract path and
 * this offline collector cannot disagree on which tags count. `npm run eval`
 * scores the same function against `eval/ogImageCases.ts`.
 */
const { extractProductImageFromHtml } = await import("@/lib/productImage");

export function extractImage(html, pageUrl) {
  return extractProductImageFromHtml(html, pageUrl);
}

const found = [];
const failed = [];

for (const [productId, pageUrl] of entries) {
  try {
    const response = await fetch(pageUrl, {
      // Retailers serve a different page — or a bot wall — to a bare fetch.
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "tr-TR,tr;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      failed.push({ productId, reason: `HTTP ${response.status}` });
      continue;
    }

    const html = await response.text();
    const image = extractImage(html, response.url);

    if (image) {
      found.push({ productId, image });
      if (!PASTE_ONLY) console.log(`  ✓ ${productId}`);
    } else {
      failed.push({ productId, reason: "og:image yok" });
    }
  } catch (error) {
    failed.push({ productId, reason: error instanceof Error ? error.message : String(error) });
  }
}

if (!PASTE_ONLY) {
  console.log(`\n${found.length}/${entries.length} ürün için görsel bulundu.`);

  if (failed.length > 0) {
    console.log("\nBulunamayanlar:");
    for (const row of failed) console.log(`  ✗ ${row.productId.padEnd(24)} ${row.reason}`);
    console.log(
      "\n  Bir mağaza bot duvarı arkasındaysa ya da görseli JavaScript ile\n" +
        "  yüklüyorsa og:image gelmez. O ürünler silüetle kalır — sorun değil,\n" +
        "  kısmi doldurma destekleniyor.",
    );
  }

  console.log(
    "\nAşağıdaki bloğu src/data/verifiedProductUrls.ts içindeki\n" +
      "VERIFIED_PDP_IMAGES nesnesine yapıştır. **Yapıştırmadan önce\n" +
      "görsellere bak** — og:image bazen bir kombin fotoğrafı ya da mağaza\n" +
      "logosu olur, ve yanlış görsel yanlış üründen daha kötü görünür.\n",
  );
}

console.log("/* ---- VERIFIED_PDP_IMAGES ---- */");
for (const row of found) {
  console.log(`  "${row.productId}": "${row.image}",`);
}
console.log("/* ----------------------------- */\n");
