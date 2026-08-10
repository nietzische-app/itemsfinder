/**
 * `check-kesif.mjs`'in karar veren kısmı — ağdan ayrılmış hâli.
 *
 * Betiğin kendisi ağ gerektiriyor ve bu depodan mağazalara çıkış kapalı, yani
 * uçtan uca sürülemiyor. Kararlar ise saf: hangi adres arama kalıbı sayılıyor,
 * hangi bağlantı ürün sayfası sayılıyor, bir gövde bot duvarı mı. Bunlar burada
 * duruyor ve `scripts/stubs/kesif-check.mjs` ile ölçülüyor.
 *
 * Ayrımın sebebi ölçüm: ağ olmadan ölçülemeyen bir şeyi, ağ olmadan ölçülebilen
 * şeyle aynı dosyada tutmak, ikincisini de ölçüsüz bırakırdı.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);
const { jsonLdNodes } = await import("@/lib/productMarkup");
const { isDirectProductUrl } = await import("@/lib/productUrl");

export const USER_AGENT =
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
export function looksLikeWall(html) {
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
export function searchActionTemplate(html) {
  for (const node of jsonLdNodes(html)) {
    for (const action of [node.potentialAction].flat().filter(Boolean)) {
      if (typeof action !== "object" || action === null) continue;
      if (!/SearchAction/i.test(String(action["@type"] ?? ""))) continue;

      const target = action.target;
      const template =
        typeof target === "string"
          ? target
          : typeof target === "object" && target !== null
            ? (target.urlTemplate ?? target["@id"])
            : null;

      if (typeof template === "string" && /\{[^}]*search[^}]*\}/i.test(template)) return template;
    }
  }
  return null;
}

/** OpenSearch tanımındaki `{searchTerms}` taşıyan HTML adresi. */
export function openSearchUrlFromXml(xml) {
  for (const match of xml.matchAll(/<Url\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/type=["']text\/html["']/i.test(tag)) continue;
    const template = /template=["']([^"']+)["']/i.exec(tag)?.[1];
    if (template && /\{searchTerms\}/i.test(template)) return template;
  }
  return null;
}

/** Ana sayfadaki `<link rel="search">` adresi. */
export function openSearchHref(html) {
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
export function pageDiagnosis(html) {
  const blocks = html.match(/<script[^>]+application\/ld\+json/gi)?.length ?? 0;

  const types = new Set();
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

export function probeUrls(host, term) {
  return PROBE_SHAPES.map((shape) => `https://www.${host}${shape}${encodeURIComponent(term)}`);
}

export function fillTemplate(template, term) {
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
export function productLinks(html, pageUrl, host) {
  const found = new Map();

  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    let link;
    let linkHost;
    try {
      link = new URL(match[1], pageUrl).href;
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
