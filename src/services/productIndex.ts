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

    const perStore: Array<Array<{ url: string; score: number }>> = [];

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
      if (hits.length > 0) perStore.push(hits.slice(0, MAX_PER_STORE));
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
     * Sıra iki kurala bağlı, ve ikisi de bir şey söylüyor: mağazalar en iyi
     * eşleşmesine göre sıralanıyor (alaka), sonra sırayla birer aday alınıyor
     * (temsil). Alfabenin karara girdiği yer kalmadı.
     *
     * Okunabilirliğe göre sıralamak daha iyi olurdu — ama o veri henüz yok,
     * çünkü öteki dört mağaza hiç denenmedi. Bu değişiklikten sonra `[markup]`
     * satırları onu ölçecek.
     */
    perStore.sort((a, b) => b[0]!.score - a[0]!.score);

    const urls: string[] = [];
    for (let round = 0; round < MAX_PER_STORE; round += 1) {
      for (const hits of perStore) {
        const hit = hits[round];
        if (hit && urls.length < MAX_CANDIDATES) urls.push(hit.url);
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
