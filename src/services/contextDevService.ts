import "server-only";
import { productUrlOrEmpty } from "@/lib/productUrl";
import type { SearchAttemptRecord, SearchTier } from "@/lib/scanTrace";

import ContextDev from "context.dev";

import type { BrandMetadata, ItemCategory } from "@/types";

/**
 * Context.dev integration — live product intelligence and retailer branding.
 *
 * Two capabilities are used, both from the official `context.dev` SDK:
 *
 *  - `web.search` + `web.extract`  → real product cards (title, price, stock,
 *    image) pulled from live retailer pages, replacing the mock catalogue.
 *  - `brand.retrieveSimplified`    → retailer logo, name and brand colour,
 *    resolved from the product URL's domain rather than hardcoded.
 *
 * Everything here is best-effort: every public method resolves to an empty
 * result rather than throwing, so a failed or slow live lookup degrades to the
 * mock catalogue instead of breaking a scan.
 */

/** A product as returned by the live engine, before affiliate wrapping. */
export interface LiveProductCard {
  title: string;
  price: number;
  currency: string;
  merchantName: string;
  merchantDomain: string;
  productUrl: string;
  imageUrl: string | null;
  inStock: boolean;
  brand: string | null;
  /** Mağazanın ürün puanı, 0..5. Sayfada yoksa `null`. */
  rating: number | null;
  /** Puanın kaç değerlendirmeye dayandığı. Sayfada yoksa `null`. */
  reviewCount: number | null;
}

/**
 * Türkiye'den alışverişe uygun mağazalar — aramanın **birinci** katmanı.
 *
 * Liste eskiden tek Türk mağazası olarak Trendyol'u taşıyordu, yani "Türkiye'de
 * bulunamazsa" durumu pratikte hemen her sorguda oluşuyordu. Buradakiler
 * Türkiye'ye satış yapan, TL fiyat gösteren ve yurt içi kargo yapan mağazalar; hepsinin
 * ürün sayfası şekli `productUrl.ts` tarafından tanınıyor ve `eval` tarafından
 * ölçülüyor (`eval/productUrlCases.ts`).
 */
export const TURKISH_DOMAINS: Record<ItemCategory, string[]> = {
  clothing: [
    "trendyol.com",
    "boyner.com.tr",
    "lcw.com",
    "defacto.com.tr",
    "mavi.com",
    "koton.com",
    "zara.com",
    "pullandbear.com",
    "stradivarius.com",
    "bershka.com",
    "hm.com",
    "amazon.com.tr",
  ],
  beauty: [
    "sephora.com.tr",
    "trendyol.com",
    "gratis.com",
    "watsons.com.tr",
    "rossmann.com.tr",
    "amazon.com.tr",
  ],
};

/**
 * Yalnızca birinci katman boş dönerse aranan global mağazalar.
 *
 * Sıra kasıtlı: Türkiye'den alışveriş yapan biri için İngiltere'den gelen bir ASOS
 * bağlantısı, aynı ürünü TL fiyatla ve yurt içi kargoyla veren bir bağlantıdan
 * kötüdür — gümrük, kargo süresi ve iade hepsi değişiyor. Ama hiç sonuç
 * olmamasından iyidir, ve bazı ürünler Türkiye'de gerçekten satılmıyor.
 */
export const GLOBAL_DOMAINS: Record<ItemCategory, string[]> = {
  clothing: ["asos.com", "shop.mango.com", "amazon.com", "zara.com", "hm.com"],
  beauty: ["sephora.com", "lookfantastic.com", "amazon.com"],
};

/**
 * Global katmana düşmeden önce birinci katmanda aranan en az aday sayısı.
 *
 * Bir tane değil: tek bir sonuç, o mağazanın elinde gerçekten o ürün olduğu
 * anlamına gelmiyor — alakasız bir eşleşme de tek sonuç üretir. İki aday, ikinci
 * aramanın parasını harcamadan önce "Türkiye'de var" demek için makul en düşük
 * kanıt.
 */
const MIN_LOCAL_CANDIDATES = 2;

/**
 * Bir parça için yapılabilecek en fazla arama.
 *
 * İki katman × üç basamak altı arama eder; her arama bir kredi ve bir gidiş
 * dönüş demek, ve bir taramada dört parça çözülüyor. Üç, iki katmanın da
 * denenmesine yetiyor (Türkiye'de tam sorgu, Türkiye'de gevşek sorgu, global)
 * ve en kötü durumda gecikmeyi öngörülebilir tutuyor. Sonuç bulunduğu anda
 * zaten duruluyor, yani sıradan durumda tek arama yapılıyor.
 */
