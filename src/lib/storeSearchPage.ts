import { familyOf, normalizeTr } from "@/lib/itemFamily";
import { jsonLdNodes } from "@/lib/productMarkup";
import { isDirectProductUrl } from "@/lib/productUrl";
import { COLOR_NAMES } from "@/lib/searchQuery";

/**
 * Bir mağazanın arama sayfasını okumanın saf kararları.
 *
 * ## Neden `src/` içinde
 *
 * Bu mantık önce bir ölçüm betiğinde (`scripts/kesif-lib.mjs`) yazıldı ve orada
 * gerçek mağazalara karşı üç koşu sürüldü. Üretim aynı işi yapacaksa **aynı kodu**
 * yapmalı: ikinci bir kopya, ölçülen davranışla çalışan davranışın sessizce
 * ayrışması demekti. Betik artık buradan içe aktarıyor, yani üç koşunun ölçtüğü
 * şey üretimin kendisi.
 *
 * İçeride ağ yok. Ağ `services/storeSearch.ts` tarafında; buradaki her şey
 * girdisi metin, çıktısı karar olan fonksiyonlar — `scripts/stubs/kesif-check.mjs`
 * ile ölçülüyor.
 */


export const STORE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Bot duvarı mı, gerçek sayfa mı?
 *
 * Durum kodu tek başına yetmiyor: Cloudflare'in doğrulama sayfası 200 dönüyor.
 * Yalnızca gövdenin başındaki imzalara bakılıyor — sayfanın ilerisinde geçen
 * «captcha» kelimesi (örneğin bir yardım metninde) duvar değil, ve emin
 * olunamayan yere «duvar» demek ölçümün kendisini yanlış yapardı.
 */
export function looksLikeWall(html: string): boolean {
  return /cf-browser-verification|Just a moment\.\.\.|\/cdn-cgi\/challenge|g-recaptcha|px-captcha|Access Denied|DataDome/i.test(
    html.slice(0, 4000),
  );
}

/**
 * schema.org `SearchAction` → `{search_term_string}` taşıyan adres kalıbı.
 *
 * Mağazanın arama adresini **kendi ilanından** okuyor. Ezberden yazılan bir
 * kalıp ölçümü sessizce bozardı: 404 alan bir istek «bot duvarı» gibi görünür.
 */
export function searchActionTemplate(html: string): string | null {
  for (const node of jsonLdNodes(html)) {
    for (const action of [node.potentialAction].flat().filter(Boolean) as Record<string, unknown>[]) {
      if (typeof action !== "object" || action === null) continue;
      if (!/SearchAction/i.test(String(action["@type"] ?? ""))) continue;

      const target = action.target as Record<string, unknown> | string | null;
      const template =
        typeof target === "string"
          ? target
          : typeof target === "object" && target !== null
            ? ((target as Record<string, unknown>).urlTemplate ?? (target as Record<string, unknown>)["@id"])
            : null;

      if (typeof template === "string" && /\{[^}]*search[^}]*\}/i.test(template)) return template;
    }
  }
  return null;
}

