import "server-only";

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { foldUrlPath, queryMatcher } from "@/lib/storeSearchPage";

/**
 * Aday ürün sayfalarını **önceden toplanmış bir dizinden** bulur — ağa çıkmadan.
 *
 * ## Neden var
 *
 * Aday bulmanın ücretli sağlayıcısı kalmadı (`docs/BULUNAMADI.md` 4c) ve mağaza
 * arama sayfası kanalı on dokuz mağazanın ikisinde çalışıyor: ötekiler ya veri
 * merkezi IP'sine 403 veriyor ya sonuçları sunucuda çizmiyor. Sitemap ikisini de
 * aşıyor — arama motorları için yayımlanıyor ve düz XML.
 *
 * Ama sitemap tarama anında okunamaz: dosya başına 10–15 bin adres var. Bu yüzden
 * adresler **önceden** toplanıyor (`.github/workflows/dizin.yml`, her gece) ve
 * depoya yazılıyor; burada yalnızca yerel arama yapılıyor. Çalışma anında ağ yok,
 * satıcı yok, ödeme yok.
 *
 * ## Ölçülen hâli
 *
 * ```
 * 99.575 ürün yolu, altı mağaza — 6,4 MB ham / 1,3 MB gzip
 * kapsam 56/56 (eval/coverageCases.ts'in gerçek ürün adları)
 * yükleme 93 ms (bir kez), sorgu 12 ms
 * ```
 *
 * ## Neden katlama yüklemede
 *
 * İlk ölçüm sorgu başına 239 ms dedi ve işin neredeyse tamamı sorgudan
 * bağımsız çıktı: her sorgu doksan dokuz bin yolu yeniden ayrıştırıp yeniden
 * katlıyordu. Katlama yükleme anına taşınınca sorgu 12 ms'e indi. Bir taramada
 * on iki sorguya kadar çıkılabiliyor — 239 ms olsaydı bu aşama tek başına üç
 * saniye tutardı.
 */

/** Dizinin depodaki yeri. Bayrakla değiştirilebiliyor — ölçüm sahte dizin verebilsin. */
function indexDir(): string {
  return process.env.PRODUCT_INDEX_DIR?.trim() || join(process.cwd(), "data", "urun-adresleri");
}

/** Mağaza başına en fazla aday — mağaza arama kanalıyla aynı kural. */
const MAX_PER_STORE = 2;

