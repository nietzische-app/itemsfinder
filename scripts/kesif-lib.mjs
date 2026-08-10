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
