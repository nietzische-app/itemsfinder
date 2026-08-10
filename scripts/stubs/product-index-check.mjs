/**
 * Adres dizini üretimde aday üretiyor mu? — `node scripts/stubs/product-index-check.mjs`
 *
 * `check-index.mjs` dizinin **kendisini** ölçüyor: kapsam, dağılım, hız. Burada
 * ölçülen şey **servis**: dosyaları buluyor mu, sorguyu doğru cevaplıyor mu,
 * bulamadığında ne diyor, ve bayrak kapalıyken susuyor mu.
 *
 * İkisi ayrı çünkü ayrı şeyler bozulabiliyor. Dizin kusursuz olabilir ve servis
 * onu dağıtılan pakette bulamayabilir — bu depoda tam olarak o sınıftan bir
 * kusur zaten kayıtlı: işaretleme okuma yolu yalnızca bir dala takılıydı ve
 * bayrak açıkken bile hiç çalışmadı, üretimde tek satır çıkmadı.
 *
 * Sahte bir dizin kuruluyor (`PRODUCT_INDEX_DIR`), yani gerçek dosyalara ve ağa
 * bağlı değil — `VISION_BASE_URL` ile aynı gerekçe.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const dir = mkdtempSync(join(tmpdir(), "dizin-"));

writeFileSync(
  join(dir, "koton.com.txt"),
  [
    "/beyaz-keten-gomlek-uzun-kollu-p-1",
    "/mavi-keten-gomlek-kisa-kollu-p-2",
    "/yesil-keten-gomlek-oversize-p-6",
    "/siyah-kumas-pantolon-p-3",
    "/gri-yuksek-bel-kumas-pantolon-p-4",
    "/saten-bluz-kolsuz-p-5",
  ].join("\n") + "\n",
);
writeFileSync(
  join(dir, "beymen.com.txt"),
  ["/tr/p_keten-gomlek_1", "/tr/p_deri-ceket_2"].join("\n") + "\n",
);

/*
 * Kaçış **aranan ürün adının içinde**: `c%C3%BCzdan` → «cüzdan» → `cuzdan`.
 *
 * Kelimenin dışında olsaydı bu kontrol çözme kaldırılınca yine yeşil kalırdı —
 * ad zaten düz yazılmış başka bir parçadan tutardı. İlk yazdığım vaka tam olarak
 * öyleydi ve kusuru göstermedi; «Gümüş küpe» vakasında bir tur önce ödenmiş ders.
 */
writeFileSync(join(dir, "zara.com.txt"), "/tr/tr/siyah-deri-c%C3%BCzdan-p123.html\n");

process.env.PRODUCT_INDEX_DIR = dir;
process.env.ENABLE_PRODUCT_INDEX = "true";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { getProductIndex, productIndexStatus, ProductIndexSearch } = await import(
  "@/services/productIndex"
);

/*
 * 1) Sorgu cevaplanıyor, ve cevap doğru mağazadan.
 */
{
  const index = getProductIndex();
  t(index !== null, "bayrak açıkken servis kuruluyor");

  const { urls, seen } = index.findProductPages("Keten Gömlek");
  t(seen === 9, `dizinin tamamı tarandı (${seen})`);
  t(urls.length === 3, `üç aday geldi (${urls.length}): ${urls.join(" ")}`);
  t(
    urls.some((u) => u.startsWith("https://www.koton.com/")) &&
      urls.some((u) => u.startsWith("https://www.beymen.com/")),
    "adaylar iki mağazadan da geliyor",
  );
  t(
    urls.every((u) => u.includes("gomlek")),
    "hiçbiri sorguyla ilgisiz değil",
  );
}

/*
 * 2) Mağaza başına tavan — bir sorguya binlerce yol uyabiliyor.
 *
 * Tavan olmasaydı tek mağaza bütün aday listesini doldururdu ve öteki mağaza
 * hiç temsil edilmezdi. Ölçülen şey tam olarak bu: Koton'un iki gömleği var ve
 * Beymen'inki listeye girebiliyor.
 */
{
  const index = new ProductIndexSearch();
  const { urls } = index.findProductPages("Keten Gömlek");
  const koton = urls.filter((u) => u.includes("koton.com")).length;

  // Koton'un **üç** gömleği var: tavan kaldırılırsa üçü de listeye girer ve
  // Beymen'inki `MAX_CANDIDATES` sınırında düşerdi. Üç yazılmasının sebebi bu —
  // iki eşleşmeyle bu kontrol tavan olmadan da yeşil kalırdı.
  t(koton === 2, `mağaza başına en fazla iki aday (${koton})`);
}

