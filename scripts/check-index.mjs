/**
 * Çıkarılan dizin gerçek sorulara cevap veriyor mu? — `npm run check:index`
 *
 * `build-index.mjs` dizini çıkarıyor ve **boyutunu** söylüyor. Boyut tek başına
 * bir karar vermeye yetmiyor: 2 MB'lık ama hiçbir sorguya cevap veremeyen bir
 * dizin, 20 MB'lık ama veren birinden kötü. Bu betik ikinci yarıyı ölçüyor.
 *
 * ## Sorgular nereden geliyor
 *
 * `eval/coverageCases.ts` — «Bulunamadı» ekranının ölçüsü olan elli altı gerçek
 * Türkçe ürün adı. Buraya kendi sorgu listemi yazmak, dizini kendi yazdığım
 * sınava sokmak olurdu; o liste ise bu turdan bağımsız ve zaten uygulamanın
 * kapsam ölçüsü.
 *
 * ## Neyi ölçüyor
 *
 *  1. **Kapsam** — kaç ürün adı için en az bir aday çıkıyor. Sıfır çıkan her ad
 *     yazılıyor: hangi kategorinin dizinde karşılığı olmadığı okunabilsin.
 *  2. **Dağılım** — adaylar kaç mağazadan geliyor. Hepsi tek mağazadansa dizin
 *     o mağazanın kataloğudur, bir kanal değil.
 *  3. **Hız** — yükleme ve arama süresi. Asıl açık soru bu: dizin tarama anında
 *     okunacaksa, okumanın kendisi taramayı yavaşlatmamalı.
 *
 * Ağ gerektirmiyor; `build:index` çıktısını okuyor.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { queryMatcher, foldUrlPath } from "./kesif-lib.mjs";
import { parseArgs } from "./args.mjs";

const { COVERAGE_CASES } = await import("../eval/coverageCases.ts");

const arg = parseArgs(process.argv.slice(2), { dir: ["dizin"], floor: ["taban"] });
const dir = arg("dir") ?? join(process.cwd(), "data", "urun-adresleri");

/**
 * Kapsam bu sayının altına düşerse betik hata veriyor.
 *
 * Bir kapı, bir rapor değil: dizin depoya yazılacaksa bozuk bir dizinin
 * yayımlanmaması gerekiyor, ve «yayımlamadan önce çıktıya bak» bir kural değil
 * bir dilek. Periyodik bir işin çıktısına kimse baştan sona bakmıyor.
 *
 * Elli altı ölçüldü ve dört koşuda değişmedi. Taban elli: bir mağazanın geçici
 * arızası birkaç ürün adını düşürebilir ve bu kanalın bozulduğu anlamına
 * gelmez — ama üçte biri düştüyse gelir.
 */
const DEFAULT_FLOOR = 50;
const floor = Number(arg("floor") ?? DEFAULT_FLOOR);

if (!existsSync(dir)) {
  console.error(`Dizin yok: ${dir}\nÖnce: npm run build:index`);
  process.exit(2);
}

/*
 * Yükleme ölçülüyor, çünkü üretimde bu maliyet her soğuk başlangıçta ödenecek.
 *
 * Katlama **burada**, sorgu sırasında değil. İlk koşu bunu zorunlu kıldı: sorgu
 * başına 239 ms çıktı ve ölçünce işin neredeyse tamamı sorgudan bağımsız çıktı —
 * her sorgu yüz elli iki bin adresi yeniden ayrıştırıp yeniden katlıyordu. Yol
 * dosyada zaten yol olarak duruyor, yani `new URL` de gereksiz.
 *
 * `foldUrlPath`, `foldPath` değil: yüzde kaçışı çözülmeden katlanan bir yol
 * Türkçe harf taşıyan slug'ları kaybediyor. Bir tur boyunca öyleydi ve ölçüm
 * yakaladı — Bershka 43'ten 30'a düşmüştü.
 */
const loadStart = performance.now();
const stores = [];

for (const file of readdirSync(dir).filter((name) => name.endsWith(".txt")).sort()) {
  const host = file.replace(/\.txt$/, "");
  const paths = readFileSync(join(dir, file), "utf-8").split("\n").filter(Boolean);
  stores.push({ host, paths, folded: paths.map(foldUrlPath) });
}

const loadMs = Math.round(performance.now() - loadStart);
const total = stores.reduce((sum, store) => sum + store.paths.length, 0);

if (total === 0) {
  console.error(`Dizin boş: ${dir}`);
  process.exit(2);
}

console.log(`\n${stores.length} mağaza, ${total} ürün yolu — yükleme ${loadMs} ms\n`);

const bos = [];
const contributors = new Map();
let hit = 0;
let searchMs = 0;
let worst = { query: "", ms: 0 };

for (const { label } of COVERAGE_CASES) {
  const start = performance.now();

  const matcher = queryMatcher(label);
  const perStore = stores.map((store) => ({
    host: store.host,
    urls: matcher
      ? store.folded.flatMap((path, i) =>
          matcher.score(path) >= 0 ? [`https://www.${store.host}${store.paths[i]}`] : [],
        )
      : [],
  }));

  const ms = performance.now() - start;
  searchMs += ms;
  if (ms > worst.ms) worst = { query: label, ms };

  const found = perStore.filter((entry) => entry.urls.length > 0);
  if (found.length === 0) {
    bos.push(label);
    continue;
  }

  hit += 1;
  for (const entry of found) {
    contributors.set(entry.host, (contributors.get(entry.host) ?? 0) + 1);
  }
}

const pct = Math.round((hit / COVERAGE_CASES.length) * 100);
console.log(`  Kapsam: ${hit}/${COVERAGE_CASES.length} ürün adı için aday bulundu (%${pct})`);
console.log(
  `  Hız: sorgu başına ortalama ${Math.round(searchMs / COVERAGE_CASES.length)} ms, ` +
    `en yavaş «${worst.query}» ${Math.round(worst.ms)} ms\n`,
);

console.log("  Hangi mağaza kaç ürün adına cevap veriyor:");
for (const [host, count] of [...contributors].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${host.padEnd(18)} ${String(count).padStart(3)}/${COVERAGE_CASES.length}`);
}

/*
 * Boş dönen adlar tek tek yazılıyor.
 *
 * Bir yüzde «dizin iyi mi» sorusunu cevaplıyor, «neyi eksik» sorusunu değil. Ve
 * ikincisi bu turda üç kez daha kıymetli çıktı: sıfırın sebebi kanalın kendisi
 * mi, bütçe mi, yoksa o mağazada gerçekten o ürün yok mu — üçü üç ayrı iş.
 */
if (bos.length > 0) {
  console.log(`\n  Aday bulunamayan ${bos.length} ürün adı:`);
  for (const label of bos) console.log(`    ${label}`);
}

console.log("");

if (hit < floor) {
  console.error(
    `Kapsam tabanın altında: ${hit} < ${floor}. Bu dizin yayımlanmamalı — ` +
      "yukarıdaki «aday bulunamayan» listesi hangi kategorinin düştüğünü söylüyor.",
  );
  process.exit(1);
}
