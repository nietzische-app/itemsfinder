import "server-only";

import { isDirectProductUrl, isSearchUrl } from "@/lib/productUrl";
import { GLOBAL_DOMAINS, TURKISH_DOMAINS } from "@/services/contextDevService";
import type { ItemCategory } from "@/types";

/**
 * Aday ürün sayfalarını Google Programmable Search ile bulur.
 *
 * ## Neden
 *
 * Aday bulma zincirin ilk halkası ve tek satıcıya bağlıydı: `web.search` ölünce
 * (kredi bitti, `401 USAGE_EXCEEDED`) çıkarılacak sayfa da kalmıyor, yani
 * işaretleme okuma yolu tek başına kurtarmıyor. Bu modül o halkanın ikinci
 * sağlayıcısı.
 *
 * ## Neden görsel aramadan farklı bir bahis
 *
 * Görsel arama yolu ölçülüp reddedildi (`visualLookup.ts`) ve sebebi
 * **mekanizmaydı**: tersine görsel arama «bu görsel nerede yayımlandı» sorusunu
 * cevaplıyor, bizimki ise «bu ürünü kim satıyor». Burada öyle bir uyumsuzluk yok
 * — bu, alan adına kısıtlanmış bir web araması, yani `web.search`'ün birebir
 * aynı şekli. Belirsiz olan tek şey kota ve sonuç kalitesi, mekanizma değil.
 *
 * ## Ne döndürmüyor
 *
 * Ürün kartı değil, **aday adres**. Süzme, çıkarma, puanlama ve aile kapısı
 * olduğu gibi kalıyor — `ContextDevService.findCandidateUrls` ile aynı sözleşme.
 */

const CSE_BASE_URL = (
  process.env.GOOGLE_CSE_BASE_URL?.trim().replace(/\/$/, "") || "https://www.googleapis.com"
).replace(/\/$/, "");

const CSE_ENDPOINT = `${CSE_BASE_URL}/customsearch/v1`;

/** Mağaza başına en fazla bir aday — `searchTier`'ın metin tarafındaki kuralı. */
const MAX_PER_HOST = 1;

/** Bir sorgu için en fazla kaç aday adres. */
const MAX_CANDIDATES = 4;

/**
 * Mağaza **olamayacak** ana bilgisayarlar.
 *
 * İlk sürümde burada bir izin listesi vardı: yalnızca tanıdığımız 17 perakendeci.
 * Güvenliydi ama global aramayı anlamsız kılıyordu — motor bütün web'i tarasa da
 * sonuç 17 alan adına iniyordu.
 *
 * İzin listesi yerine **iki kapı**:
 *
 *  1. Buradaki kara liste — sosyal medya, video, ansiklopedi, haber, blog
 *     platformları ve görsel CDN'leri. Bunlar tanım gereği mağaza değil.
 *  2. **Fiyat kanıtı.** Asıl garanti bu ve kara listeden güçlü: her iki çıkarma
 *     yolu da fiyatsız bir sayfayı reddediyor (`contextDevService` ve
 *     `markupProducts` içinde `price === null → null`). Yani bir sayfa ancak
 *     üzerinde gerçek bir fiyat varsa karta dönüşüyor, ve bağlantı ancak kart
 *     varsa çiziliyor. Bir blog yazısı bu kapıdan geçemez.
 *
 * Görsel yoldaki `instagram.com/p/…` kusuru bu iki kapının ikisinden de dönüyor:
 * kara listede var, ve zaten fiyat üretmiyor.
 */
const NON_SHOP_HOSTS = [
  // Sosyal ve video
  "instagram.com", "facebook.com", "tiktok.com", "pinterest.com", "pinimg.com",
  "twitter.com", "x.com", "youtube.com", "youtu.be", "reddit.com", "tumblr.com",
  "linkedin.com", "snapchat.com", "vk.com", "spotify.com",
  // Yayın ve ansiklopedi
  "wikipedia.org", "wikimedia.org", "medium.com", "blogspot.com", "wordpress.com",
  "quora.com", "bbc.co.uk", "bbc.com", "nytimes.com", "vogue.com", "elle.com",
  // Pazaryeri olmayan altyapı ve görsel CDN'leri
  "googleusercontent.com", "gstatic.com", "cloudfront.net", "akamaized.net",
  "shopify.com", "amazonaws.com", "media-amazon.com", "ssl-images-amazon.com",
];