const MAX_SEARCHES_PER_ITEM = 3;

/**
 * Tek bir aramaya verilebilecek en fazla alan adı — **API'nin doğrulanmış tavanı.**
 *
 * Önce hipotezdi: üretimde üç arama da 400 aldı, üçü de `clothing` kategorisindeydi
 * ve Türkiye `clothing` listesi 12 alan adı taşıyan tek listeydi. `describeError`
 * yazıldıktan sonraki ilk üretim logu tahmini birebir doğruladı:
 *
 *   {code: "too_big", maximum: 10, inclusive: true,
 *    message: "Too big: expected array to have <=10 items"}
 *
 * Yani sayı bizim seçimimiz değil, API'nin sınırı. Düşen ikisi (hm.com,
 * amazon.com.tr) global katmanda yine aranıyor, çünkü liste öncelik sırasında.
 */
const MAX_INCLUDE_DOMAINS = 10;

/**
 * Anahtar reddedildikten sonra yeniden denemeden önce beklenen süre.
 *
 * Kredisi bitmiş bir anahtar **her** çağrıda aynı cevabı veriyor. Üretimde ölçüldü:
 * dört parça için 12 arama yapıldı, on ikisi de `401 USAGE_EXCEEDED` aldı ve
 * 2.1 saniye harcandı — aynı şeyi on iki kez öğrenmek için. Merdiven her basamağı
 * ve her katmanı denemeye devam ediyordu, çünkü hata «bu sorgu tutmadı» ile
 * «bu anahtar çalışmıyor» arasında ayrım yapmıyordu.
 *
 * Kalıcı bir kilit değil, çünkü kullanıcı kredi yükleyebilir ve sunucusuz bir
 * instance dakikalarca yaşıyor. Bir dakika, boşa çağrıyı durdurmaya yetecek kadar
 * uzun, kendini iyileştirmeyi engellemeyecek kadar kısa.
 */
const AUTH_COOLDOWN_MS = 60_000;

/**
 * Hangi kırpılmış liste için uyarı yazıldı.
 *
 * Süreç ömrü boyunca: kesilen liste yapılandırmadan geliyor ve çalışırken
 * değişmiyor. Katman başına ayrı anahtar, çünkü Türkiye ve global listelerinin
 * kesilen kuyrukları farklı ve ikisi de duyurulmalı.
 */
const warnedDomainCaps = new Set<string>();

/**
 * Bu hata tekrar denemeye değer mi?
 *
 * Anahtarın reddedilmesi (401/403) ya da kotanın dolması, sorguyu değiştirerek
 * çözülecek bir şey değil — sıradaki basamak da, sıradaki parça da aynı cevabı
 * alacak. Sunucu hatası ya da zaman aşımı ise geçici olabilir; onlarda merdiven
 * yürümeye devam ediyor.
 */
function isKeyRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const status = (error as { status?: unknown }).status;
  if (status === 401 || status === 403 || status === 429) return true;

  return /USAGE_EXCEEDED|credits? (have been )?(completely )?depleted|quota/i.test(
    describeError(error),
  );
}


/** Fallback currency per retailer TLD, used when extraction omits it. */
const DOMAIN_CURRENCY: Array<[RegExp, string]> = [
  /*
   * `.com.tr` çoğunu yakalıyor ama hepsini değil: LCW, Mavi, Koton ve Gratis
   * Türkiye mağazası oldukları hâlde düz `.com` kullanıyor. Birinci katmana
   * eklendiklerinde para birimi düşmüş oluyordu, yani TL fiyat para birimsiz
   * görünüyordu.
   */
  [/\.com\.tr$|trendyol\.com|lcw\.com|mavi\.com|koton\.com|gratis\.com/, "TRY"],
  [/\.co\.uk$|asos\.com/, "GBP"],
  [/\.de$|\.fr$|\.es$|\.it$/, "EUR"],
];

/**
 * JSON Schema handed to `web.extract`. Paired with `factCheck: true` so the
 * model may not invent a price that is not on the page — the whole point of
 * going live is that these numbers are real.
 */
