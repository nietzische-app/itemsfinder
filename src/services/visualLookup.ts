import "server-only";

import { isDirectProductUrl, isSearchUrl } from "@/lib/productUrl";
import { visionApiKey } from "@/services/visionKey";
import { GLOBAL_DOMAINS, TURKISH_DOMAINS } from "@/services/contextDevService";

/**
 * Giysi kırpımından doğrudan ürün sayfası bulma — metinden geçmeden.
 *
 * ## Neden
 *
 * Bugünkü yol giysiyi önce **kelimeye** çeviriyor (renk, malzeme, desen), sonra o
 * kelimeleri arıyor. Kayıp tam orada: `npm run eval` bölge rengini %81 ölçüyor ve
 * sorgu o renkten kuruluyor, yani her adlandırma hatası doğrudan yanlış bir
 * aramaya dönüşüyor. Görselin kendisiyle aramak bu adımı tamamen atlıyor.
 *
 * ## Neden yeni bir satıcı yok
 *
 * Google Shopping'in kamuya açık bir API'si yok; Content API kendi ürünlerini
 * yükleyen satıcılar için, Custom Search ise alışveriş indeksi değil web araması.
 * Ama `WEB_DETECTION` **zaten her taramada çağrılıyor ve parası ödeniyor** —
 * cevabın yalnızca `webEntities` kısmı (isimlendirme için) kullanılıyor,
 * `pagesWithMatchingImages` ve `visuallySimilarImages` çöpe gidiyor. Yani
 * Google'ın tersine görsel arama indeksi elimizdeki anahtarla zaten erişilebilir.
 *
 * ## Neden kırpım, tüm fotoğraf değil
 *
 * Tüm fotoğrafı sormak Instagram gönderisini bulur, mağazayı değil — aynı görsel
 * internette zaten o adreste duruyor. Tek bir giysinin kırpımı ise internette
 * bulunmayan bir görsel; eşleşenler o giysiye **benzeyen** sayfalar oluyor. Boru
 * hattı kırpımları zaten üretiyor (`imageCrop.ts`), yani yeni bir aşama değil.
 *
 * ## Ne döndürmüyor
 *
 * Ürün kartı değil, yalnızca **aday adres**. Süzme (`productUrl.ts`), çıkarma
 * (`web.extract`), puanlama ve aile kapısı olduğu gibi kalıyor — bu modül metin
 * merdiveninin yerine geçiyor, ondan sonrasının değil.
 */

const VISION_BASE_URL = (
  process.env.VISION_BASE_URL?.trim().replace(/\/$/, "") || "https://vision.googleapis.com"
).replace(/\/$/, "");

const VISION_ENDPOINT = `${VISION_BASE_URL}/v1/images:annotate`;

/**
 * Mağaza başına en fazla bir aday.
 *
 * Tersine görsel arama aynı ürünü aynı mağazanın on farklı renginde döndürebiliyor;
 * hepsini çıkarmak on `web.extract` kredisi harcayıp tek bir mağazanın rafını
 * göstermek olurdu. Dağılım, `searchTier`'ın metin tarafında yaptığının aynısı.
 */
const MAX_PER_HOST = 1;

/** Bir kırpım için en fazla kaç aday adres döndürülecek. */
const MAX_CANDIDATES = 6;

/**
 * Yalnızca tanıdığımız mağazalar.
 *
 * Metin yolunda bu soru zaten cevaplıydı: arama `includeDomains` ile mağazalara
 * kısıtlanıyordu. Görsel yolun böyle bir kısıtı yok ve tersine görsel arama bir
 * moda fotoğrafında bolca Pinterest, Instagram ve blog döndürüyor.
 *
 * **Şekil süzgeci tek başına yetmiyor** ve bunu bir test yakaladı:
 * `instagram.com/p/AbCdEf/`, Mango ve H&M için yazılmış `/p/<kimlik>` kalıbına
 * uyuyor ve ürün sayfası sayılıyordu. Yani bu yol açılsaydı «Ürüne git» bir
 * Instagram gönderisine gidebilirdi — alışveriş uygulamasının yapabileceği en
 * kötü şeylerden biri.
 *
 * «Bu adres ürün sayfası şeklinde mi» ile «bu ana bilgisayar bir mağaza mı» ayrı
 * sorular; ilki `productUrl.ts`'nin, ikincisi burasının işi.
 *
 * Bedeli: tanımadığımız bir mağaza keşfedilemiyor. Bilerek bu tarafta duruluyor —
 * bir mağazanın mağaza olduğunu doğrulayabildiğimizde gevşetilebilir.
 */
const RETAIL_HOSTS = new Set(
  [...Object.values(TURKISH_DOMAINS), ...Object.values(GLOBAL_DOMAINS)].flat(),
);