/**
 * Arama motoruna tanımlı mağazalar — **motorun yapılandırmasının kod içindeki aynası.**
 *
 * ## Neden burada bir liste var
 *
 * Google'ın «Tüm web'de ara» seçeneği kaldırılıyor (arayüzdeki bildirime göre
 * 1 Ocak 2027'de tamamen). Yani motor yalnızca kendisine tanımlı sitelerde
 * arıyor ve o liste artık **gerçek kısıtlama**. Bir sonraki okuyan kişi o
 * anahtarı aramasın diye yazılı duruyor.
 *
 * Bu liste elemiyor — motor zaten yalnızca bunlarda arıyor. İşi **sıralamak**:
 * Türkiye'den alışveriş yapan biri için TL fiyat ve yurt içi kargo veren bağlantı
 * önce gelmeli, ve sıra doğrudan hangi mağazanın kullanıcıya gösterileceğini
 * belirliyor çünkü çıkarma aday listesini baştan tüketiyor.
 *
 * ## Neden `TURKISH_DOMAINS`'e eklenmedi
 *
 * O liste context.dev'in `includeDomains` parametresine gidiyor ve orada
 * **on alan adı tavanı** var (üretimde ölçüldü: `too_big, maximum: 10`). Oraya
 * beş mağaza daha eklemek, hâlihazırdaki beşini aramanın dışına iterdi. İki
 * sağlayıcının kısıtları farklı, o yüzden listeleri de ayrı.
 */
const CSE_SITE_LIST = [
  // Motora tanımlı Türkiye perakendecileri.
  "trendyol.com", "boyner.com.tr", "lcw.com", "defacto.com.tr", "mavi.com",
  "koton.com", "beymen.com", "vakko.com", "flo.com.tr", "hepsiburada.com",
  "amazon.com.tr",
  // Türkiye'de mağazası olan uluslararası markalar.
  "zara.com", "pullandbear.com", "stradivarius.com", "bershka.com", "hm.com",
  "mango.com",
  // Kozmetik.
  "sephora.com.tr", "gratis.com", "watsons.com.tr", "rossmann.com.tr",
];

const PREFERRED_HOSTS = new Set(
  [
    ...CSE_SITE_LIST,
    ...Object.values(TURKISH_DOMAINS),
    ...Object.values(GLOBAL_DOMAINS),
    ...(process.env.EXTRA_RETAIL_DOMAINS?.split(",").map((entry) => entry.trim()) ?? []),
  ]
    .flat()
    .filter(Boolean),
);

function matchesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function isNonShop(host: string): boolean {
  return NON_SHOP_HOSTS.some((domain) => matchesHost(host, domain));
}

function isPreferred(host: string): boolean {
  return Array.from(PREFERRED_HOSTS).some((domain) => matchesHost(host, domain));
}

/**
 * Google'ın hata metnini **yapılacak işe** çevirir.
 *
 * Ham mesaj doğru ama eyleme geçirmiyor: «Requests to this API customsearch
 * method google.customsearch.v1.Search are blocked» cümlesi, okuyan kişiye
 * konsolda hangi düğmeye basacağını söylemiyor. Kurulum bu projedeki en çok adımı
 * olan iş ve adımların hangisinin atlandığı ancak buradan okunabiliyor.
 *
 * Tanımadığı hatayı olduğu gibi bırakıyor — uydurulmuş bir yönerge, yönerge
 * olmamasından kötü.
 */
export function cseAdvice(message: string): string {
  if (/has not been used|is disabled|SERVICE_DISABLED|blocked/i.test(message)) {
    return (
      "Custom Search API bu projede açık değil. Google Cloud Console → " +
      "APIs & Services → Library → «Custom Search API» → Enable. " +
      "Anahtarın hangi projeye ait olduğuna dikkat et."
    );
  }
  if (/Invalid Value|invalid.*cx|cx.*invalid/i.test(message)) {
    return (
      "Arama motoru kimliği (cx) tanınmadı. GOOGLE_CSE_ID, gömme kodundaki " +
      "«cx=» değerinin aynısı olmalı — başında/sonunda boşluk olmasın."
    );
  }
  if (/API key not valid|API_KEY_INVALID|keyInvalid/i.test(message)) {
    return "Anahtar geçersiz. Anahtar kısıtlamalarında Custom Search API'ye izin verildiğinden emin ol.";
  }
  if (/Quota|rateLimitExceeded|dailyLimitExceeded/i.test(message)) {
    return "Günlük ücretsiz kota doldu. Yarın sıfırlanıyor; daha fazlası için faturalandırma gerekiyor.";
  }
  return message;
}

interface CseResponse {
  items?: Array<{ link?: string }>;
  error?: { message?: string; code?: number };
}

export interface GoogleSearchResult {
  urls: string[];
  /** Süzmeden önce kaç sonuç geldiği — kaybın nerede olduğunu görmek için. */
  seen: number;
  /** Çağrı başarısızsa gerekçesi. */
  error?: string;
}

export class GoogleProductSearch {
  constructor(
    private readonly apiKey: string,
    private readonly engineId: string,
  ) {}