/*
 * 2b) Kotayı ilk mağazalar yemiyor — her mağaza sıra alıyor.
 *
 * **Üretimde ölçülmüş bir kusur.** İlk hâli mağazaları tek tek gezip her
 * birinden ikişer aday alıyordu ve mağazalar dosya adına göre — alfabetik —
 * geziliyordu. Dört kotayı ilk iki mağaza dolduruyordu:
 *
 *   4 sayfa, 0 satır — bershka: HTTP 403 ×2; beymen: işaretleme yok ×2
 *
 * Koton ve Zara hiçbir taramada sıra almadı. Aday seçimi alakayla değil
 * **alfabeyle** belirleniyordu.
 *
 * Aşağıdaki kurulum o durumun aynısı: alfabetik olarak ilk iki mağazanın
 * ikişer eşleşmesi var ve dördü de kotayı doldurabilir. Ölçülen iddia, en
 * arkadaki mağazanın yine de listeye girmesi.
 */
{
  const kota = mkdtempSync(join(tmpdir(), "kota-"));
  writeFileSync(join(kota, "aaa.com.txt"), "/keten-gomlek-bir-p-1\n/keten-gomlek-iki-p-2\n");
  writeFileSync(join(kota, "bbb.com.txt"), "/keten-gomlek-uc-p-3\n/keten-gomlek-dort-p-4\n");
  writeFileSync(join(kota, "zzz.com.txt"), "/keten-gomlek-bes-p-5\n");

  process.env.PRODUCT_INDEX_DIR = kota;
  const { urls } = new ProductIndexSearch().findProductPages("Keten Gömlek");
  process.env.PRODUCT_INDEX_DIR = dir;

  t(urls.length === 4, `kota doluyor (${urls.length})`);
  t(
    urls.some((u) => u.includes("zzz.com")),
    `en arkadaki mağaza da sıra alıyor — ${urls.map((u) => new URL(u).hostname).join(", ")}`,
  );
  t(
    new Set(urls.map((u) => new URL(u).hostname)).size === 3,
    "üç mağazanın üçü de temsil ediliyor",
  );

  rmSync(kota, { recursive: true, force: true });
}

/*
 * 3) Sıralama: daha çok kelime tutan öne geçiyor.
 *
 * Sıra burada indirilecek sayfayı belirliyor — ilk ikisi indiriliyor, gerisi
 * hiç görülmüyor. Yanlış sıra, doğru ürünü elde tutup indirmemek demek.
 */
{
  const index = new ProductIndexSearch();
  const { urls } = index.findProductPages("Gri kumaş pantolon");
  t(urls[0]?.includes("gri-yuksek-bel"), `renk de tutan öne geçti: ${urls[0]}`);
}

/*
 * 4) Yüzde kaçışlı yol da eşleşiyor.
 *
 * Dizin ham yolu saklıyor ve sitemap'ler Türkçe harfi kaçışlı yazıyor. Servis
 * `foldUrlPath` kullanmasaydı bu satır hiçbir sorguya cevap veremezdi —
 * `check-index` yolunda bir kez ölçülmüş bir gerileme.
 */
{
  const index = new ProductIndexSearch();
  const { urls } = index.findProductPages("Deri Cüzdan");
  t(urls.length === 1, `kaçışlı ürün adı bulundu (${urls.length})`);
  t(urls[0]?.includes("c%C3%BCzdan"), `adres ham hâliyle döndü: ${urls[0]}`);
}

/*
 * 5) Uymayan sorgu boş dönüyor — «hiçbir şey» diye ilk dördü değil.
 *
 * Sorguda süzülecek kelime yoksa da aynısı: doksan dokuz bin yolun ilk dördünü
 * döndürmek, sorguyla ilgisi olmayan dört sayfa indirmek demek.
 */
{
  const index = new ProductIndexSearch();
  t(index.findProductPages("Halka Küpe").urls.length === 0, "uymayan sorgu boş dönüyor");
  t(index.findProductPages("a").urls.length === 0, "süzülecek kelimesi olmayan sorgu boş dönüyor");
  t(index.findProductPages("a").seen > 0, "ama dizinin tarandığı görünüyor");
}

/*
 * 6) Dizin yoksa **sebebi** söyleniyor — ve yol değişince yeniden yükleniyor.
 *
 * Bu, dağıtımda en olası arıza: dosyalar fonksiyon paketine girmezse aşama
 * sessizce boş döner ve bu «bu üründen yok» gibi görünür. `next.config.mjs`
 * dosyaları izlemeye ekliyor ama bunu doğrulamanın yolu, eksikliğin duyulması.
 */
{
  process.env.PRODUCT_INDEX_DIR = join(dir, "olmayan");
  const { urls, seen, error } = new ProductIndexSearch().findProductPages("Keten Gömlek");

  t(urls.length === 0 && seen === 0, "dizin yokken aday yok");
  t(typeof error === "string" && error.length > 0, `sebep dönüyor: ${error}`);
}

/*
 * 7) Bayrak kapalıyken servis yok — ama durum satırı yine konuşuyor.
 */
{
  process.env.ENABLE_PRODUCT_INDEX = "false";

  t(getProductIndex() === null, "bayrak kapalıyken servis kurulmuyor");
  t(
    /ENABLE_PRODUCT_INDEX/.test(productIndexStatus()),
    `durum hangi bayrağı söylüyor: ${productIndexStatus()}`,
  );
}

/*
 * 8) İşaretleme kapalıysa durum satırı bunu söylüyor.
 *
 * Bu yolun tek çıkarıcısı işaretleme okuma. Kapalıysa bulunan adaylar hiçbir
 * şeye dönüşmüyor ve bu «dizinde ürün yok» gibi görünüyor — mağaza arama
 * kanalında bir kez ödenmiş ders.
 */
{
  process.env.ENABLE_PRODUCT_INDEX = "true";
  process.env.PRODUCT_INDEX_DIR = dir;
  delete process.env.ENABLE_MARKUP_EXTRACT;

  t(
    /ENABLE_MARKUP_EXTRACT/.test(productIndexStatus()),
    `çıkarıcısı yoksa uyarıyor: ${productIndexStatus()}`,
  );
}

rmSync(dir, { recursive: true, force: true });

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