const PRODUCT_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      description: "Every distinct purchasable product shown on the page.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Product name as displayed." },
          price: {
            type: "number",
            description: "Current selling price as a number, no currency symbol.",
          },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD." },
          brand: { type: "string", description: "Brand or label name." },
          imageUrl: { type: "string", description: "Absolute product image URL." },
          productUrl: { type: "string", description: "Absolute product page URL." },
          inStock: { type: "boolean", description: "False if sold out." },
          /*
             Puan ve adet, yorum **metni** değil.

             Metin kullanıcının yazdığı, mağazanın barındırdığı içerik; kopyalayıp
             başka bir sitede yayımlamak telif ve kullanım şartları meselesi. Puan
             ve adet ise sayfada yazan bir olgu — ve `factCheck: true` ile birlikte
             model sayfada olmayan bir sayıyı üretemiyor.
          */
          rating: {
            type: "number",
            description: "Average customer rating out of 5, as shown on the page.",
          },
          reviewCount: {
            type: "number",
            description: "Number of customer reviews the rating is based on.",
          },
        },
        required: ["title", "price"],
        additionalProperties: false,
      },
    },
  },
  required: ["products"],
  additionalProperties: false,
} as const;

/** Shape we hope for out of `extract`; every field is re-validated below. */
interface RawProduct {
  title?: unknown;
  price?: unknown;
  currency?: unknown;
  brand?: unknown;
  imageUrl?: unknown;
  productUrl?: unknown;
  inStock?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
}

