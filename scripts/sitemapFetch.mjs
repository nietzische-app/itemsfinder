/**
 * Sitemap indirmenin ağ tarafı — ölçüm ve dizin çıkarma **aynı** kodu kullansın.
 *
 * `check-sitemap.mjs` bu mantığı dört koşuda oturttu: gzip gövde, 25 MB tavanı,
 * `robots.txt` ilanı, tahmin edilen adresler. Dizin çıkaran betik ikinci bir
 * kopyayla başlasaydı, ölçülen davranışla üretilen dizin sessizce ayrışırdı —
 * `kesif-lib.mjs`'te bir kez öğrenilen ders.
 *
 * İçeride karar yok, yalnızca indirme: hangi dosyanın ürün dosyası olduğu gibi
 * kararlar `src/lib/sitemapIndex.ts`'te ve ölçümle bağlı.
 */
import { gunzipSync } from "node:zlib";

import { USER_AGENT } from "./kesif-lib.mjs";

const {
  sitemapUrlsFromRobots,
  isGzip,
  SITEMAP_GUESSES,
  locsIn,
  isSitemapIndex,
  looksLikeSitemapList,
  rankProductSitemaps,
} = await import("@/lib/sitemapIndex");

/** Sitemap dosyaları büyük; gövde sınırı olmadan tek dosya koşuyu yiyebilir. */
export const MAX_BYTES = 25 * 1024 * 1024;

export async function get(url, timeoutMs = 20_000) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/xml,text/xml,text/plain,*/*",
        "accept-encoding": "gzip, deflate",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { status: response.status, body: "", url: response.url, tooBig: buffer.byteLength };
    }

    /*
     * `.xml.gz` dosyaları TAŞIMA sıkıştırması değil, gövdenin kendisi gzip.
     *
     * İlk koşuda altı mağaza «0 adres» dedi — Zara, Pull&Bear, Bershka,
     * Stradivarius, Vakko, Flo. `robots.txt` sitemap ilan ediyordu ve dosya 200
     * dönüyordu; gövde gzip olduğu için çözücü çöp üretti ve içinde `<loc>`
     * bulunamadı. Ölçüm «bu mağazada sitemap yok» diyordu, oysa vardı.
     */
    const bytes = new Uint8Array(buffer);
    const body = isGzip(bytes)
      ? gunzipSync(bytes).toString("utf-8")
      : new TextDecoder("utf-8").decode(bytes);

    return { status: response.status, body, url: response.url, bytes: buffer.byteLength };
  } catch (error) {
    return {
      status: 0,
      body: "",
      url,
      error: error instanceof Error ? error.message.slice(0, 60) : "istek başarısız",
    };
  }
}

/** Mağazanın ilan ettiği ya da standart yerdeki sitemap adresleri. */
export async function sitemapsFor(host) {
  const robots = await get(`https://www.${host}/robots.txt`);

  if (robots.status === 200) {
    const declared = sitemapUrlsFromRobots(robots.body);
    if (declared.length > 0) return { urls: declared, from: "robots.txt" };
  }

  for (const guess of SITEMAP_GUESSES) {
    const page = await get(`https://www.${host}${guess}`);
    if (page.status === 200 && /<(sitemapindex|urlset)[\s>]/i.test(page.body)) {
      return { urls: [page.url], from: `tahmin ${guess}` };
    }
  }

  return {
    urls: [],
    from: null,
    robotsStatus: robots.status,
    robotsError: robots.error,
  };
}

/** Dizinden en fazla kaç kademe inilecek — `check-sitemap.mjs` ile aynı. */
export const MAX_DEPTH = 3;

