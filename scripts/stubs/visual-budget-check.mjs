/**
 * Görsel ölçüm bütçesi — `node scripts/stubs/visual-budget-check.mjs`
 *
 * ## Neden var
 *
 * Bu aşama artık yalnızca sıralamayı belirlemiyor; bir satırın «birebir eşleşme»
 * olup olmadığına da karar veriyor (`visuallyCorroborated`). Yani ölçümün hiç
 * yapılamaması o kararı **sessizce** değiştiriyor.
 *
 * Üretimde `görsel %` hiç yazmayan bir satır görüldü — ve dört ayrı durum aynı
 * görünüyordu: ürün görseli yok, indirilemedi, betimlenemedi, ya da satır aday
 * listesine hiç girmedi. Dördünün de yapılacak işi farklı.
 *
 * ## Ölçtüğü kusur
 *
 * Adaylar **önce kesilip sonra süzülüyordu**: `slice(0, 4)` sonra
 * `filter(görseli var mı)`. En iyi dört satırın görseli yoksa hiçbir şey
 * ölçülmüyordu — beşinci satırın fotoğrafı elde dururken.
 *
 * ## Neden indirme sürülmüyor
 *
 * `remoteImage` ürün görsellerini yalnızca `https` üzerinden indiriyor ve bu
 * kasıtlı: adresler bir perakendeci sayfasından çıkarılıyor, yani saldırgana
 * yakın girdi. Yerel bir sahte sunucuya ulaşmak için o kuralı gevşetmek,
 * ölçüm uğruna bir güvenlik özelliğini kaldırmak olurdu. Ölçülen şey zaten
 * indirme değil, **hangi satırların aday olduğu** — ve o karar saf.
 */
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { visualCandidateRows, ContextDevProductProvider } = await import(
  "@/services/productProvider"
);
const { createTrace } = await import("@/lib/scanTrace");
const sharp = (await import("sharp")).default;

const row = (url, score, imageUrl) => ({
  card: { productUrl: url, imageUrl, title: url, merchantDomain: "m.com" },
  agreement: { score },
});

/*
 * 1) **Görseli olmayan satırlar bütçeyi yemiyor.**
 *
 * Asıl iddia. İlk üç satır daha yüksek puanlı ama görselsiz; bütçe 2. Önce kesen
 * bir sıra hiçbir aday üretmezdi.
 */
{
  const picked = visualCandidateRows(
    [
      row("u1", 0.9),
      row("u2", 0.85),
      row("u3", 0.8),
      row("u4", 0.5, "https://cdn.example.com/a.jpg"),
    ],
    2,
  );

  t(picked.length === 1, `kullanılabilir tek satır seçiliyor (${picked.length})`);
  t(picked[0]?.card.productUrl === "u4", `doğru satır: ${picked[0]?.card.productUrl}`);
}

/*
 * 2) Bütçe hâlâ bütçe.
 *
 * Süzgeci öne almak tavanı kaldırmak değil: her aday bir dış istek ve o maliyet
 * paylaşılan fonksiyon bütçesinden çıkıyor.
 */
{
  const picked = visualCandidateRows(
    [
      row("a", 0.9, "https://cdn.example.com/1.jpg"),
      row("b", 0.8, "https://cdn.example.com/2.jpg"),
      row("c", 0.7, "https://cdn.example.com/3.jpg"),
      row("d", 0.6, "https://cdn.example.com/4.jpg"),
    ],
    2,
  );

  t(picked.length === 2, `tavan korunuyor (${picked.length} ≤ 2)`);
  t(
    picked.map((entry) => entry.card.productUrl).join(",") === "a,b",
    `en yüksek puanlılar seçiliyor: ${picked.map((e) => e.card.productUrl).join(",")}`,
  );
}

/*
 * 3) Sıralama süzgeçten sonra da doğru.
 *
 * Süzmek sırayı bozarsa bütçe yanlış satırlara gider — düşük puanlı ama görselli
 * bir satır, yüksek puanlı görselli bir satırın önüne geçemez.
 */
{
  const picked = visualCandidateRows(
    [
      row("düşük", 0.3, "https://cdn.example.com/l.jpg"),
      row("görselsiz", 0.95),
      row("yüksek", 0.9, "https://cdn.example.com/h.jpg"),
    ],
    1,
  );

  t(picked[0]?.card.productUrl === "yüksek", `sıra korunuyor: ${picked[0]?.card.productUrl}`);
}

/*
 * 4) Hiç aday yoksa **sebep yazılıyor**.
 *
 * Sessiz bir boşluk, «birebir eşleşme» kararını görünmez biçimde değiştirir.
 * Burada tam akış sürülüyor — ağ gerekmiyor, çünkü aday listesi zaten boş.
 */
{
  const trace = createTrace({ detail: true });
  const provider = new ContextDevProductProvider(null, { visualCandidates: 2 });

  const photo = await sharp({
    create: { width: 128, height: 128, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .jpeg()
    .toBuffer();

  const measured = await provider.measureVisualSimilarity(
    [row("x", 0.9)],
    {
      id: "i1",
      itemType: "Ayakkabı",
      boundingBox: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    },
    new AbortController().signal,
    { buffer: photo },
    [],
    trace,
  );

  const notes = trace.snapshot().degraded.filter((d) => /görsel ölçüm/.test(d.reason));

  t(measured.size === 0, "ölçüm yok");
  t(notes.length === 1, `not düşülüyor (${notes.length})`);
  t(/ürün görseli yok/.test(notes[0]?.reason ?? ""), `sebep yazılı: ${notes[0]?.reason}`);
  t(
    /«Ayakkabı»/.test(notes[0]?.reason ?? ""),
    "hangi parça olduğu yazılı — birden fazla parça varken şart",
  );
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
