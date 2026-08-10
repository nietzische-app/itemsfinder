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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { productLinks } from "./kesif-lib.mjs";
import { parseArgs } from "./args.mjs";
import { productSitemaps, sitemapsFor } from "./sitemapFetch.mjs";
import { countPaths, keepsPrevious, shrinkReason } from "./indexFile.mjs";

const { isTurkishStorefrontPath } = await import("@/lib/sitemapIndex");

const arg = parseArgs(process.argv.slice(2), {
  site: ["magaza"],
  files: ["dosya"],
  out: ["cikti"],
  force: ["zorla"],
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

/** Teşhis satırlarında adres kısaltması — `check-sitemap.mjs` ile aynı biçim. */
const short = (url) => url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);

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

  const { leaves, fetched, failures } = await productSitemaps(found.urls, fileBudget);

  /*
   * Uygulamanın kendi süzgeci — ikinci bir kopya değil.
   *
   * `productLinks` `isDirectProductUrl`'ü kullanıyor, yani dizine giren her
   * adres üretimde de ürün sayfası sayılıyor. Ayrı bir süzgeç yazmak, dizinin
   * uygulamanın kullanamayacağı adreslerle şişmesi demekti.
   */
  const paths = new Set();
  let raw = 0;
  let foreign = 0;

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
        const path = parsed.pathname + parsed.search;

        /*
         * Yabancı vitrin dizine girmiyor — kural `sitemapIndex.ts`'te ve
         * ölçümle bağlı. Sayısı ayrıca yazılıyor: elenen bir şeyin kaç tane
         * olduğu görünmezse, kuralın fazla yediği fark edilmez.
         */
        if (!isTurkishStorefrontPath(path)) {
          foreign += 1;
          continue;
        }

        paths.add(path);
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

  /*
   * Ani küçülme dolu dosyanın üstüne yazılmıyor — kural `indexFile.mjs`'te ve
   * ağsız ölçülüyor.
   */
  const previous = existsSync(file) ? readFileSync(file, "utf-8") : "";
  /*
   * `--zorla` korumayı atlıyor.
   *
   * Koruma «bu düşüş bir arıza» varsayımına dayanıyor ve bilerek yapılan bir
   * daralmada bu varsayım yanlış: yabancı vitrin süzgeci Bershka'yı 17.197'den
   * 8.111'e indiriyor, yani koruma kasıtlı bir düzeltmeyi arıza sanıp
   * engellerdi. Karar operatörün, ve bayrak onu görünür kılıyor.
   */
  const keptOld = !arg("force") && keepsPrevious(previous, sorted.length);

  if (!keptOld) writeFileSync(file, body, "utf-8");

  const kb = Math.round(Buffer.byteLength(keptOld ? previous : body, "utf-8") / 1024);
  console.log(
    `${String(fetched).padStart(3)} dosya → ${String(raw).padStart(6)} adres → ` +
      `${String(sorted.length).padStart(6)} ürün yolu  (${kb} KB)` +
      (foreign > 0 ? `  [${foreign} yabancı vitrin elendi]` : "") +
      (keptOld ? `  ⚠ ${shrinkReason(previous, sorted.length)}` : ""),
  );

  /*
   * Sıfır çıkan mağazanın **sebebi** yazılıyor.
   *
   * Koşu bunu zorunlu kıldı: Gratis bir koşuda 13.233 ürün yolu verdi, sonraki
   * koşuda `7 dosya → 1258 adres → 0 ürün yolu`. Sayıdan okunabilen tek şey
   * sıfır olduğu; sebebi üç ayrı iş: dosyalar mı açılmadı, açılanlar ürün
   * dosyası değil miydi, yoksa adresler süzgeçten mi düştü?
   *
   * `check-sitemap.mjs` aynı dersi bir tur önce almıştı ve orada teşhis satırı
   * dördüncü koşuda iki mağazayı kurtardı. Aynısı burada da gerekiyor — bir
   * mağazanın sessizce düşmesi, kanalın daraldığını fark etmeden dizini
   * yayımlamak demek.
   */
  if (sorted.length === 0) {
    const pad = " ".repeat(22);
    if (failures.length > 0) {
      console.log(`${pad}${failures.length} dosya açılmadı — ${failures[0].why}: ${short(failures[0].url)}`);
    }
    console.log(`${pad}${leaves.length} ürün dosyası, ${raw} ham adres`);
    for (const leaf of leaves.slice(0, 2)) {
      console.log(`${pad}dosya: ${short(leaf.url)}`);
      for (const loc of leaf.locs.slice(0, 2)) console.log(`${pad}  adres: ${short(loc)}`);
    }
  }

  rows.push({
    host,
    fetched,
    raw,
    // Dizinde **duran** sayı: koruma devreye girdiyse bu, bu koşunun getirdiği
    // değil önceki koşunun bıraktığı sayı. Toplamın diskteki hâli anlatması şart.
    kept: keptOld ? countPaths(previous) : sorted.length,
    fresh: sorted.length,
    kb,
    files: leaves.length,
    failed: failures.length,
    keptOld,
  });
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
/*
 * Koruma devreye girdiyse **özet satırında da** görünüyor.
 *
 * Mağaza satırındaki uyarı altı satırın arasında kalıyor ve periyodik bir işin
 * çıktısına kimse baştan sona bakmıyor. Korunmuş bir dizin taze bir dizin gibi
 * görünmemeli — korumanın bütün değeri görülebilir olmasında.
 */
const protectedRows = rows.filter((row) => row.keptOld);
if (protectedRows.length > 0) {
  console.log(`  ⚠ ${protectedRows.length} mağazada önceki dosya korundu:`);
  for (const row of protectedRows) console.log(`    ${row.host} — bu koşu ${row.fresh} yol getirdi`);
  console.log("");
}

const capped = rows.filter((row) => row.files >= fileBudget);
if (capped.length > 0) {
  console.log(`  Bütçesi dolan (${fileBudget} dosya): ${capped.map((r) => r.host).join(", ")}`);
  console.log("  Bu mağazalarda daha fazla ürün var — sayı tavan, kapsam değil.");
  console.log("  Tam boyutu görmek için: npm run build:index -- --dosya 40\n");
}