/**
 * Dizin ağacını gezip **ürün dosyalarının hepsini** toplar.
 *
 * `check-sitemap.mjs` her kademede yalnızca ilk çocuğu iniyor, çünkü orada soru
 * «bu mağazada ürün adresi var mı». Dizin çıkarırken soru «kaç tane var», yani
 * ilk dosya yetmiyor: Koton'un ilk dosyası 15 bin adres verdi ve o sayı tavanın
 * kendisiydi.
 *
 * Genişlik öncelikli, çünkü sıra `rankProductSitemaps` tarafından zaten anlamlı
 * hâle getirilmiş: bütçe biterse elde kalanlar en olası ürün dosyaları oluyor.
 * Derinlik öncelikli olsaydı bütçe ilk dalın altında tükenir ve mağazanın öteki
 * ürün dosyalarına hiç bakılmazdı.
 *
 * `fetcher` dışarıdan veriliyor: bu fonksiyonun kararları (yaprak mı dizin mi,
 * bütçe, derinlik, tekrar) ağsız ölçülebilsin diye.
 */
export async function productSitemaps(roots, budget, fetcher = get) {
  const queue = rankProductSitemaps(roots).map((url) => ({ url, depth: 0, parent: null }));
  const seen = new Set(queue.map((entry) => entry.url));
  const leaves = [];
  const perParent = new Map();
  let fetched = 0;

  /*
   * Sırada bekleyenlerden **en az yaprak vermiş dizinin** çocuğu seçiliyor.
   *
   * Düz kuyruk yetmiyor, ve bunu ağsız ölçüm gösterdi: `kadın/` ve `erkek/`
   * diye ikiye ayrılmış bir ağaçta bütçe 2 iken iki yaprağın ikisi de `kadın`
   * dalından geliyordu. Genişlik önceliği **kademe** çeşitliliği veriyor, dal
   * çeşitliliği değil — ve dizinin işi bir sorguya karşılık bulmak, yani tek
   * dala sıkışmış bir dizin erkek sorgusuna hiçbir zaman cevap veremez.
   *
   * Eşitlikte kuyruk sırası korunuyor, yani `rankProductSitemaps`'in kararı
   * bozulmuyor: bu kural dalları **dengeliyor**, yeniden sıralamıyor.
   */
  const next = () => {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if ((perParent.get(queue[i].parent) ?? 0) < (perParent.get(queue[best].parent) ?? 0)) best = i;
    }
    return queue.splice(best, 1)[0];
  };

  while (queue.length > 0 && leaves.length < budget) {
    const { url, depth, parent } = next();

    const page = await fetcher(url);
    fetched += 1;
    if (page.status !== 200) continue;

    const locs = locsIn(page.body);

    /*
     * Yaprak mı dizin mi? İkisi de `<loc>` taşıyor, ayıran şey içeriğin
     * kendisi — `isSitemapIndex` etikete, `looksLikeSitemapList` uzantıya
     * bakıyor. Üçüncü koşuda öğrenildi: bazı mağazalar dizini `<urlset>`
     * etiketiyle yayımlıyor, yani etiket tek başına yetmiyor.
     */
    const isIndex = isSitemapIndex(page.body) || looksLikeSitemapList(locs);

    if (isIndex) {
      /*
       * Tavana dayanmış bir dizin **atlanıyor**, yaprak sayılmıyor.
       *
       * Ölçüm bunu yakaladı: derinlik tavanı yalnızca inişi kesiyordu ve
       * kesilen dizin `locs.length > 0` olduğu için yaprak listesine giriyordu.
       * İçindekiler `.xml` dosyaları, yani `productLinks` hepsini eliyor —
       * dizine kirli veri girmiyor ama bütçe boşa gidiyor ve sayı «bir ürün
       * dosyası bulundu» diyor. Sayının yalan söylemesi, verinin bozulmasından
       * daha sinsi.
       */
      if (depth >= MAX_DEPTH) continue;

      for (const child of rankProductSitemaps(locs)) {
        if (seen.has(child)) continue;
        seen.add(child);
        queue.push({ url: child, depth: depth + 1, parent: url });
      }
      continue;
    }

    if (locs.length > 0) {
      leaves.push({ url, locs });
      perParent.set(parent, (perParent.get(parent) ?? 0) + 1);
    }
  }

  return { leaves, fetched };
}