/** Alt alan adları da sayılıyor: `shop.mango.com` ve `www2.hm.com` gibi. */
function isRetailHost(host: string): boolean {
  return Array.from(RETAIL_HOSTS).some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

interface WebImage {
  url?: string;
}

interface WebPage {
  url?: string;
}

interface VisionWebResponse {
  responses?: Array<{
    webDetection?: {
      pagesWithMatchingImages?: WebPage[];
      visuallySimilarImages?: WebImage[];
      partialMatchingImages?: WebImage[];
      fullMatchingImages?: WebImage[];
    };
    error?: { message?: string };
  }>;
}

export interface VisualLookupResult {
  /** Ürün sayfası şeklindeki adaylar, mağaza başına en fazla bir tane. */
  urls: string[];
  /** Süzmeden önce kaç aday geldiği — kaybın nerede olduğunu görmek için. */
  seen: number;
}

export class VisionWebLookup {
  constructor(private readonly apiKey: string) {}

  /**
   * Bir giysi kırpımına benzeyen ürün sayfaları.
   *
   * Hata hâlinde boş dönüyor, fırlatmıyor: bu yol metin merdiveninin **yerine**
   * değil **önüne** geçiyor, yani boş dönmesi taramayı durdurmamalı, yalnızca
   * eski yola bırakmalı.
   */
  async findProductPages(cropBase64: string, signal?: AbortSignal): Promise<VisualLookupResult> {
    try {
      const response = await fetch(`${VISION_ENDPOINT}?key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: cropBase64 },
              features: [{ type: "WEB_DETECTION", maxResults: 20 }],
            },
          ],
        }),
        signal: signal ?? AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        console.warn(`[lens] Vision ${response.status}`);
        return { urls: [], seen: 0 };
      }

      const payload = (await response.json()) as VisionWebResponse;
      const annotation = payload.responses?.[0];

      if (annotation?.error?.message) {
        console.warn(`[lens] Vision hata: ${annotation.error.message}`);
        return { urls: [], seen: 0 };
      }

      const web = annotation?.webDetection;
      if (!web) return { urls: [], seen: 0 };

      /*
       * Sıra kasıtlı ve iddia gücüne göre.
       *
       * `pagesWithMatchingImages` bir **sayfa** listesi: görselin üzerinde
       * göründüğü adresler, yani doğrudan aday. Ötekiler **görsel** adresleri;
       * bir ürün fotoğrafının kendi adresi ürün sayfası değil, ama çoğu mağazada
       * aynı ana bilgisayarda duruyor ve şekil süzgecinden ancak gerçekten ürün
       * sayfası gibi olanlar geçiyor. Zayıf oldukları için sona konuyorlar.
       */
      const raw = [
        ...(web.pagesWithMatchingImages ?? []),
        ...(web.fullMatchingImages ?? []),
        ...(web.partialMatchingImages ?? []),
        ...(web.visuallySimilarImages ?? []),
      ]
        .map((entry) => entry.url)
        .filter((url): url is string => typeof url === "string" && url.length > 0);

      const hosts = new Map<string, number>();
      const urls: string[] = [];
      /*
       * Elenen adaylar ana bilgisayara göre sayılıyor.
       *
       * Üretimde ölçüldü: görsel arama **41 sonuç** buldu ve hiçbiri ürün sayfası
       * sayılmadı. O satır kaybın büyüklüğünü söylüyor ama **sebebini** söylemiyor
       * — Vision blog ve Pinterest mi döndürdü, yoksa gerçek mağaza adreslerini
       * şekil süzgecim mi reddetti? İkisi bambaşka işler gerektiriyor: ilki
       * «görsel arama bu iş için uygun değil», ikincisi «süzgecim eksik».
       */
      const rejected = new Map<string, number>();

      for (const url of raw) {
        if (urls.length >= MAX_CANDIDATES) break;

        let host: string;
        try {
          host = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }

        // Önce mağaza mı, sonra ürün sayfası mı — ikisi ayrı sorular.
        if (!isRetailHost(host) || !isDirectProductUrl(url) || isSearchUrl(url)) {
          rejected.set(host, (rejected.get(host) ?? 0) + 1);
          continue;
        }

        const used = hosts.get(host) ?? 0;
        if (used >= MAX_PER_HOST) continue;

        hosts.set(host, used + 1);
        urls.push(url);
      }

      if (urls.length === 0 && rejected.size > 0) {
        const top = Array.from(rejected)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([host, count]) => `${host}×${count}`)
          .join(", ");
        console.warn(`[lens] ${raw.length} sonucun hiçbiri ürün sayfası değil — ${top}`);
      }

      return { urls, seen: raw.length };
    } catch (error) {
      console.warn("[lens] görsel arama başarısız:", error);
      return { urls: [], seen: 0 };
    }
  }
}

/**
 * Bayrak arkasında, ve kapalı doğuyor.
 *
 * Kalitesinin metin aramasından iyi olduğu **ölçülmedi** — bu ortamda Vision
 * anahtarı yok. Anahtarlı tek bir oturumda iki yol yan yana ölçülüp karar
 * verilecek; o zamana kadar açık olması, ölçülmemiş bir değişikliği kullanıcıya
 * göndermek olurdu.
 */
export function visualLookupEnabled(): boolean {
  return process.env.ENABLE_VISION_LENS === "true";
}

export function getVisualLookup(): VisionWebLookup | null {
  const key = visionApiKey();
  if (!visualLookupEnabled() || !key) return null;
  return new VisionWebLookup(key);
}

/**
 * Görsel yolun neden çalışıp çalışmadığı, insan okuyabilir hâlde.
 *
 * Üç ayrı üretim çalıştırmasında `img:` kaydı hiç çıkmadı ve her seferinde
 * sebebini **tahmin etmek** zorunda kaldık — bayrak mı, anahtar mı, fotoğraf mı,
 * yoksa kırpma mı. Yol sessizce devre dışı kalıyordu, çünkü kurulamadığında
 * hiçbir yere hiçbir şey yazmıyordu.
 *
 * «Kapalı» olmak bir arıza değil, o yüzden bu bir `degrade` değil; ama görünmez
 * olmak arıza — hangi koşulun eksik olduğunu okuyabilmek gerekiyor.
 */
export function visualLookupStatus(): string {
  if (!visualLookupEnabled()) return "kapalı — ENABLE_VISION_LENS=true değil";
  if (!visionApiKey()) {
    return "kapalı — GOOGLE_CLOUD_VISION_API_KEY / GOOGLE_VISION_API_KEY yok";
  }
  return "açık";
}
