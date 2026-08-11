/**
 * Bütün stub süitleri — `npm run check:stubs`.
 *
 * Dokuz ayrı dosya haline geldiler ve dağınık duran bir test, çalıştırılmayan bir
 * testtir. Hepsi ağsız ve saniyeler sürüyor, yani her değişiklikten sonra
 * çalıştırmanın maliyeti yok.
 *
 * Buradakiler `npm run eval`'in ölçemediği şeyi ölçüyor: eval veriye bakıyor
 * (renk doğru mu, kapsam tam mı), bunlar **karara** bakıyor — canlı yol kataloğu
 * ezerse, tükenmiş ürün başrole geçerse, bir puan ölçeksiz gelirse ne oluyor.
 */
import { spawnSync } from "node:child_process";

const SUITES = [
  ["arama merdiveni", "search-ladder-check.mjs"],
  ["mağaza puanı", "rating-check.mjs"],
  ["bağlantı kontrolü", "link-check.mjs"],
  ["canlı yol kataloğu ezmiyor", "no-downgrade-check.mjs"],
  ["stok tercihi", "stock-check.mjs"],
  ["ekran görüntüsü şeridi", "chrome-check.mjs"],
  ["görsel aday bulma", "lens-check.mjs"],
  ["kapalı aşama sessiz kalmıyor", "stage-off-check.mjs"],
  ["Google aday bulma", "cse-check.mjs"],
  ["ücretsiz keşif kararları", "kesif-check.mjs"],
  ["ölü VLM anahtarı susuyor", "vlm-latch-check.mjs"],
  ["teşhis aritmetiği kapanıyor", "dedupe-explain-check.mjs"],
  ["mağaza arama sağlayıcısı", "store-search-check.mjs"],
  ["beklenti başlıkla aynı dilde", "title-match-check.mjs"],
  ["sitemap okuma kararları", "sitemap-check.mjs"],
  ["ürün aşamasının içi ölçülüyor", "spend-check.mjs"],
  ["yanlış bayrak sessiz geçmiyor", "args-check.mjs"],
  ["dizin ağacı geziliyor", "index-build-check.mjs"],
  ["adres dizini aday üretiyor", "product-index-check.mjs"],
  ["reddedilen anahtar susuyor", "auth-latch-check.mjs"],
  ["hız sınırı Upstash yolu", "ratelimit-check.mjs"],
];

let failed = 0;

for (const [name, file] of SUITES) {
  const run = spawnSync(
    process.execPath,
    ["--experimental-transform-types", new URL(`./${file}`, import.meta.url).pathname],
    { encoding: "utf8" },
  );
  const line = (run.stdout ?? "").split("\n").find((l) => /✓ \/ \d+ ✗/.test(l)) ?? "çıktı yok";
  const ok = run.status === 0;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(30)} ${line.trim()}`);
  if (!ok) console.log((run.stdout ?? "").split("\n").filter((l) => l.includes("✗")).join("\n"));
}

console.log(failed === 0 ? "\ntüm süitler yeşil\n" : `\n${failed} süit kırmızı\n`);
process.exit(failed ? 1 : 0);