export interface ContextDevServiceOptions {
  /** Product pages to extract per detected item. More = better spread, more credits. */
  extractsPerQuery?: number;
  /** Per-call ceiling handed to the SDK. */
  requestTimeoutMs?: number;
  /** How long extraction may crawl before returning what it has. */
  extractBudgetMs?: number;
  /** TTL for the in-process caches. */
  cacheTtlMs?: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class ContextDevService {
  private readonly client: ContextDev;
  private readonly extractsPerQuery: number;
  private readonly requestTimeoutMs: number;
  private readonly extractBudgetMs: number;
  private readonly cacheTtlMs: number;

  /**
   * Anahtar reddedildiğinde bu ana kadar hiç çağrı yapılmıyor.
   *
   * Örnek üzerinde yaşıyor, süreç ömrü boyunca: sunucusuz bir instance dakikalarca
   * ayakta kalıyor ve o süre boyunca aynı reddi tekrar tekrar almanın hiçbir
   * karşılığı yok.
   */
  private rejectedUntil = 0;

  /**
   * Caches live for the lifetime of the server process. Scans repeat the same
   * labels constantly ("Black Leather Biker Jacket"), and both credits and
   * latency are the scarce resources here.
   */
  /**
   * Aday adresler, kart değil.
   *
   * Arama ile çıkarım ayrıldığında önbellek de ayrıldı: saklanan şey artık
   * «bu sorgu hangi sayfaları buldu». Kart saklamak, çıkarımın hangi yolla
   * yapıldığını da dondururdu — oysa aynı adresler bir çalıştırmada işaretlemeden,
   * bir başkasında `web.extract` ile okunabiliyor.
   */
  private readonly urlCache = new Map<string, CacheEntry<string[]>>();
  private readonly brandCache = new Map<string, CacheEntry<BrandMetadata | null>>();

  constructor(apiKey: string, options: ContextDevServiceOptions = {}) {
    this.extractsPerQuery = options.extractsPerQuery ?? 3;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.extractBudgetMs = options.extractBudgetMs ?? 15_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 30 * 60_000;

    this.client = new ContextDev({
      apiKey,
      /*
       * Sahte bir sunucuya yönlendirilebilsin diye.
       *
       * `eval:record` ve `eval:record-attrs` için aynısı yapıldı ve aynı sebeple:
       * canlı yol bugüne kadar hiç çalıştırılmadı, çünkü çalıştırmanın tek yolu
       * gerçek bir anahtar harcamaktı. Üretimde bu değişken boş, yani SDK kendi
       * adresini kullanıyor — hiçbir davranış değişmiyor.
       */
      baseURL: process.env.CONTEXT_DEV_BASE_URL?.trim() || undefined,
      // The SDK retries twice by default; a scan is latency-sensitive and we
      // have a mock fallback, so fail fast instead.
      maxRetries: 1,
      timeout: this.requestTimeoutMs,
    });
  }

  /**
   * Bir mağaza kümesinde arar ve mağaza başına en fazla bir aday döndürür.
   *
   * Mağaza başına tek sayfa, çünkü en iyi sıralanan mağazadan gelen birbirine
   * benzeyen üç ilan, üç farklı mağazadan gelen üç seçenekten kötü.
   */
  private async searchTier(
    query: string,
    includeDomains: string[],
    signal?: AbortSignal,
  ): Promise<string[]> {
    /*
     * Kesme sessiz olmamalı.
     *
     * Tavan API'nin sınırı ve kesmek doğru davranış, ama kesilen her alan adı o
     * aramada **hiç sorulmamış** bir mağaza demek. Sessizce yapılırsa listeye
     * eklenen on birinci mağaza hiçbir zaman aranmaz ve bunu kimse fark etmez —
     * çalışıyor görünen, aslında görmezden gelinen bir yapılandırma.
     */
    /*
     * ...ama bir kez.
     *
     * Kesilen liste bir **yapılandırma** gerçeği, olay değil: her parça, her
     * basamak ve her katman için tekrarlanınca tek bir taramada yirmiden fazla
     * özdeş satır çıkabiliyor. `searchYield`'i okunmaz hâle getiren şey buydu ve
     * aynı ders burada da geçerli — tekrar eden bir uyarı, uyarı olmaktan çıkıp
     * gürültü oluyor.
     */
    if (includeDomains.length > MAX_INCLUDE_DOMAINS) {
      const skipped = includeDomains.slice(MAX_INCLUDE_DOMAINS).join(", ");
      if (!warnedDomainCaps.has(skipped)) {
        warnedDomainCaps.add(skipped);
        console.warn(
          `[context.dev] ${includeDomains.length} alan adı tavana (${MAX_INCLUDE_DOMAINS}) ` +
            `kırpıldı — bu aramalarda hiç sorulmayanlar: ${skipped}`,
        );
      }
    }

    const search = await this.client.web.search(
      {
        query,
        includeDomains: includeDomains.slice(0, MAX_INCLUDE_DOMAINS),
        numResults: 10,
        timeoutMS: this.requestTimeoutMs,
        tags: ["markas", "product-search"],
      },
      { signal },
    );

    const candidates: string[] = [];
    const seenHosts = new Set<string>();

    for (const result of search.results ?? []) {
      const host = safeHostname(result.url);
      if (!host || seenHosts.has(host)) continue;

      seenHosts.add(host);
      candidates.push(result.url);
      if (candidates.length >= this.extractsPerQuery) break;
    }

    return candidates;
  }

  /**
   * Finds live, buyable products for a detection label.
   *
   * Two stages: `web.search` scoped to our retailer allowlist finds real
   * product URLs, then `web.extract` pulls structured cards off the best few.
   * Extraction is pinned to a single page (`maxDepth: 0`, `maxPages: 1`) so
   * latency and credit cost stay predictable.
   *
   * Resolves to `[]` on any failure — callers fall back to the catalogue.
   */
  /**
   * Finds live, buyable products for a detection label.
   *
   * `queries` en özelden en genele sıralı basamaklardır (`relaxedQueries`). Her
   * basamak iki mağaza katmanında deneniyor — önce Türkiye, sonra global — ve ilk
   * yeterli sonuç geldiğinde duruluyor.
   *
   * Resolves to `[]` on any failure — callers fall back to the catalogue.
   */
  async findCandidateUrls(
    queries: string[],
    category: ItemCategory,
    signal?: AbortSignal,
    onAttempt?: (attempt: SearchAttemptRecord) => void,
  ): Promise<string[]> {
    const ladder = queries.map((entry) => entry.trim()).filter(Boolean);
    if (ladder.length === 0) return [];

    // Önbellek anahtarı en özel basamak: aynı parça hep aynı merdiveni üretiyor.
    const cacheKey = `${category}:${ladder[0]!.toLowerCase()}`;
    const cached = this.readCache(this.urlCache, cacheKey);
    if (cached) return cached;

    try {
      /*
       * Önce Türkiye, bulunamazsa global; ve her ikisinde de sorgu gevşeyerek.
       *
       * Tek bir aramada bütün mağazaları taramak, sıralamayı arama motoruna
       * bırakmak demekti — ve o sıralama alışveriş yapanın nerede olduğunu
       * bilmiyor. Türkiye'den bakan biri için TL fiyat ve yurt içi kargo veren bir
       * bağlantı, aynı ürünün İngiltere bağlantısından iyi. Ama global katman da
       * kapalı değil: bazı ürünler Türkiye'de gerçekten satılmıyor.
       *
       * Sorgu gevşemesi ikinci eksen: «beyaz keten oversize gömlek» hiçbir
       * mağazada tam karşılık bulmayabilir ama «gömlek» bulur, ve sıfır sonuç
       * biraz farklı bir gömlekten kötüdür.
       *
       * Sıra kasıtlı — önce **katman**, sonra **basamak**: Türkiye'de bulunan
       * gevşek bir eşleşme, globalde bulunan tam bir eşleşmeden iyi, çünkü
       * gümrük ve kargo farkı ürün farkından büyük.
       */
      const attempts: Array<{ query: string; domains: string[]; tier: SearchTier; rung: number }> =
        [];
      ladder.forEach((query, rung) => {
        attempts.push({
          query: `${query} satın al fiyat`,
          domains: TURKISH_DOMAINS[category],
          tier: "tr",
          rung,
        });
      });
      ladder.forEach((query, rung) => {
        attempts.push({
          query: `${query} buy price`,
          domains: GLOBAL_DOMAINS[category],
          tier: "global",
          rung,
        });
      });

      const candidates: string[] = [];
      let searches = 0;

      for (const attempt of attempts) {
        if (candidates.length >= MIN_LOCAL_CANDIDATES) break;
        if (searches >= MAX_SEARCHES_PER_ITEM) break;

        /*
         * Anahtar az önce reddedildiyse hiç sorma.
         *
         * Kaydı yine düşülüyor — «yapılmayan çağrı» da muhasebenin bir parçası,
         * ve kredinin neden harcanmadığını okuyabilmek gerekiyor.
         */
        if (Date.now() < this.rejectedUntil) {
          onAttempt?.({
            source: "metin",
            tier: attempt.tier,
            rung: attempt.rung,
            query: attempt.query,
            found: 0,
            ms: 0,
            error: "anahtar reddedildi — çağrı yapılmadı",
          });
          break;
        }

        searches += 1;
        const before = candidates.length;
        const startedAt = Date.now();
        let failure: string | undefined;

        /*
         * Her basamak **kendi** başına yakalanıyor, merdivenin tamamı değil.
         *
         * Üretimde ölçüldü: Türkiye katmanındaki bir sorgu 400 dönünce dıştaki
         * `try` bütün döngüyü iptal ediyordu, yani global katman hiç denenmiyordu
         * ve parça kataloğa düşüyordu. Bir mağaza kümesinin isteği reddetmesi,
         * öteki kümenin de denenmemesi için bir gerekçe değil.
         */
        try {
          const found = await this.searchTier(attempt.query, attempt.domains, signal);
          for (const url of found) {
            if (!candidates.includes(url)) candidates.push(url);
          }
        } catch (error) {
          failure = describeError(error);
          logFailure("searchTier", attempt.query, error);

          if (isKeyRejection(error)) {
            this.rejectedUntil = Date.now() + AUTH_COOLDOWN_MS;
            onAttempt?.({
              source: "metin",
              tier: attempt.tier,
              rung: attempt.rung,
              query: attempt.query,
              found: 0,
              ms: Date.now() - startedAt,
              error: failure,
            });
            // Sorguyu değiştirmek bu hatayı çözmez; merdivenin geri kalanı boşuna.
            return [];
          }
        }
        /*
         * Her arama, harcandığı anda rapor ediliyor — sonuçtan sonra değil.
         *
         * Merdivenin maliyeti basamak başına bir `web.search` kredisi ve gevşemenin
         * karşılığını verip vermediği ancak «kaç arama harcandı, hangisi getirdi»
         * bilinerek yargılanabilir. `BULUNAMADI.md` madde 4 bu ölçümü, canlı yol
         * açılmadan önce yapılması gereken iş olarak yazıyor.
         *
         * `found` **yeni** aday sayısı, ham sonuç sayısı değil: aynı ürünü ikinci kez
         * bulan bir basamak hiçbir şey eklemiyor ve öyle görünmeli.
         */
        /*
         * Başarısız arama da rapor ediliyor.
         *
         * Önce yalnızca dönen sonuç raporlanıyordu, yani çağrı hata verince
         * muhasebeye hiçbir şey yazılmıyordu. Üretimde üç arama 400 aldı ve log
         * `searchCount: 0` yazdı — «kredi nereye gitti» sorusunu cevaplamak için
         * yazılmış bir muhasebenin, tam da cevaplaması gereken anda sustuğu yer.
         * Harcanmış bir çağrı, sonucu ne olursa olsun harcanmıştır.
         */
        onAttempt?.({
          source: "metin",
          tier: attempt.tier,
          rung: attempt.rung,
          query: attempt.query,
          found: candidates.length - before,
          ms: Date.now() - startedAt,
          error: failure,
        });
      }

      this.writeCache(this.urlCache, cacheKey, candidates);
      return candidates;
    } catch (error) {
      logFailure("findCandidateUrls", ladder[0] ?? "", error);
      return [];
    }
  }

  /**
   * Verilmiş adreslerden ürün kartı çıkarır.
   *
   * Aday adresleri **kim bulduysa** bulsun, çıkarma tek yerden geçsin diye ayrıldı:
   * görsel arama yolu (`visualLookup.ts`) adayları metin sorgusundan değil giysi
   * kırpımından üretiyor, ama sonrasında olan biten birebir aynı olmalı — aynı
   * şema, aynı `factCheck`, aynı tekilleştirme. İki ayrı çıkarma yolu, iki ayrı
   * kart tanımı demek olurdu ve ikisi zamanla birbirinden ayrılırdı.
   */
  async productsFromUrls(urls: string[], signal?: AbortSignal): Promise<LiveProductCard[]> {
    if (urls.length === 0) return [];

    try {
      const extracted = await Promise.allSettled(
        urls.map((url) => this.extractProducts(url, signal)),
      );

      return dedupeByUrl(
        extracted.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : [])),
      );
    } catch (error) {
      logFailure("productsFromUrls", urls[0] ?? "", error);
      return [];
    }
  }

  /**
   * Resolves retailer branding for a domain — logo, display name, brand colour.
   * Resolves to `null` when the brand is unknown or the call fails.
   */
  async enrichBrandMetadata(
    domain: string,
    signal?: AbortSignal,
  ): Promise<BrandMetadata | null> {
    // Brand records are keyed on the registrable domain, so a product URL on
    // `www2.hm.com` or `shop.mango.com` has to be reduced before lookup.
    const normalized = registrableDomain(domain);
    if (!normalized) return null;

    const cached = this.readCache(this.brandCache, normalized);
    if (cached !== undefined) return cached;

    try {
      const response = await this.client.brand.retrieveSimplified(
        {
          domain: normalized,
          // The UI is light-only, so ask for assets picked for a light surface.
          theme: "light",
          timeoutMS: this.requestTimeoutMs,
          tags: ["markas", "brand"],
        },
        { signal },
      );

      const brand = response.brand;
      if (!brand) {
        this.writeCache(this.brandCache, normalized, null);
        return null;
      }

      // Prefer a wordmark over a bare icon, and something that reads on a light
      // background. `has_opaque_background` works on either.
      const logos = brand.logos ?? [];
      const logo =
        logos.find(
          (candidate) =>
            candidate.type === "logo" &&
            (candidate.mode === "light" || candidate.mode === "has_opaque_background"),
        ) ??
        logos.find((candidate) => candidate.type === "logo") ??
        logos.find((candidate) => Boolean(candidate.url));

      const metadata: BrandMetadata = {
        domain: brand.domain ?? normalized,
        name: brand.title?.trim() || merchantNameFromDomain(normalized),
        logoUrl: isHttpUrl(logo?.url) ? logo!.url! : null,
        colorHex: normalizeHex(brand.colors?.[0]?.hex),
      };

      this.writeCache(this.brandCache, normalized, metadata);
      return metadata;
    } catch (error) {
      logFailure("enrichBrandMetadata", normalized, error);
      // Cache the miss too: a domain with no brand record would otherwise be
      // re-queried for every product card on every scan.
      this.writeCache(this.brandCache, normalized, null);
      return null;
    }
  }

  /** Pulls product cards off one page and normalises them. */
  private async extractProducts(
    url: string,
    signal?: AbortSignal,
  ): Promise<LiveProductCard[]> {
    const response = await this.client.web.extract(
      {
        url,
        schema: PRODUCT_SCHEMA as unknown as Record<string, unknown>,
        // No invented prices: every value must be supported by the page.
        factCheck: true,
        maxDepth: 0,
        maxPages: 1,
        stopAfterMs: this.extractBudgetMs,
        timeoutMS: this.requestTimeoutMs,
        tags: ["markas", "product-extract"],
      },
      { signal },
    );

    const raw = (response.data as { products?: unknown })?.products;
    if (!Array.isArray(raw)) return [];

    const host = safeHostname(url) ?? "";

    return raw
      .map((entry) => normalizeProduct(entry as RawProduct, url, host))
      .filter((product): product is LiveProductCard => product !== null);
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }
}