/** OpenSearch tanımındaki `{searchTerms}` taşıyan HTML adresi. */
export function openSearchUrlFromXml(xml: string): string | null {
  for (const tag of xml.match(/<Url\b[^>]*>/gi) ?? []) {
    if (!/type=["']text\/html["']/i.test(tag)) continue;
    const template = /template=["']([^"']+)["']/i.exec(tag)?.[1];
    if (template && /\{searchTerms\}/i.test(template)) return template;
  }
  return null;
}

/** Ana sayfadaki `<link rel="search">` adresi. */
export function openSearchHref(html: string): string | null {
  const link = /<link[^>]+rel=["']search["'][^>]*>/i.exec(html)?.[0];
  return link ? (/href=["']([^"']+)["']/i.exec(link)?.[1] ?? null) : null;
}

/**
 * Sayfada ne var — «işaretleme yok» cevabını **eyleme** çevirir.
 *
 * İlk ölçüm dört mağaza için «3 sayfa, 0 satır — ürün işaretlemesi yok» dedi ve
 * bu satır kararı vermeye yetmiyor. Üç bambaşka ihtimali aynı cümleye
 * sıkıştırıyor:
 *
 *   1. Sayfa gerçekten işaretlemesiz — mağaza desteklenemez.
 *   2. İşaretleme var ama `Product` değil (`BreadcrumbList`, `Organization`) —
 *      ayrıştırıcının bakacağı başka yer olabilir.
 *   3. Okunan adres zaten ürün sayfası değil — süzgeç fazla gevşek, ve mağaza
 *      haksız yere elenmiş olur.
 *
 * Üçüncüsü en tehlikelisi çünkü mağazayı değil **bizi** suçlaması gerekiyor.
 * Beymen'in tek arama sayfasından 1254 «aday» çıkarması tam olarak bu şüpheyi
 * doğuruyor.
 */
export function pageDiagnosis(html: string): string {
  const blocks = html.match(/<script[^>]+application\/ld\+json/gi)?.length ?? 0;

  const types = new Set<string>();
  for (const node of jsonLdNodes(html)) {
    for (const type of [node["@type"]].flat()) {
      if (typeof type === "string") types.add(type);
    }
  }

  const ogTitle = /property=["']og:title["']/i.test(html);
  const price = /["'](og:price:amount|product:price:amount)["']/i.test(html);
  // İstemci tarafı çatı: gövde boş gelip içerik tarayıcıda çiziliyor olabilir.
  const spa = /__NEXT_DATA__|window\.__NUXT__|window\.__INITIAL_STATE__|ng-version=/i.test(html);

  return [
    `${blocks} ld+json`,
    `tipler: ${types.size > 0 ? Array.from(types).slice(0, 6).join("/") : "yok"}`,
    `og:title ${ogTitle ? "var" : "yok"}`,
    `fiyat meta ${price ? "var" : "yok"}`,
    `${Math.round(html.length / 1024)} KB`,
    spa ? "istemci tarafı çatı" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * İlan edilmemiş arama adresini bulmak için denenecek **şekiller**.
 *
 * Mağaza başına ezberden adres yazmıyoruz — bu liste mağazaya değil, yaygın
 * e-ticaret yazılımlarının arama yoluna ait. Fark önemli: uydurulmuş bir adres
 * sessizce yanlış sonuç üretir, denenen bir şekil ise **çıktıda hangisinin
 * tuttuğu yazılarak** doğrulanabilir hâle gelir.
 *
 * Bir şekil ancak sayfayı 200 döndürüp içinden ürün bağlantısı çıkarsa
 * kullanılıyor; yani «tuttu» demek, ölçülmüş bir şey demek.
 */
export const PROBE_SHAPES = [
  "/search?q=",
  "/arama?q=",
  "/ara?q=",
  "/search?searchTerm=",
  "/s?k=",
  "/tr/search?q=",
  "/catalogsearch/result/?q=",
];

export function probeUrls(host: string, term: string): string[] {
  return PROBE_SHAPES.map((shape) => `https://www.${host}${shape}${encodeURIComponent(term)}`);
}

/**
 * Türkçe harfleri adres yazımına indirger: `güneş gözlüğü` → `gunes gozlugu`.
 *
 * Slug'lar ASCII yazılıyor, sorgu Türkçe geliyor. `normalize("NFD")` tek başına
 * yetmiyor — `ı` ve `İ` ayrışmıyor, oysa Türkçede en sık karşılaşılan ikisi bu.
 */
function fold(text: string): string {
  return text
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .toLowerCase();
}

/**
 * Adayları sorguya göre süzer ve sıralar — **sayfayı indirmeden**.
 *
 * ## Neden gerekiyor
 *
 * Üretimde ölçüldü: mağaza arama sayfasından gelen ilk bağlantılar sonuç değil
 * **öneri karuseli** oluyor. «Gri pantolon» araması iki bluz, «Gümüş ayakkabı»
 * iki abiye elbise, «Siyah güneş gözlüğü» aynı denim şortu iki kez getirdi.
 * Sekiz satırın sekizi de aile kapısında elendi, yani kullanıcı korundu — ama
 * sekiz sayfa indirildi ve tarama 4.9 saniye sürdü.
 *
 * ## Neden slug
 *
 * Ürün adresinin slug'ı ürünün adını taşıyor (`…/kolsuz-payetli-mini-abiye-
 * elbise-p-123`). Yani sayfayı indirmeden önce «bu bağlantının sorguyla ilgisi
 * var mı» sorusu **bedava** cevaplanabiliyor. İndirilmeyen sayfa hem saniye hem
 * de yanlış kart demek.
 *
 * ## Neden ad şart, renk değil
 *
 * Yalnızca «gri» eşleşmesi gri bir elbiseyi de geçirirdi. Türkçede ad sonda
 * duruyor (`buildSearchQuery` bunu koruyor), o yüzden son kelimenin tutması
 * aranıyor. Sondan ikinci ancak **kendisi de bir ürün adıysa** eşanlamlı sayılıyor
 * («Bej gömlek bluz» → mağaza «gömlek» yazıyor); niteleyiciler («spor», «rengi»)
 * ad yerine geçemiyor.
 *
 * Ön ek karşılaştırması yapılıyor çünkü Türkçe ekli: `gozlugu` slug'da `gozluk`
 * olarak geçiyor ve tam eşitlik ikisini ayrı sayardı.
 *
 * **Sınırı:** slug'ı olmayan, yalnızca sayı taşıyan adresler bu süzgeçten
 * geçemez. Ölçülen iki mağazanın ikisinde de slug var; yeni bir mağaza eklemeden
 * önce `npm run check:kesif` bunu zaten gösteriyor.
 */
/**
 * Renk sözcükleri — ikinci adın **vetosu**.
 *
 * Asıl kural aşağıdaki `familyOf` sınaması; bu küme yalnızca ikisinin
 * kesiştiği yeri kapatıyor: hem renk hem ürün olan sözcükler. Tek örneği
 * «pudra» — `face` ailesinde bir ürün (pudra), ve aynı zamanda bir renk. «Mat
 * pudra ruj» sorgusunda «pudra»yı ad saymak bir fondöteni ruj adayı yapardı.
 *
 * Elle yazılmıyor, `COLOR_NAMES`'ten türüyor: palete eklenen bir renk buraya da
 * kendiliğinden geliyor.
 */
const COLOR_WORDS = new Set<string>(
  COLOR_NAMES.flatMap((entry) => fold(entry.name).split(/\s+/)).filter(Boolean),
);

export function rankByQuery(urls: string[], query: string): string[] {
  /*
   * İki dizi, aynı sıra: sözlük sınaması Türkçe harfleri istiyor (`gömlek`
   * kökü `gomlek`'e uymaz), slug karşılaştırması istemiyor (mağaza slug'ı
   * zaten `gomlek` yazıyor). `fold` harf sayısını değiştirmediği için uzunluk
   * süzgeci ikisinde de aynı sözcükleri eliyor ve indisler kaymıyor.
   */
  const words = normalizeTr(query)
    .split(/[^a-z0-9çğıöşü]+/)
    .filter((word) => word.length >= 3);
  const tokens = words.map(fold);

  if (tokens.length === 0) return urls;

  /*
   * Ad sonda. Sondan ikinciye ancak **kendisi de bir ürün adıysa** bakılıyor.
   *
   * Üç düzeltmenin toplamı, ve üçünü de ölçüm yazdırdı:
   *
   *  1. İlk hâli her sorguda son iki kelimeye bakıyordu — «Gri pantolon»da
   *     «gri» ad sayıldı ve gri bir elbise pantolon adayı oldu.
   *  2. Kelime sayısı sınırı (≥3) onu çözdü, ama renk iki kelimeli olunca hata
   *     geri geldi: «Gümüş rengi ayakkabı» üç kelime, «rengi» ad sayıldı, iki
   *     **şort** ayakkabı adayı oldu (`…-gumus-rengi-386`).
   *  3. Renk listesi de yetmiyor: «Gümüş spor ayakkabı»da «spor» ne renk ne ad,
   *     ama `spor-sort`a uyuyor — yine şort.
   *
   * Ortak sebep, kuralın kelimenin **yerine** bakıp kendisine bakmaması. İkinci
   * ada gerçekten ihtiyaç var — «Bej gömlek bluz»da mağaza «gömlek» yazıyor,
   * bizim adımız «bluz» — ama o ihtiyaç yalnızca **eşanlamlı ürün adları** için.
   * Ayırt eden şey elde zaten var: aile sözlüğü. `gömlek` ve `bluz` orada,
   * `spor` ve `rengi` değil. Yeni bir kelime listesi uydurmak yerine ürün adını
   * tanıyan tek sözlüğe soruluyor — aile kapısının kullandığı sözlüğe.
   */
  const nouns = [tokens[tokens.length - 1]!];
  if (tokens.length >= 3) {
    const second = words[words.length - 2]!;
    if (familyOf(second) !== "unknown" && !COLOR_WORDS.has(fold(second))) {
      nouns.push(tokens[tokens.length - 2]!);
    }
  }
  const scored: Array<{ url: string; hits: number }> = [];

  for (const url of urls) {
    let path: string;
    try {
      path = fold(decodeURIComponent(new URL(url).pathname));
    } catch {
      continue;
    }

    const has = (token: string) => path.includes(token.slice(0, 5));
    if (!nouns.some(has)) continue;

    scored.push({ url, hits: tokens.filter(has).length });
  }

  scored.sort((a, b) => b.hits - a.hits);
  return scored.map((entry) => entry.url);
}

export function fillTemplate(template: string, term: string): string {
  return template
    .replace(/\{search_term_string\}/gi, encodeURIComponent(term))
    .replace(/\{searchTerms\}/gi, encodeURIComponent(term))
    .replace(/\{q\}/gi, encodeURIComponent(term))
    // OpenSearch'ün isteğe bağlı parametreleri: `{startIndex?}` gibi olanlar düşüyor.
    .replace(/\{[^}]*\?\}/g, "");
}

/**
 * Aynı mağazanın ürün sayfası olan bağlantılar — uygulamanın kendi süzgeciyle.
 *
 * Süzgeç `productUrl.ts`'ten geliyor, ayrı bir kopyası değil. Ölçmek istediğimiz
 * şey «kaç bağlantı var» değil, **uygulamanın kullanabileceği kaç bağlantı var**.
 */
export function productLinks(html: string, pageUrl: string, host: string): string[] {
  const found = new Map<string, string>();

  for (const tag of html.match(/href=["'][^"'#]+["']/gi) ?? []) {
    const href = /href=["']([^"'#]+)["']/i.exec(tag)?.[1];
    if (!href) continue;

    let link: string;
    let linkHost: string;
    try {
      link = new URL(href, pageUrl).href;
      linkHost = new URL(link).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }

    if (linkHost !== host && !linkHost.endsWith(`.${host}`)) continue;
    /*
     * Arama sayfası ayrıca elenmiyor: `isDirectProductUrl` bunu kendi içinde
     * zaten yapıyor (`productUrl.ts`, sıra bilerek böyle). Buraya bir `||
     * isSearchUrl(link)` yazılmıştı ve ölçüm onu yakaladı — kaldırılınca hiçbir
     * kontrol kırmızıya dönmedi, yani hiçbir zaman bir şey elemiyordu.
     */
    if (!isDirectProductUrl(link)) continue;

    // Aynı ürünün izleme parametreli ikinci hâli aday sayılmıyor.
    found.set(link.split("?")[0], link);
  }

  return Array.from(found.values());
}
