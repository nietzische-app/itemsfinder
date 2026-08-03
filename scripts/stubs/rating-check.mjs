/**
 * Mağaza puanının sınırları — `node scripts/stubs/rating-check.mjs`.
 *
 * Puan sayfadan çıkarılan bir sayı ve mağazalar aynı ölçeği kullanmıyor: bazıları
 * on üzerinden yazıyor. 8,4'ü beşe kırpmak «çok beğenilmiş» bir ürünü «mükemmel»
 * gibi gösterirdi, yani ölçeği bilinmeyen bir sayı düzeltilmiyor, atılıyor.
 *
 * Bu dosya bir kez gerçek bir hata yakaladı: puan atıldığında değerlendirme adedi
 * hayatta kalıyordu, yani kart puansız bir «1.240 değerlendirme» gösterebiliyordu.
 * Kural artık kaynakta (`ratingOf`).
 *
 * `normalizeProduct` dışa açık değil ve açmak için bir sebep yok — davranışı
 * `extractProducts` üzerinden ölçmek, üretimde koşan yolun aynısı.
 */
import { register } from "node:module";
register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevService } = await import("@/services/contextDevService");

const CASES = [
  ["normal puan", 4.8, 86, 4.8, 86],
  ["ondalık yuvarlanıyor", 4.37, 1240, 4.4, 1240],
  ["puan yok", null, null, null, null],
  ["on üzerinden — atılmalı", 8.4, 300, null, null],
  ["sıfır — atılmalı", 0, 12, null, null],
  ["negatif — atılmalı", -2, 12, null, null],
  ["tam sınır 5 kabul", 5, 3, 5, 3],
  ["adet yok, puan var", 4.2, null, 4.2, null],
  ["adet sıfır — atılmalı", 4.2, 0, 4.2, null],
];

let pass = 0; const fails = [];
for (const [name, rating, reviewCount, wantR, wantC] of CASES) {
  const svc = new ContextDevService("stub");
  svc.client = {
    web: {
      extract: async () => ({
        data: { products: [{ title: "Test Ürünü", price: 100, currency: "TRY", productUrl: "https://www.trendyol.com/x-p-1234567", rating, reviewCount }] },
      }),
    },
  };
  const [card] = await svc.extractProducts("https://www.trendyol.com/x-p-1234567");
  const ok = (card?.rating ?? null) === wantR && (card?.reviewCount ?? null) === wantC;
  if (ok) pass += 1;
  else fails.push(`${name}: beklenen ${wantR}/${wantC}, çıkan ${card?.rating}/${card?.reviewCount}`);
}
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
