import "server-only";

import {
  STORE_USER_AGENT,
  fillTemplate,
  looksLikeWall,
  openSearchHref,
  openSearchUrlFromXml,
  productLinks,
  rankByQuery,
  searchActionTemplate,
} from "@/lib/storeSearchPage";

/**
 * Aday ürün sayfalarını **mağazanın kendi arama sayfasından** bulur.
 *
 * ## Neden var
 *
 * Aday bulmanın sağlayıcısı kalmadı: context.dev kredisi bitti, Google Custom
 * Search JSON API yeni müşterilere kapatıldı (`docs/BULUNAMADI.md` 4c), görsel
 * yol ölçülüp reddedildi (4b). Bu yol satıcısız ve ücretsiz — mağazaya bir HTTP
 * isteği gidiyor, gerisi ayrıştırma.
 *
 * ## Neden yalnızca iki mağaza
 *
 * Çünkü ölçülen bunlar. Üç koşu, on dokuz mağaza (`docs/BULUNAMADI.md` 4d):
 *
 *   koton.com      38 aday → 3 satır, TL fiyatlı
 *   boyner.com.tr  25 aday → 1 satır, TL fiyatlı
 *
 * Ötekiler ya veri merkezi IP'sine 403 veriyor (Trendyol, Hepsiburada, DeFacto,
 * H&M, Watsons, Sephora), ya arama sonuçlarını sunucuda çizmiyor (LCW, Beymen,
 * Gratis — gelen bağlantılar sonuç değil gezinme menüsü), ya da arama adresini
 * hiç ilan etmiyor. Listeye ölçülmemiş mağaza eklemek, her taramaya karşılıksız
 * bir gidiş dönüş eklemek olurdu.
 *
 * `STORE_SEARCH_DOMAINS` ile genişletilebiliyor — ama önce `npm run check:kesif`
 * ile ölçülmeli.
 *
 * ## Arama adresi nereden geliyor
 *
 * Koda yazılmıyor: mağazanın ana sayfasındaki schema.org `SearchAction`
 * ilanından okunuyor (yoksa OpenSearch tanımından). Ezberden yazılan bir adres
 * mağaza yolunu değiştirdiği gün sessizce 404 almaya başlardı ve bu, «o mağazada
 * ürün yok» gibi görünürdü. İlan okuma kendi kendini onarıyor.
 *
 * Okunan kalıp örnek ömrü boyunca saklanıyor, yani mağaza başına fazladan istek
 * sunucusuz bir instance'ta bir kez yapılıyor.
 */

/** Ölçülmüş mağazalar. Sıra önemli değil; hepsi paralel sorulıyor. */
const DEFAULT_STORES = ["koton.com", "boyner.com.tr"];

/** Mağaza başına en fazla aday — metin merdiveniyle aynı kural. */
const MAX_PER_STORE = 2;

/** Bir sorgu için toplam en fazla aday. */
const MAX_CANDIDATES = 4;

/**
 * Tek isteğin tavanı.
 *
 * Ölçümdeki 15 saniyeden kısa, bilerek: orada amaç mağazayı tanımaktı, burada
 * amaç bir taramayı zamanında bitirmek. Yavaş bir mağaza taramayı bekletmemeli —
 * katalog yedeği zaten duruyor.
 */
const FETCH_TIMEOUT_MS = 6_000;

/** Okunan arama kalıbının saklanma süresi. */
const TEMPLATE_TTL_MS = 60 * 60 * 1000;

/**
 * Sahte bir mağazaya yönlendirmek için — `VISION_BASE_URL` ile aynı gerekçe.
 * Üretimde boş.
 */
function originFor(host: string): string {
  const override = process.env.STORE_SEARCH_BASE_URL?.trim().replace(/\/$/, "");
  return override ? `${override}/${host}` : `https://www.${host}`;
}

/**
 * Bağlantı süzgecinin bakacağı ana bilgisayar.
 *
 * Sahte sunucuya yönlendirildiğinde adresler `127.0.0.1` üzerinde duruyor;
 * mağazanın gerçek alan adına göre süzmek her şeyi elerdi ve ölçüm «bağlantı
 * yok» diye yeşil kalırdı — hiçbir şey ölçmeden.
 */
function hostFilterFor(host: string): string {
  const override = process.env.STORE_SEARCH_BASE_URL?.trim();
  if (!override) return host;
  try {
    return new URL(override).hostname.replace(/^www\./, "");
  } catch {
    return host;
  }
}

export interface StoreSearchResult {
  urls: string[];
  /** Süzmeden önce kaç bağlantı görüldüğü — kaybın nerede olduğunu görmek için. */
  seen: number;
  /** Hiçbir mağaza cevap veremediyse gerekçe. */
  error?: string;
}

interface CachedTemplate {
  template: string | null;
  at: number;
}

const templates = new Map<string, CachedTemplate>();

export class StoreProductSearch {
  constructor(private readonly stores: string[]) {}

