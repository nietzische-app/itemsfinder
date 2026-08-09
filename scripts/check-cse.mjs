/**
 * Google arama kurulumu doğru mu? — `npm run check:cse`
 *
 *   npm run check:cse
 *   npm run check:cse -- --cx=003709... --key=AIza...   (ortam değişkeni yoksa)
 *   npm run check:cse -- --q "siyah deri ceket"
 *
 * **Neden var.** Kurulum bu projedeki en çok adımı olan iş: motor oluştur, «tüm
 * web'de ara» anahtarını aç, Custom Search API'yi etkinleştir, cx'i kopyala,
 * Vercel'e gir, yeniden deploy et. Altı adımın biri atlanınca sonuç aynı: hiç ürün
 * gelmiyor. Bu betik hangisinin atlandığını **tek satırda** söylüyor.
 *
 * **Anahtarı kimseye göndermiyor.** Yalnızca Google'a gidiyor; çıktısında da
 * anahtar yazmıyor. Senin makinende çalışıyor.
 *
 * Ağ gerektiriyor, o yüzden bu betiğin yazıldığı ortamdan sürülemedi — hata
 * yorumlama tarafı `scripts/stubs/cse-check.mjs` ile ölçüldü.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);
const { cseAdvice } = await import("@/services/googleSearch");
const { isDirectProductUrl, isSearchUrl } = await import("@/lib/productUrl");

const args = process.argv.slice(2);
const arg = (name) => {
  const hit = args.find((entry) => entry.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = args.indexOf(`--${name}`);
  return at !== -1 ? args[at + 1] : undefined;
};

const cx = arg("cx") ?? process.env.GOOGLE_CSE_ID?.trim();
const key =
  arg("key") ??
  process.env.GOOGLE_CSE_API_KEY?.trim() ??
  process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ??
  process.env.GOOGLE_VISION_API_KEY?.trim();
const query = arg("q") ?? "siyah deri ceket satın al fiyat";

console.log("");

if (!cx || !key) {
  console.log("✗ Yapılandırma eksik.\n");
  if (!cx) console.log("  GOOGLE_CSE_ID yok — gömme kodundaki «cx=» değeri.");
  if (!key) {
    console.log("  Anahtar yok — GOOGLE_CSE_API_KEY ya da Vision anahtarı.");
  }
  console.log("\n  Değişken kurmadan denemek için:");
  console.log("    npm run check:cse -- --cx=... --key=...\n");
  process.exit(1);
}

console.log(`Sorgu: «${query}»`);
console.log(`Motor: ${cx.slice(0, 6)}…  (anahtar gizli)\n`);

const url = new URL("https://www.googleapis.com/customsearch/v1");
url.searchParams.set("key", key);
url.searchParams.set("cx", cx);
url.searchParams.set("q", query);
url.searchParams.set("num", "10");
url.searchParams.set("hl", "tr");
url.searchParams.set("gl", "tr");

let payload;
try {
  const response = await fetch(url);
  payload = await response.json();

  if (!response.ok || payload.error) {
    const reason = payload?.error?.message ?? `HTTP ${response.status}`;
    console.log(`✗ Google isteği reddetti:\n\n  ${reason}\n`);
    const advice = cseAdvice(reason);
    if (advice !== reason) console.log(`  → ${advice}\n`);
    process.exit(1);
  }
} catch (error) {
  console.log(`✗ İstek gönderilemedi: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}

const links = (payload.items ?? []).map((item) => item.link).filter(Boolean);

if (links.length === 0) {
  console.log("✗ Arama çalıştı ama hiç sonuç dönmedi.\n");
  console.log("  En olası sebep: motor yalnızca eklediğin sitelerde arıyor ve o");
  console.log("  sitelerde bu sorgunun karşılığı yok. Motorun ayarlarında");
  console.log("  «Tüm web'de arama yap» anahtarını aç, ya da mağaza ekle.\n");
  process.exit(1);
}

/*
 * Sonuç var — asıl soru kaçının ürün sayfası olduğu.
 *
 * Uygulamanın kendi süzgeci burada da çalışıyor, çünkü ölçmek istediğimiz şey
 * «Google sonuç verdi mi» değil, **kullanıcıya ürün gösterebilir miyiz**.
 */
const usable = links.filter((link) => isDirectProductUrl(link) && !isSearchUrl(link));

console.log(`✓ Arama çalışıyor — ${links.length} sonuç geldi.\n`);
for (const link of links.slice(0, 10)) {
  const ok = isDirectProductUrl(link) && !isSearchUrl(link);
  console.log(`  ${ok ? "ürün " : "  —  "} ${link.slice(0, 100)}`);
}

console.log("");

if (usable.length === 0) {
  console.log(`✗ Hiçbiri ürün sayfası değil (${links.length} sonucun 0'ı).\n`);
  console.log("  Sonuçlar kategori/liste sayfası ya da mağaza dışı adresler.");
  console.log("  Motor tüm web'de arıyorsa sorgu fazla genel olabilir; sadece");
  console.log("  eklediğin sitelerde arıyorsa o mağazalar yeterli değil.\n");
  process.exit(1);
}

console.log(`✓ ${usable.length}/${links.length} sonuç ürün sayfası — kurulum çalışıyor.\n`);
console.log("  Vercel'de şunlar ayarlıysa canlı ürünler gelmeye başlar:");
console.log("    ENABLE_GOOGLE_CSE=true");
console.log("    GOOGLE_CSE_ID=<bu cx>");
console.log("    ENABLE_MARKUP_EXTRACT=true");
console.log("  Env değişikliğinden sonra yeniden deploy etmeyi unutma.\n");
