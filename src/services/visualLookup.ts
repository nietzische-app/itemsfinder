import "server-only";

import { isDirectProductUrl, isSearchUrl } from "@/lib/productUrl";

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
  /**
   * High-res visually similar image URLs from Vision.
   *
   * Used when live extract cannot find an `og:image` — better a real product
   * photo than a silhouette SVG placeholder on the result card.
   */
  similarImages: string[];
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
      const web = await this.annotate(cropBase64, signal);
      if (!web) return { urls: [], seen: 0, similarImages: [] };

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

      for (const url of raw) {
        if (urls.length >= MAX_CANDIDATES) break;
        // Arama ve liste sayfaları CTA olarak yasaklı; burada da geçerli.
        if (!isDirectProductUrl(url) || isSearchUrl(url)) continue;

        let host: string;
        try {
          host = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }

        const used = hosts.get(host) ?? 0;
        if (used >= MAX_PER_HOST) continue;

        hosts.set(host, used + 1);
        urls.push(url);
      }

      return {
        urls,
        seen: raw.length,
        similarImages: collectSimilarImages(web),
      };
    } catch (error) {
      console.warn("[lens] görsel arama başarısız:", error);
      return { urls: [], seen: 0, similarImages: [] };
    }
  }

  /**
   * Visually similar product photos for a garment crop — thumbnail fallback only.
   *
   * Does not require `ENABLE_VISION_LENS`; a missing PDP `og:image` should still
   * be able to land a real photo on the card when a Vision key is present.
   */
  async findSimilarImages(cropBase64: string, signal?: AbortSignal): Promise<string[]> {
    try {
      const web = await this.annotate(cropBase64, signal);
      return web ? collectSimilarImages(web) : [];
    } catch (error) {
      console.warn("[lens] similar-image lookup failed:", error);
      return [];
    }
  }

  private async annotate(
    cropBase64: string,
    signal?: AbortSignal,
  ): Promise<NonNullable<NonNullable<VisionWebResponse["responses"]>[number]["webDetection"]> | null> {
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
      return null;
    }

    const payload = (await response.json()) as VisionWebResponse;
    const annotation = payload.responses?.[0];

    if (annotation?.error?.message) {
      console.warn(`[lens] Vision hata: ${annotation.error.message}`);
      return null;
    }

    return annotation?.webDetection ?? null;
  }
}

/** Deduped https image URLs from Vision's visual-similarity lists. */
function collectSimilarImages(
  web: NonNullable<NonNullable<VisionWebResponse["responses"]>[number]["webDetection"]>,
): string[] {
  const seen = new Set<string>();
  const images: string[] = [];

  for (const entry of [
    ...(web.visuallySimilarImages ?? []),
    ...(web.fullMatchingImages ?? []),
    ...(web.partialMatchingImages ?? []),
  ]) {
    const url = entry.url;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    if (seen.has(url)) continue;
    // Skip obvious non-photos (PDP HTML pages already handled separately).
    if (/\.(html?)([?#]|$)/i.test(url)) continue;
    seen.add(url);
    images.push(url);
    if (images.length >= 6) break;
  }

  return images;
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
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!visualLookupEnabled() || !key) return null;
  return new VisionWebLookup(key);
}

/**
 * Vision client for thumbnail fallback only — does not require the lens flag.
 *
 * Product-page discovery stays behind `ENABLE_VISION_LENS`; missing card photos
 * should still be fillable when a Vision key is configured.
 */
export function getVisionImageFallback(): VisionWebLookup | null {
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();
  if (!key) return null;
  return new VisionWebLookup(key);
}
