import "server-only";

import { extractProductMarkup } from "@/lib/productMarkup";
import { productUrlOrEmpty } from "@/lib/productUrl";
import type { LiveProductCard } from "@/services/contextDevService";

/**
 * Ürün kartlarını mağazanın kendi işaretlemesinden çıkarır — modele okutmadan.
 *
 * `web.extract`'in yerine geçebilen yol. Aynı `LiveProductCard`'ı üretiyor, yani
 * üstündeki hiçbir şey (puanlama, aile kapısı, tabanlar, arayüz) değişmiyor —
 * yalnızca verinin nereden geldiği değişiyor.
 *
 * ## Ne kazandırıyor
 *
 * Satıcı bağımsızlığı ve maliyet: sayfayı indirmek bir HTTP isteği, ayrıştırmak
 * bedava. Kredisi biten bir anahtar yüzünden ürün aramasının tamamen durması bu
 * yolla mümkün değil.
 *
 * ## Ne kazandırmıyor
 *
 * Sayfayı indirebilmeyi. Bazı mağazalar sunucu taraflı isteklere bot duvarı
 * çıkarıyor — bu depoda `fetch:images` ve `check:links` tam da bu yüzden 403
 * alıyor. O yüzden bu yol `web.extract`'in **yerine** değil, **yanına**
 * konumlanıyor: hangisinin daha çok sayfa açtığı ölçülecek bir soru, varsayılacak
 * değil.
 */

/** Sayfa indirme üst sınırı. Bir tarama dört parça çözüyor, hepsi bütçe içinde. */
const FETCH_TIMEOUT_MS = 8_000;

/** Bundan büyük gövdeler okunmuyor: ürün sayfası birkaç yüz KB, 5 MB bir şey anlatmıyor. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Tarayıcı `user-agent`'ı.
 *
 * `check-links.mjs` ile aynı gerekçe: çıplak bir isteğe bot duvarı çıkaran
 * mağazalar var ve sorduğumuz şey kullanıcının göreceği sayfa.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Sayfa okunamadığında sebebi — sayı değil cümle, çünkü karar o cümleye bağlı. */
type MarkupOutcome = { html: string } | { reason: string };

async function fetchHtml(url: string, signal?: AbortSignal): Promise<MarkupOutcome> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      // 403 bot duvarı, 404 ölü bağlantı: ikisi bambaşka şeyler söylüyor.
      return { reason: `HTTP ${response.status}` };
    }

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) {
      return { reason: `HTML değil (${type.split(";")[0] || "tipsiz"})` };
    }

    /*
     * Gövde okunurken de sınır var: `content-length` yalan söyleyebilir ya da hiç
     * gelmeyebilir, o yüzden okunan bayt sayılıyor.
     */
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { reason: `gövde çok büyük (${Math.round(buffer.byteLength / 1024)} KB)` };
    }

    return { html: new TextDecoder("utf-8").decode(buffer) };
  } catch (error) {
    return { reason: error instanceof Error ? error.message.slice(0, 60) : "indirilemedi" };
  }
}

function merchantDomainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Verilmiş adreslerden ürün kartı çıkarır.
 *
 * `ContextDevService.productsFromUrls` ile **aynı imza**, bilerek: iki yol
 * birbirinin yerine konabilsin ve karşılaştırılabilsin diye. Açılamayan ya da
 * işaretlemesi olmayan sayfa sessizce düşüyor — yarım bir kart, kart olmamasından
 * kötü.
 */
export async function productsFromMarkup(
  urls: string[],
  signal?: AbortSignal,
): Promise<LiveProductCard[]> {
  if (urls.length === 0) return [];

  const startedAt = Date.now();

  /*
   * Sayfa başına **sebep** toplanıyor, yalnızca sayı değil.
   *
   * Üretimde `1 sayfa, 0 satır okundu` yazdı ve bu satır kararı vermeye
   * yetmiyordu: sayfa bot duvarına mı takıldı, işaretleme mi yoktu, yoksa
   * işaretleme vardı da fiyat mı okunamadı? Üçü üç ayrı iş — sırasıyla «başka
   * mağaza dene», «bu mağaza desteklenmiyor» ve «ayrıştırıcı eksik».
   */
  const reasons: string[] = [];

  const settled = await Promise.allSettled(
    urls.map(async (url): Promise<LiveProductCard | null> => {
      const host = merchantDomainOf(url) || url.slice(0, 40);
      const fetched = await fetchHtml(url, signal);

      if ("reason" in fetched) {
        reasons.push(`${host}: ${fetched.reason}`);
        return null;
      }

      const product = extractProductMarkup(fetched.html, url);
      if (!product) {
        reasons.push(`${host}: ürün işaretlemesi yok`);
        return null;
      }
      if (product.price === null) {
        reasons.push(`${host}: işaretleme var, fiyat yok`);
        return null;
      }

      const domain = merchantDomainOf(url);
      return {
        title: product.title,
        price: product.price,
        // Para birimi yazılmamışsa TL varsayılmıyor — yanlış para birimi, eksik
        // para biriminden kötü. Üstteki katman boş dizeyi zaten alan adından
        // türetiyor.
        currency: product.currency ?? "",
        merchantName: domain,
        merchantDomain: domain,
        // Ürün sayfası şekli olmayan adres CTA olamaz; kural burada da geçerli.
        productUrl: productUrlOrEmpty(url),
        imageUrl: product.imageUrl,
        inStock: product.inStock,
        brand: product.brand,
        rating: product.rating,
        reviewCount: product.reviewCount,
      };
    }),
  );

  const cards = settled.flatMap((outcome) =>
    outcome.status === "fulfilled" && outcome.value ? [outcome.value] : [],
  );

  console.log(
    `[markup] ${Date.now() - startedAt}ms — ${urls.length} sayfa, ${cards.length} satır okundu` +
      (reasons.length > 0 ? ` — ${reasons.slice(0, 6).join("; ")}` : ""),
  );

  return cards;
}

/**
 * Bayrak arkasında, ve kapalı doğuyor.
 *
 * Ayrıştırıcı schema.org şekillerine karşı ölçüldü (`npm run eval` → Ürün
 * işaretlemesi, 22/22), ama **gerçek mağaza sayfalarına karşı ölçülmedi** — bu
 * ortamdan hiçbir mağazaya ağ yolu yok. Asıl bilinmeyen ayrıştırma değil, kaç
 * mağazanın sunucu taraflı isteğe sayfa verdiği.
 */
export function markupExtractionEnabled(): boolean {
  return process.env.ENABLE_MARKUP_EXTRACT === "true";
}