  private async get(url: string, signal?: AbortSignal) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": STORE_USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "tr-TR,tr;q=0.9,en;q=0.8",
        },
        signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      return { status: response.status, body: await response.text(), url: response.url };
    } catch (error) {
      return {
        status: 0,
        body: "",
        url,
        error: error instanceof Error ? error.message.slice(0, 60) : "istek başarısız",
      };
    }
  }

  /**
   * Mağazanın ilan ettiği arama kalıbı, örnek ömrü boyunca saklanır.
   *
   * Olumsuz cevap da saklanıyor: ilan etmeyen bir mağazayı her taramada yeniden
   * sormak, hiçbir zaman işe yaramayacak bir gidiş dönüşü her taramaya eklemek
   * olurdu.
   */
  private async templateFor(host: string, signal?: AbortSignal): Promise<string | null> {
    const cached = templates.get(host);
    if (cached && Date.now() - cached.at < TEMPLATE_TTL_MS) return cached.template;

    const home = await this.get(`${originFor(host)}/`, signal);
    let template: string | null = null;

    if (home.status === 200 && !looksLikeWall(home.body)) {
      template = searchActionTemplate(home.body);

      if (!template) {
        const href = openSearchHref(home.body);
        if (href) {
          const xml = await this.get(new URL(href, home.url).href, signal);
          if (xml.status === 200) template = openSearchUrlFromXml(xml.body);
        }
      }
    }

    templates.set(host, { template, at: Date.now() });
    return template;
  }

  private async searchOne(
    host: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<{ urls: string[]; seen: number }> {
    const template = await this.templateFor(host, signal);
    if (!template) return { urls: [], seen: 0 };

    const page = await this.get(fillTemplate(template, query), signal);
    if (page.status !== 200 || looksLikeWall(page.body)) return { urls: [], seen: 0 };

    /*
     * Sorguyla ilgisi olmayan bağlantı indirilmiyor.
     *
     * Arama sayfasındaki ilk bağlantılar çoğu zaman sonuç değil öneri karuseli:
     * üretimde «Gri pantolon» iki bluz, «Gümüş ayakkabı» iki abiye elbise
     * getirdi. Sekizi de aile kapısında elendi, yani kullanıcı korundu — ama
     * sekiz sayfa boşuna indirildi ve ürün aşaması 4.9 saniye sürdü.
     */
    const links = productLinks(page.body, page.url, hostFilterFor(host));
    const matching = rankByQuery(links, query);

    return { urls: matching.slice(0, MAX_PER_STORE), seen: links.length };
  }

  /**
   * Bir sorgu için aday ürün sayfaları.
   *
   * Mağazalar paralel sorulıyor ve biri patlarsa ötekiler devam ediyor: bu yol
   * `web.search`'ün **yerine** geçiyor, boş dönmesi taramayı durdurmamalı,
   * kataloğa bırakmalı.
   */
  async findProductPages(query: string, signal?: AbortSignal): Promise<StoreSearchResult> {
    const settled = await Promise.allSettled(
      this.stores.map((host) => this.searchOne(host, query, signal)),
    );

    const urls: string[] = [];
    let seen = 0;
    let failures = 0;

    for (const outcome of settled) {
      if (outcome.status !== "fulfilled") {
        failures += 1;
        continue;
      }
      seen += outcome.value.seen;
      for (const url of outcome.value.urls) {
        if (urls.length < MAX_CANDIDATES) urls.push(url);
      }
    }

    if (urls.length === 0 && failures === settled.length && settled.length > 0) {
      return { urls: [], seen, error: "hiçbir mağazaya ulaşılamadı" };
    }

    return { urls, seen };
  }
}

export function storeSearchEnabled(): boolean {
  return process.env.ENABLE_STORE_SEARCH === "true";
}

function configuredStores(): string[] {
  const extra =
    process.env.STORE_SEARCH_DOMAINS?.split(",")
      .map((entry) => entry.trim().replace(/^https?:\/\//, "").replace(/^www\./, ""))
      .filter(Boolean) ?? [];

  return extra.length > 0 ? extra : DEFAULT_STORES;
}

/**
 * Aynı yapılandırma için aynı örnek — kalıp önbelleği modül düzeyinde olsa da
 * mağaza listesi örnekten okunuyor ve her parçada yeniden kurmak gereksiz.
 */
let cached: { key: string; search: StoreProductSearch } | null = null;

export function getStoreSearch(): StoreProductSearch | null {
  if (!storeSearchEnabled()) return null;

  const stores = configuredStores();
  if (stores.length === 0) return null;

  const key = stores.join(",");
  if (cached?.key === key) return cached.search;

  const search = new StoreProductSearch(stores);
  cached = { key, search };
  return search;
}

/** Neden çalışmadığı, insan okuyabilir hâlde — öteki yollarla aynı gerekçe. */
export function storeSearchStatus(): string {
  if (!storeSearchEnabled()) return "kapalı — ENABLE_STORE_SEARCH=true değil";

  const stores = configuredStores();
  const where = `${stores.length} mağaza: ${stores.join(", ")}`;

  /*
   * Bu yolun tek çıkarıcısı işaretleme okuma. `web.extract` context.dev'e
   * bağlı ve kredisi bitti, yani işaretleme kapalıysa bulunan adaylar hiçbir
   * şeye dönüşmüyor — ve bu, «mağazada ürün yok» gibi görünüyor.
   */
  if (process.env.ENABLE_MARKUP_EXTRACT !== "true") {
    return `açık (${where}) — ama ENABLE_MARKUP_EXTRACT=true olmadan adaylar karta dönüşmez`;
  }

  return `açık — ${where}`;
}
