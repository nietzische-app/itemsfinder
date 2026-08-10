/**
 * Mağazaların ürün adres dizinini çıkarır — `npm run build:index`
 *
 *   npm run build:index
 *   npm run build:index -- --magaza koton.com
 *   npm run build:index -- --dosya 3        # mağaza başına en fazla 3 sitemap dosyası
 *
 * ## Neden bir betik, neden tarama anında değil
 *
 * Sitemap kanalı ölçüldü ve altı mağazada çalışıyor (`docs/BULUNAMADI.md` 4e).
 * Ama dosya başına 10–15 bin adres var ve bir mağazanın tamamı bunun katları:
 * tarama anında indirilemez. Ölçümün kendi sonunda yazdığı açık soru buydu.
 *
 * Cevap: adresleri **önceden** topla, tarama anında yalnızca yerel arama yap.
 * Bu betik toplama tarafı. Periyodik bir Actions işi çalıştırıyor ve çıktısı
 * depoya yazılıyor — satıcı yok, çalışma anında ağ yok.
 *
 * ## Bu tur ne yapıyor, ne yapmıyor
 *
 * **Ölçüyor.** Dizinin gerçekte ne kadar yer tuttuğu bilinmiyor; bilinmeden
 * nerede saklanacağına karar vermek, bu turda dört kez cezası ödenmiş hatanın
 * aynısı olurdu. Betik dizini çıkarıyor ve **boyutunu bildiriyor**; nasıl
 * sunulacağı o sayı görüldükten sonraki karar.
 *
 * ## Çıktı biçimi neden düz metin
 *
 * Satır başına bir yol (`/kadin-gri-pantolon-p-123`). JSON değil, çünkü tek
 * ihtiyaç duyulan işlem satırlara bölmek ve büyük bir JSON'u ayrıştırmak
 * soğuk başlangıçta bedavaya gelmiyor. Ayrıca düz metin git'te satır satır
 * fark üretiyor: haftaya hangi ürünlerin eklendiği okunabiliyor.
 *
 * Ana bilgisayar dosya adında, yolun içinde değil — aynı bilgiyi on beş bin kez
 * yazmamak için.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { productLinks } from "./kesif-lib.mjs";
import { parseArgs } from "./args.mjs";
import { productSitemaps, sitemapsFor } from "./sitemapFetch.mjs";

const arg = parseArgs(process.argv.slice(2), {
  site: ["magaza"],
  files: ["dosya"],
  out: ["cikti"],
});

/**
 * Sitemap'i ölçülmüş ve **ürün adresi verdiği görülmüş** mağazalar.
 *
 * Dördüncü koşunun sonucu (`docs/BULUNAMADI.md` 4e). Ölçülmemiş mağaza eklemek,
 * her koşuya karşılıksız bir indirme eklemek olurdu; listeye girmenin yolu
 * `npm run check:sitemap`.
 */
const STORES = ["koton.com", "zara.com", "beymen.com", "bershka.com", "pullandbear.com", "gratis.com"];

/**
 * Mağaza başına en fazla kaç sitemap dosyası indirilecek.
 *
 * Bir tavan şart: Koton'un dizininde kaç dosya olduğu bilinmiyor ve tavansız bir
 * koşu Actions'ın on beş dakikasını da, mağazanın sabrını da tüketebilir.
 * Varsayılan kasten düşük — **ilk iş boyutu öğrenmek**, tam dizini almak değil.
 */
const DEFAULT_FILE_BUDGET = 8;

const only = arg("site");
const fileBudget = Number(arg("files") ?? DEFAULT_FILE_BUDGET);
const outDir = arg("out") ?? join(process.cwd(), "data", "urun-adresleri");

if (!Number.isFinite(fileBudget) || fileBudget < 1) {
  console.error(`--dosya bir sayı olmalı (verilen: ${arg("files")})`);
  process.exit(2);
}

const stores = only ? [only] : STORES;

console.log(`\nDizin çıkarılıyor — ${stores.length} mağaza, mağaza başına en fazla ${fileBudget} dosya`);
console.log(`Çıktı: ${outDir}\n`);

mkdirSync(outDir, { recursive: true });

const rows = [];

for (const host of stores) {
  process.stdout.write(`  ${host.padEnd(18)}`);

  const found = await sitemapsFor(host);
  if (found.urls.length === 0) {
    const why = found.robotsError ?? `robots.txt HTTP ${found.robotsStatus ?? "?"}`;
    console.log(why);
    rows.push({ host, outcome: why });
    continue;
  }

  const { leaves, fetched } = await productSitemaps(found.urls, fileBudget);

  /*
   * Uygulamanın kendi süzgeci — ikinci bir kopya değil.
   *
   * `productLinks` `isDirectProductUrl`'ü kullanıyor, yani dizine giren her
   * adres üretimde de ürün sayfası sayılıyor. Ayrı bir süzgeç yazmak, dizinin
   * uygulamanın kullanamayacağı adreslerle şişmesi demekti.
   */
  const paths = new Set();
  let raw = 0;

  for (const leaf of leaves) {
    raw += leaf.locs.length;
    const products = productLinks(
      leaf.locs.map((loc) => `<a href="${loc.replace(/"/g, "&quot;")}">x</a>`).join(""),
      `https://www.${host}/`,
      host,
    );

    for (const url of products) {
      try {
        const parsed = new URL(url);
        paths.add(parsed.pathname + parsed.search);
      } catch {
        // Ayrıştırılamayan adres dizine girmez; sayısı `raw - paths.size`de görünür.
      }
    }
  }

  /*
   * Sıralı yazılıyor: git farkı okunabilir olsun ve iki koşu aynı sonucu
   * verdiğinde dosya gerçekten aynı olsun. Sırasız bir küme her koşuda farklı
   * bir fark üretir ve «bu hafta ne değişti» sorusu cevapsız kalır.
   */
  const sorted = [...paths].sort();
  const body = sorted.join("\n") + (sorted.length > 0 ? "\n" : "");
  const file = join(outDir, `${host}.txt`);
  writeFileSync(file, body, "utf-8");

  const kb = Math.round(Buffer.byteLength(body, "utf-8") / 1024);
  console.log(
    `${String(fetched).padStart(3)} dosya → ${String(raw).padStart(6)} adres → ` +
      `${String(sorted.length).padStart(6)} ürün yolu  (${kb} KB)`,
  );

  rows.push({ host, fetched, raw, kept: sorted.length, kb, files: leaves.length });
}

const total = rows.reduce((sum, row) => sum + (row.kept ?? 0), 0);
const totalKb = rows.reduce((sum, row) => sum + (row.kb ?? 0), 0);

console.log("");
console.log(`  Toplam: ${total} ürün yolu, ${totalKb} KB (sıkıştırılmamış).`);
console.log("");

/*
 * Bütçesi dolan mağaza ayrıca yazılıyor.
 *
 * Tavana dayanmış bir sayı «bu mağazada bu kadar ürün var» demek değil, «daha
 * fazlasına bakılmadı» demek. İkisini ayırmadan yazılan bir toplam, dizinin
 * tamamlandığını sanmaya yol açar.
 */
const capped = rows.filter((row) => row.files >= fileBudget);
if (capped.length > 0) {
  console.log(`  Bütçesi dolan (${fileBudget} dosya): ${capped.map((r) => r.host).join(", ")}`);
  console.log("  Bu mağazalarda daha fazla ürün var — sayı tavan, kapsam değil.");
  console.log("  Tam boyutu görmek için: npm run build:index -- --dosya 40\n");
}