/**
 * Mağazanın adayları **satıra dönüşüyor mu** — ölçülmüş oran.
 *
 * `npm run check:markup`, iki koşu (48'er aday, veri merkezi IP'si). İkincisi
 * sıralama düzeldikten sonra, yani aday dağılımı değişmiş — **oranlar aynı
 * kaldı**, ve bu oranların tesadüf olmadığının ölçüsü:
 *
 * ```
 *                  1. koşu           2. koşu
 * koton.com         9 →  9 (%100)   10 → 10 (%100)
 * gratis.com        6 →  6 (%100)    9 →  9 (%100)
 * beymen.com       13 →  4  (%31)   13 →  4  (%31)   ürün işaretlemesi yok ×9
 * bershka.com      10 →  0   (%0)    8 →  0   (%0)   ürün işaretlemesi yok ×8
 * zara.com          7 →  0   (%0)    7 →  0   (%0)   ürün işaretlemesi yok ×7
 * pullandbear.com   3 →  0   (%0)    1 →  0   (%0)   yetersiz örnek
 *
 * toplam           48 → 19  (%40)   48 → 23  (%48)
 * ```
 *
 * Üçüncü koşu, üretken mağazalar ikinci adaylarını almaya başladıktan sonra:
 * `48 aday → 37 satır (%77)`. Beymen 18 → 7 (%39), Koton ve Gratis yine %100,
 * ötekiler hiç aday almadı.
 *
 * **Bu tablo bir iddia, ve `check:markup` onu sınıyor.** Betik ölçtüğü oranı
 * buradaki sayıyla karşılaştırıyor ve saptığında hata veriyor: bir mağaza
 * işaretleme koyduğunda ya da kaldırdığında burası sessizce eskimesin. Sayıyı
 * kodda tutup doğruluğunu dilemek, ölçmemekle aynı şey.
 *
 * ## Neden sıralama, eleme değil
 *
 * Sıfır oranlı mağazayı dizinden çıkarmak daha basit olurdu ve yanlış olurdu:
 * bir mağazanın schema.org işaretlemesi koyması bir sürüm meselesi, ve
 * çıkarılmış bir mağaza bunu hiç fark ettirmez. Sıralama geri alınabilir bir
 * karar, eleme değil. Ayrıca Pull&Bear'ın sıfırı yalnızca üç örneğe dayanıyor —
 * betiğin kendisi bunu «yetersiz örnek» diye yazıyor.
 *
 * ## Ölçüm neden üretimden bağımsız
 *
 * Sıralama okunamayan mağazaları arkaya atıyor, yani onlar üretimde bir daha
 * kolay kolay sıra almayacak. Bu, ölçümü üretim trafiğine bağlasaydık kendi
 * kuyruğunu yiyen bir kural olurdu: bir daha hiç denenmeyen mağaza, bir daha
 * hiç ölçülemezdi. `check:markup` tam da bu yüzden ayrı bir koşu — yeniden
 * ölçmek için üretimden bir şey beklemek gerekmiyor.
 *
 * **Listede olmayan mağaza elenmiyor**, yalnızca sona düşüyor: ölçülmemiş olmak
 * kötü olmak demek değil.
 */
export const MEASURED_YIELD: Record<string, number> = {
  "koton.com": 1.0,
  "gratis.com": 1.0,
  "beymen.com": 0.31,
  "bershka.com": 0,
  "zara.com": 0,
  "pullandbear.com": 0,
};

/** Bir sorgu için toplam en fazla aday. */
const MAX_CANDIDATES = 4;

interface IndexedStore {
  host: string;
  paths: string[];
  /** Katlanmış hâli, `paths` ile aynı sırada. */
  folded: string[];
}

export interface ProductIndexResult {
  urls: string[];
  /** Dizinde kaç yol tarandı — kaybın nerede olduğunu görmek için. */
  seen: number;
  error?: string;
}

interface LoadedIndex {
  /** Hangi dizinden yüklendiği — önbellek buna göre anahtarlı. */
  dir: string;
  stores: IndexedStore[];
  error?: string;
}

/**
 * Yüklenen dizin modül düzeyinde saklanıyor.
 *
 * Sunucusuz bir dağıtımda her soğuk instance bir kez ödüyor (93 ms), sıcak
 * instance hiç ödemiyor.
 *
 * **Yol anahtarlı**, düz bir bayrak değil: `PRODUCT_INDEX_DIR` değişince
 * yeniden yükleniyor. Bu ölçüm için şart — sahte bir dizinle sürülen kontrol
 * aksi hâlde ilk yüklemeye takılı kalırdı — ama yalnızca ölçüm için değil:
 * yolun değişmesi gerçekten başka bir dizin demek, ve eskisini döndürmek
 * sessizce yanlış cevap vermek olurdu.
 */
let loaded: LoadedIndex | null = null;

function load(): LoadedIndex {
  const dir = indexDir();
  if (loaded?.dir === dir) return loaded;

  const stores: IndexedStore[] = [];
  let error: string | undefined;

  if (!existsSync(dir)) {
    loaded = { dir, stores, error: "dizin dosyaları bulunamadı" };
    return loaded;
  }

  try {
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".txt")).sort()) {
      const host = file.replace(/\.txt$/, "");
      const paths = readFileSync(join(dir, file), "utf-8").split("\n").filter(Boolean);
      if (paths.length === 0) continue;

      stores.push({ host, paths, folded: paths.map(foldUrlPath) });
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message.slice(0, 60) : "dizin okunamadı";
  }

  if (stores.length === 0 && !error) error = "dizin boş";

  loaded = { dir, stores, error };
  return loaded;
}

