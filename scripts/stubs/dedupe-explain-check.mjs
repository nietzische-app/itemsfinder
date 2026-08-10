/**
 * Teşhis aritmetiği kapanıyor mu? — `node scripts/stubs/dedupe-explain-check.mjs`
 *
 * Üretimde sayılar tutmuyordu: 18 ham tespit, 3 kalan, **17 elenen**. 3 + 17 = 20.
 * Bir teşhis aracının kendi aritmetiği tutmuyorsa söylediği hiçbir şeye
 * güvenilmez — ve bu araç tam olarak «bu tarama neden bu sonucu verdi» sorusunu
 * cevaplamak için var.
 *
 * Sebep: sağ kalanlar **kutu referansıyla** bulunuyordu. Aynı aileden iki komşu
 * kutu birleştiğinde sağ kalan `{ ...existing, box: unionBox(...) }` oluyor, yani
 * kutusu artık hiçbir adayın kutusu değil — birleşmeden sağ çıkan parça da
 * «temizlikte elendi» diye yazılıyordu.
 *
 * Ölçülen: her adayın tam olarak bir kere hesabının verilmesi, ve birleştirmenin
 * elemeden ayrı bir şey söylemesi.
 */
import { register } from "node:module";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { dedupeDetections, explainDedupe } = await import("@/lib/detectionFilter");

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const box = (x, y, w, h) => ({ x, y, width: w, height: h });

/*
 * 1) Bir çift ayakkabı: iki komşu kutu, tek sıcak nokta.
 *
 * Üretimdeki sayı taşmasının kaynağı bu — birleştirme kutuyu değiştiriyor.
 */
{
  const candidates = [
    { name: "Shoe", score: 0.9, box: box(0.2, 0.8, 0.1, 0.1), family: "footwear" },
    { name: "Shoe", score: 0.85, box: box(0.35, 0.8, 0.1, 0.1), family: "footwear" },
  ];

  const detections = dedupeDetections(candidates, { maxItems: 4 });
  t(detections.length === 1, `iki ayakkabı tek sıcak noktaya indi (${detections.length})`);

  const explained = explainDedupe(candidates, detections);
  const dropped = explained.filter((entry) => entry.reason);
  const survived = explained.filter((entry) => !entry.reason);

  t(survived.length === 1, `bir aday sağ kalan sayılıyor (${survived.length})`);
  t(dropped.length === 1, `bir aday gerekçeli (${dropped.length})`);

  /*
   * Asıl kontrol: aritmetik. Kalan + elenen = aday. Eski hâlinde 1 + 2 = 3
   * çıkıyordu, yani iki adaydan üç satır.
   */
  t(
    detections.length + dropped.length === candidates.length,
    `kalan + elenen = aday (${detections.length} + ${dropped.length} ≠ ${candidates.length})`,
  );

  t(
    /birleştirildi/.test(dropped[0]?.reason ?? ""),
    `gerekçe birleştirme diyor: «${dropped[0]?.reason}»`,
  );
  t(
    !/temizlikte elendi/.test(dropped[0]?.reason ?? ""),
    "birleştirme eleme gibi yazılmıyor",
  );
}

/*
 * 2) Gerçekten elenen bir aday, birleştirme diye yazılmamalı.
 *
 * İki gerekçe iki farklı şey söylüyor ve ikisini karıştırmak, çalışan bir
 * birleştirmeyi arıza ya da gerçek bir elemeyi zararsız gibi gösterir.
 */
{
  const candidates = [
    { name: "Clothing", score: 0.9, box: box(0.1, 0.1, 0.6, 0.6), family: "top" },
    // Tamamen içerde: yinelenen, ve daha özel olan tutulur.
    { name: "Jacket", score: 0.88, box: box(0.15, 0.15, 0.5, 0.5), family: "outerwear" },
    // Uzakta, ilgisiz aile: hiçbir tespitin içinde değil.
    { name: "Hat", score: 0.2, box: box(0.8, 0.02, 0.08, 0.06), family: "hat" },
  ];

  const detections = dedupeDetections(candidates, { maxItems: 4, minScore: 0.5 });
  const explained = explainDedupe(candidates, detections);
  const dropped = explained.filter((entry) => entry.reason);

  t(
    detections.length + dropped.length === candidates.length,
    `kalan + elenen = aday (${detections.length} + ${dropped.length} ≠ ${candidates.length})`,
  );

  const hat = explained.find((entry) => entry.candidate.name === "Hat");
  t(
    /temizlikte elendi/.test(hat?.reason ?? ""),
    `güven eşiğinin altındaki aday eleme diye yazılıyor: «${hat?.reason}»`,
  );
  t(!/birleştirildi/.test(hat?.reason ?? ""), "eleme birleştirme gibi yazılmıyor");
}

/*
 * 3) Aynı adayı iki tespit sahiplenemiyor.
 *
 * Eşleme `name + score + family` üçlüsüyle yapılıyor ve bir fotoğrafta aynı
 * sınıftan aynı güvenle iki kutu gelmesi olağan. Her tespit **tek** bir adayı
 * tüketmezse, aynı aday iki kez sağ kalan sayılır ve aritmetik yine açılır.
 */
{
  const candidates = [
    { name: "Top", score: 0.8, box: box(0.05, 0.1, 0.2, 0.2), family: "top" },
    { name: "Top", score: 0.8, box: box(0.7, 0.1, 0.2, 0.2), family: "top" },
  ];

  // İkisi de uzak: birleşmiyorlar, ikisi de kalıyor.
  const detections = dedupeDetections(candidates, { maxItems: 4, mergeGap: 0.01 });
  t(detections.length === 2, `iki ayrı tespit (${detections.length})`);

  const explained = explainDedupe(candidates, detections);
  t(
    explained.filter((entry) => !entry.reason).length === 2,
    "özdeş alanlı iki aday da sağ kalan sayılıyor",
  );
  t(
    explained.filter((entry) => entry.reason).length === 0,
    "hiçbiri elenmiş gibi yazılmıyor",
  );
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