/* -------------------------------------------------------------------------- */
/*  Normalisation helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Turns one loosely-typed extraction row into a `LiveProductCard`, or `null`
 * if it is not usable. Extraction output is model-generated, so nothing here
 * is trusted: a card without a real title and a positive finite price is
 * dropped rather than shown with a bogus number.
 */
function normalizeProduct(
  raw: RawProduct,
  pageUrl: string,
  host: string,
): LiveProductCard | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < 3) return null;

  const price = toPositiveNumber(raw.price);
  if (price === null) return null;

  /*
   * An extracted product URL is trusted only if it stays on the page's host —
   * otherwise a scraped ad or cross-sell could redirect our CTA off-site — and
   * only if it is a product detail page.
   *
   * `pageUrl` is the fallback because it is the page extraction actually ran on,
   * but it gets the same treatment: search scoped to a retailer still lands on
   * listing pages sometimes, and a listing is not a product. Anything that fails
   * both checks yields "", and the caller drops the candidate rather than
   * shipping a link to a results page.
   */
  const extractedUrl = typeof raw.productUrl === "string" ? raw.productUrl : "";
  const onHost =
    isHttpUrl(extractedUrl) && safeHostname(extractedUrl) === host
      ? extractedUrl
      : "";

  const productUrl =
    productUrlOrEmpty(onHost) || productUrlOrEmpty(pageUrl);

  const currency =
    typeof raw.currency === "string" && /^[A-Za-z]{3}$/.test(raw.currency.trim())
      ? raw.currency.trim().toUpperCase()
      : currencyForDomain(host);

  return {
    title,
    price,
    currency,
    merchantName: merchantNameFromDomain(host),
    merchantDomain: host,
    productUrl,
    imageUrl: isHttpUrl(raw.imageUrl) ? (raw.imageUrl as string) : null,
    // Absent stock info means listed-and-buyable, which is the common case.
    inStock: raw.inStock === false ? false : true,
    brand: typeof raw.brand === "string" && raw.brand.trim() ? raw.brand.trim() : null,
    ...ratingOf(raw),
  };
}