export class ProductIndexSearch {
  /**
   * Bir sorgu için aday ürün sayfaları.
   *
   * `signal` almıyor: ağ yok, iş 12 ms ve iptal edilecek bir bekleme yok.
   * Almak, olmayan bir iptal noktasını varmış gibi göstermek olurdu.
   */
  findProductPages(query: string): ProductIndexResult {
    const { stores, error } = load();
    if (stores.length === 0) return { urls: [], seen: 0, error };

    const matcher = queryMatcher(query);
    const seen = stores.reduce((sum, store) => sum + store.paths.length, 0);

    // Sorguda süzülecek kelime yoksa aday da yok: doksan dokuz bin yolun ilk
    // dördünü döndürmek, sorguyla ilgisi olmayan dört sayfa indirmek demek.
    if (!matcher) return { urls: [], seen };

    const perStore: Array<{
      host: string;
      hits: Array<{ url: string; score: number }>;
      yield: number;
    }> = [];

    for (const store of stores) {
      const hits: Array<{ url: string; score: number }> = [];

      for (let i = 0; i < store.folded.length; i += 1) {
        const score = matcher.score(store.folded[i]!);
        if (score >= 0) hits.push({ url: `https://www.${store.host}${store.paths[i]}`, score });
      }

      /*
       * Mağaza içinde en çok kelime tutan öne geçiyor — `rankByQuery` ile aynı
       * kural. Sıra burada daha da önemli: bir mağazada bir sorguya binlerce yol
       * uyabiliyor ve indirilecek olan ilk ikisi.
       */
      hits.sort((a, b) => b.score - a.score);
      if (hits.length > 0) {
        perStore.push({
          host: store.host,
          hits: hits.slice(0, MAX_PER_STORE),
          // Ölçülmemiş mağaza sona düşüyor ama eleniyor değil.
          yield: MEASURED_YIELD[store.host] ?? 0,
        });
      }
    }

    /*
     * Mağazalar sırayla, hepsinden birer tane.
     *
     * **Ölçülmüş bir kusur.** İlk hâli mağazaları tek tek gezip her birinden
     * ikişer aday alıyordu, ve mağazalar dosya adına göre — yani alfabetik —
     * geziliyordu. Dört kotayı ilk iki mağaza dolduruyordu: `bershka.com` ve
     * `beymen.com`. Koton, Zara, Gratis ve Pull&Bear hiçbir taramada sıra
     * almadı.
     *
     * Üretimde iki tarama üst üste aynı şeyi yazdı:
     *
     *   4 sayfa, 0 satır — bershka: HTTP 403 ×2; beymen: ürün işaretlemesi yok ×2
     *   4 sayfa, 1 satır — bershka: HTTP 403 ×2; beymen: ürün işaretlemesi yok
     *
     * Yani dizin doğru adayları buluyordu ama kotayı okunamayan iki mağaza
     * yiyordu — ve bunun sebebi alakayla değil **alfabeyle** ilgiliydi.
     *
     * Sıra üç kurala bağlı ve üçü de bir şey söylüyor:
     *
     *  1. **Okunabilirlik** — adayları satıra dönüşen mağaza önde
     *     (`MEASURED_YIELD`, ölçülmüş). Aday bulmak yarım iş; sayfası
     *     okunamayan bir aday karta dönüşmüyor ve kotadan bir yer yiyor.
     *  2. **Alaka** — eşit okunabilirlikte, en iyi eşleşmesi olan mağaza önde.
     *  3. **Temsil** — sonra sırayla birer aday alınıyor, ki tek mağaza kotayı
     *     yemesin.
     *
     * Alfabenin karara girdiği yer kalmadı. Okunabilirlik ölçümü olmadan önce
     * sıra yalnızca alakaya bakıyordu ve dört adayın üçü okunamayan
     * mağazalardan geliyordu — `48 aday → 19 satır (%40)`.
     */
    perStore.sort((a, b) => b.yield - a.yield || b.hits[0]!.score - a.hits[0]!.score);

    /*
     * **Üretken mağaza ikinci adayını, üretmeyen birincisinden önce alıyor.**
     *
     * Sıra düzeldikten sonra ölçüm bir kusur daha gösterdi. Kota dört ve dörtten
     * fazla mağaza eşleştiğinde ilk tur kotayı tek başına dolduruyordu: herkese
     * birer aday, yani %100'lük Koton ikinci adayını alamıyor ve %0'lık Bershka
     * birincisini alıyordu. Ölçülen hâli (48 aday):
     *
     *   koton + gratis                        19 aday → 19 satır
     *   beymen + bershka + zara + pullandbear 28 aday →  4 satır
     *
     * Temsil kuralı aşırıya kaçmıştı: satır ürettiği ölçülmüş bir mağazayla,
     * üretmediği ölçülmüş bir mağazayı eşit saymak çeşitlilik değil kayıp.
     *
     * Bu, alfabetik sıranın tekrarı **değil**: orada bölen şey adın baş harfiydi,
     * burada ölçülmüş satır oranı. Ve turlu dağıtım üretkenlerin **arasında**
     * duruyor, yani tek bir mağaza kotayı yine yiyemiyor.
     *
     * Üretmeyenler elenmiyor, kalan yeri dolduruyorlar: bir mağazanın
     * işaretleme koyması bir sürüm meselesi ve elenmiş bir mağaza bunu hiç fark
     * ettirmez.
     */
    const productive = perStore.filter((store) => store.yield > 0);
    const rest = perStore.filter((store) => store.yield === 0);

    const urls: string[] = [];
    for (const group of [productive, rest]) {
      for (let round = 0; round < MAX_PER_STORE; round += 1) {
        for (const store of group) {
          const hit = store.hits[round];
          if (hit && urls.length < MAX_CANDIDATES) urls.push(hit.url);
        }
      }
    }

    return { urls, seen };
  }
}

