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
 * Tanıdığımız mağazalar.
 *
 * Arama motorunun kendisi de sitelerle sınırlanabiliyor (Programmable Search
 * motoruna perakendeciler tanımlanarak), ama ona **güvenilmiyor**: yapılandırma
 * bizim depomuzda değil, ve görsel yolda tam olarak bu kapı eksik olduğu için
 * `instagram.com/p/…` ürün sayfası sayılmıştı. İki kapı bir kapıdan iyi.
 */
const RETAIL_HOSTS = new Set(
  [...Object.values(TURKISH_DOMAINS), ...Object.values(GLOBAL_DOMAINS)].flat(),
);

function isRetailHost(host: string): boolean {
  return Array.from(RETAIL_HOSTS).some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
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
        console.warn(`[cse] «${query}» başarısız: ${reason.slice(0, 160)}`);
        return { urls: [], seen: 0, error: reason.slice(0, 160) };
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

      // Önce mağaza mı, sonra ürün sayfası mı — ikisi ayrı sorular.
      if (!isRetailHost(host) || !isDirectProductUrl(link) || isSearchUrl(link)) {
        rejected.set(host, (rejected.get(host) ?? 0) + 1);
        continue;
      }

      const used = hosts.get(host) ?? 0;
      if (used >= MAX_PER_HOST) continue;

      hosts.set(host, used + 1);
      urls.push(link);
    }

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