/**
 * Puan ve adet birlikte geçerli, ayrı ayrı değil.
 *
 * Adet tek başına anlamsız: «1.240 değerlendirme» satırı, yanında bir puan
 * olmadan okuyana hiçbir şey söylemiyor — hatta ürünün çok beğenildiği izlenimi
 * bırakıyor. İlk yazımda kapı yalnızca `toProductMatch`'te vardı, yani
 * `LiveProductCard` puansız bir adet taşıyabiliyordu; sınır testi bunu üç vakada
 * yakaladı (on üzerinden puan, sıfır, negatif). Kural artık kaynakta.
 */
function ratingOf(raw: RawProduct): { rating: number | null; reviewCount: number | null } {
  const rating = toRating(raw.rating);
  if (rating === null) return { rating: null, reviewCount: null };
  return { rating, reviewCount: toReviewCount(raw.reviewCount) };
}

/**
 * Puanı 0..5 aralığına göre doğrular.
 *
 * Aralık dışı bir değer düzeltilmiyor, **atılıyor**. Bazı mağazalar beş yerine
 * on üzerinden puan yazıyor ve 8,4'ü 5'e kırpmak "çok beğenilmiş" bir ürünü
 * "mükemmel" gibi gösterirdi; ölçeği bilinmeyen bir sayıyı yeniden ölçeklemek,
 * uydurmakla aynı kapıya çıkar. Puan yoksa kart puan göstermiyor, o kadar.
 */