export function productIndexEnabled(): boolean {
  return process.env.ENABLE_PRODUCT_INDEX === "true";
}

let cached: ProductIndexSearch | null = null;

export function getProductIndex(): ProductIndexSearch | null {
  if (!productIndexEnabled()) return null;
  cached ??= new ProductIndexSearch();
  return cached;
}

/** Neden çalışmadığı, insan okuyabilir hâlde — öteki yollarla aynı gerekçe. */
export function productIndexStatus(): string {
  if (!productIndexEnabled()) return "kapalı — ENABLE_PRODUCT_INDEX=true değil";

  const { stores, error } = load();
  if (stores.length === 0) {
    return `açık ama okunamadı — ${error ?? "bilinmeyen sebep"} (${indexDir()})`;
  }

  const total = stores.reduce((sum, store) => sum + store.paths.length, 0);

  /*
   * Bu yolun tek çıkarıcısı işaretleme okuma — mağaza arama kanalıyla aynı
   * gerekçe. `web.extract` context.dev'e bağlı ve kredisi bitti, yani işaretleme
   * kapalıysa bulunan adaylar hiçbir şeye dönüşmüyor ve bu «dizinde ürün yok»
   * gibi görünüyor.
   */
  const where = `${stores.length} mağaza, ${total} ürün yolu`;
  if (process.env.ENABLE_MARKUP_EXTRACT !== "true") {
    return `açık (${where}) — ama ENABLE_MARKUP_EXTRACT=true olmadan adaylar karta dönüşmez`;
  }

  return `açık — ${where}`;
}