  /**
   * Bir sorgu için aday ürün sayfaları.
   *
   * Hata hâlinde boş dönüyor, fırlatmıyor: bu yol `web.search`'ün **yerine**
   * geçiyor ve boş dönmesi taramayı durdurmamalı, kataloğa bırakmalı.
   */
  async findProductPages(
    query: string,
    category: ItemCategory,
    signal?: AbortSignal,
  ): Promise<GoogleSearchResult> {
    const url = new URL(CSE_ENDPOINT);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.engineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "10");
    // Türkçe sonuçlar önce; kategori şu an yalnızca bunu etkiliyor.
    url.searchParams.set("hl", "tr");
    if (category === "clothing" || category === "beauty") url.searchParams.set("gl", "tr");

    let payload: CseResponse;
    try {
      const response = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) });
      payload = (await response.json()) as CseResponse;

      if (!response.ok || payload.error) {
        const reason = payload.error?.message ?? `HTTP ${response.status}`;
        const advice = cseAdvice(reason);
        console.warn(`[cse] «${query}» başarısız: ${reason.slice(0, 160)}`);
        if (advice !== reason) console.warn(`[cse] → ${advice}`);
        return { urls: [], seen: 0, error: advice.slice(0, 200) };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 80) : "istek başarısız";
      console.warn(`[cse] «${query}» başarısız: ${reason}`);
      return { urls: [], seen: 0, error: reason };
    }

    const raw = (payload.items ?? [])
      .map((item) => item.link)
      .filter((link): link is string => typeof link === "string" && link.length > 0);

    const hosts = new Map<string, number>();
    const urls: string[] = [];
    const rejected = new Map<string, number>();

    for (const link of raw) {
      if (urls.length >= MAX_CANDIDATES) break;

      let host: string;
      try {
        host = new URL(link).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      // Mağaza olamayacak yer mi, ve ürün sayfası şeklinde mi.
      if (isNonShop(host) || !isDirectProductUrl(link) || isSearchUrl(link)) {
        rejected.set(host, (rejected.get(host) ?? 0) + 1);
        continue;
      }

      const used = hosts.get(host) ?? 0;
      if (used >= MAX_PER_HOST) continue;

      hosts.set(host, used + 1);
      urls.push(link);
    }

    /*
     * Bilinen perakendeciler öne — elenmiyorlar, sıralanıyorlar.
     *
     * Çıkarma aday listesini baştan tüketiyor, yani sıra doğrudan hangi mağazanın
     * kullanıcıya gösterileceğini belirliyor.
     */
    urls.sort((a, b) => {
      const rank = (url: string) => {
        try {
          return isPreferred(new URL(url).hostname.replace(/^www\./, "")) ? 0 : 1;
        } catch {
          return 1;
        }
      };
      return rank(a) - rank(b);
    });

    if (urls.length === 0 && rejected.size > 0) {
      const top = Array.from(rejected)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([host, count]) => `${host}×${count}`)
        .join(", ");
      console.warn(`[cse] «${query}» — ${raw.length} sonucun hiçbiri ürün sayfası değil: ${top}`);
    }

    return { urls, seen: raw.length };
  }
}

/**
 * Bayrak arkasında, ve kapalı doğuyor.
 *
 * `GOOGLE_CSE_ID` bir **Programmable Search motoru** kimliği ve o motorun
 * perakendecilerle yapılandırılması gerekiyor — kod tarafında yapılamayacak tek
 * adım bu. Anahtar için Vision anahtarı yeniden kullanılabilir (aynı Google Cloud
 * projesinde Custom Search API açıksa), ama ayrı bir değişken de kabul ediliyor.
 *
 * Kota ve sonuç kalitesi **ölçülmedi**: bu ortamdan anahtarlı bir çağrı
 * yapılamıyor. Ölçülen tek şey karar — hangi adres ürün sayfası sayılıyor, hata
 * nasıl bildiriliyor, ve mağaza olmayan ana bilgisayar eleniyor mu.
 */
export function googleSearchEnabled(): boolean {
  return process.env.ENABLE_GOOGLE_CSE === "true";
}

export function getGoogleSearch(): GoogleProductSearch | null {
  if (!googleSearchEnabled()) return null;

  const key =
    process.env.GOOGLE_CSE_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ||
    process.env.GOOGLE_VISION_API_KEY?.trim();
  const engineId = process.env.GOOGLE_CSE_ID?.trim();

  if (!key || !engineId) return null;
  return new GoogleProductSearch(key, engineId);
}

/** Neden çalışmadığı, insan okuyabilir hâlde — `visualLookupStatus` ile aynı gerekçe. */
export function googleSearchStatus(): string {
  if (!googleSearchEnabled()) return "kapalı — ENABLE_GOOGLE_CSE=true değil";
  if (!process.env.GOOGLE_CSE_ID?.trim()) return "kapalı — GOOGLE_CSE_ID yok";
  if (
    !process.env.GOOGLE_CSE_API_KEY?.trim() &&
    !process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() &&
    !process.env.GOOGLE_VISION_API_KEY?.trim()
  ) {
    return "kapalı — GOOGLE_CSE_API_KEY yok (Vision anahtarı da bulunamadı)";
  }
  return "açık";
}