function toRating(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 5) return null;
  // İki hane, çünkü mağazalar 4,37 gibi değerler yazabiliyor ve kartta 4,4 yeter.
  return Math.round(parsed * 10) / 10;
}

/** Değerlendirme adedi: pozitif tam sayı ya da hiç. */
function toReviewCount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

/**
 * Parses a price that may arrive as a number or as a localised string.
 *
 * Retailer pages write prices as "49,90" (TR/EU), "1.299,00" (EU) and
 * "1,299.00" (US/UK) alike. Naively stripping punctuation turns "49,90" into
 * 4990 — a 100x overcharge on the card — so the separators have to be read
 * rather than deleted.
 */
function toPositiveNumber(value: unknown): number | null {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    parsed = parsePriceString(value);
  } else {
    return null;
  }

  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function parsePriceString(input: string): number {
  // Keep digits and separators only; drops currency symbols, spaces, NBSPs.
  const cleaned = input.replace(/[^0-9.,]/g, "");
  if (!cleaned) return Number.NaN;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  // Whichever separator comes last is the decimal point; the other groups
  // thousands. If only one kind appears, it is decimal only when it separates
  // a trailing group of one or two digits ("49,90"), otherwise it is a
  // thousands separator ("1,299").
  let decimalAt = -1;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalAt = Math.max(lastComma, lastDot);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const only = Math.max(lastComma, lastDot);
    const trailing = cleaned.length - only - 1;
    const isSingleSeparator = cleaned.indexOf(cleaned[only]!) === only;
    if (isSingleSeparator && trailing > 0 && trailing <= 2) decimalAt = only;
  }

  const whole = (decimalAt >= 0 ? cleaned.slice(0, decimalAt) : cleaned).replace(
    /[.,]/g,
    "",
  );
  const fraction = decimalAt >= 0 ? cleaned.slice(decimalAt + 1).replace(/[.,]/g, "") : "";

  return Number(fraction ? `${whole}.${fraction}` : whole);
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;

  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function safeHostname(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function currencyForDomain(host: string): string {
  for (const [pattern, currency] of DOMAIN_CURRENCY) {
    if (pattern.test(host)) return currency;
  }
  return "USD";
}

/** Second-level domains that are really public suffixes, e.g. `amazon.co.uk`. */
const COMPOUND_SUFFIXES = new Set(["co", "com", "net", "org", "ac", "gov", "edu"]);

/**
 * Reduces a hostname to the domain a brand record is keyed on:
 * `www2.hm.com` -> `hm.com`, `shop.mango.com` -> `mango.com`,
 * `www.amazon.co.uk` -> `amazon.co.uk`.
 */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");

  const secondLast = parts[parts.length - 2]!;
  const keep = COMPOUND_SUFFIXES.has(secondLast) ? 3 : 2;
  return parts.slice(-keep).join(".");
}

/** "shop.mango.com" -> "Mango". Only a display fallback; Brand API wins. */
export function merchantNameFromDomain(host: string): string {
  const parts = registrableDomain(host).split(".");
  const core = parts[0] ?? host;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function dedupeByUrl(products: LiveProductCard[]): LiveProductCard[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = `${product.merchantDomain}|${product.title.toLowerCase()}`;
    if (seen.has(key) || seen.has(product.productUrl)) return false;
    seen.add(key);
    seen.add(product.productUrl);
    return true;
  });
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
}

function logFailure(operation: string, subject: string, error: unknown): void {
  console.warn(`[context.dev] ${operation} failed for "${subject}": ${describeError(error)}`);
}

/**
 * Bir SDK hatasının **gerekçesi**, yalnızca durum kodu değil.
 *
 * Üretimde `400` görüldü ve tek yazdığımız şey oydu: `error.message` durum
 * kodundan ibaret, isteğin neden reddedildiği hata nesnesinin içindeki alanlarda
 * duruyor. Yani log «bir şey yanlış» diyor, «ne yanlış» demiyordu — ve bu, hata
 * ayıklamanın tam olarak ihtiyaç duyduğu tek cümle.
 *
 * Alan adları sağlayıcıdan sağlayıcıya değişiyor, o yüzden hepsi taranıyor ve
 * bulunan ilk anlamlı gövde kısaltılarak yazılıyor.
 */
function describeError(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? String((error as { status: unknown }).status)
      : null;

  const base = error instanceof Error ? error.message : String(error);
  if (typeof error !== "object" || error === null) return base;

  const bag = error as Record<string, unknown>;
  for (const key of ["error", "errors", "detail", "details", "body", "response", "cause"]) {
    const value = bag[key];
    if (value === undefined || value === null) continue;

    let text: string;
    try {
      text = typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      continue;
    }
    if (!text || text === "{}" || text === "[]") continue;

    return `${status ?? base} — ${text.slice(0, 400)}`;
  }

  return status ? `${status} (gerekçe gövdesi yok)` : base;
}
