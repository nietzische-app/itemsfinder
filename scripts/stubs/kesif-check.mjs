/**
 * Ücretsiz keşif yolunun kararları — `node scripts/stubs/kesif-check.mjs`.
 *
 * `check-kesif.mjs` ağ gerektiriyor ve bu depodan mağazalara çıkış kapalı, yani
 * gerçek mağazaların davranışı buradan ölçülemiyor. Ölçülebilen şey **kararlar**:
 * hangi adres arama kalıbı sayılıyor, hangi bağlantı ürün sayfası sayılıyor, ve
 * bir gövde bot duvarı mı.
 *
 * Bunlar ölçülmezse betiğin çıktısı yanlış olur ve yanlış olduğu anlaşılmaz:
 * kalıbı okuyamayan bir betik her mağaza için «ilan etmemiş» yazar, süzgeci
 * bozuk bir betik her mağaza için «bağlantı yok» yazar. İkisi de sessizce
 * «ücretsiz yol yürümüyor» sonucuna götürür — ölçülmemiş bir ret.
 */
import { createServer } from "node:http";

import {
  fillTemplate,
  looksLikeWall,
  openSearchHref,
  openSearchUrlFromXml,
  productLinks,
  searchActionTemplate,
} from "../kesif-lib.mjs";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/* 1) Arama kalıbı mağazanın kendi ilanından okunuyor. */
{
  // Hedef düz metin — en yaygın hâli.
  const plain = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: "https://www.magaza.com/",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.magaza.com/arama?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  })}</script>`;

  t(
    searchActionTemplate(plain) === "https://www.magaza.com/arama?q={search_term_string}",
    `düz hedef okunuyor: «${searchActionTemplate(plain)}»`,
  );

  // Hedef nesne — `EntryPoint.urlTemplate`. schema.org'un önerdiği hâli bu.
  const entryPoint = `<script type="application/ld+json">${JSON.stringify({
    "@type": "WebSite",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: "https://m.com/s?k={search_term_string}" },
    },
  })}</script>`;

  t(searchActionTemplate(entryPoint) === "https://m.com/s?k={search_term_string}", "nesne hedef okunuyor");

  // Birden çok eylem — arama olanı seçilmeli.
  const many = `<script type="application/ld+json">${JSON.stringify({
    "@graph": [
      { "@type": "Organization", name: "Mağaza" },
      {
        "@type": "WebSite",
        potentialAction: [
          { "@type": "ViewAction", target: "https://m.com/goz" },
          { "@type": "SearchAction", target: "https://m.com/ara?q={search_term_string}" },
        ],
      },
    ],
  })}</script>`;

  t(searchActionTemplate(many) === "https://m.com/ara?q={search_term_string}", "@graph içinden arama eylemi seçiliyor");

  /*
   * İlan yoksa kalıp **uydurulmamalı**.
   *
   * Ezberden yazılan bir adres ölçümü sessizce bozar: 404 alan bir istek «bot
   * duvarı» gibi görünür ve mağaza haksız yere elenir.
   */
  t(searchActionTemplate("<html><body>hiçbir şey</body></html>") === null, "ilan yoksa null");
  t(
    searchActionTemplate(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "WebSite",
        potentialAction: { "@type": "SearchAction", target: "https://m.com/ara" },
      })}</script>`,
    ) === null,
    "yer tutucusu olmayan hedef kalıp sayılmıyor",
  );
}

/* 2) OpenSearch yedeği. */
{
  const html = `<link rel="search" type="application/opensearchdescription+xml" href="/osd.xml" title="Mağaza">`;
  t(openSearchHref(html) === "/osd.xml", `OpenSearch adresi bulunuyor: «${openSearchHref(html)}»`);
  t(openSearchHref("<html></html>") === null, "yoksa null");

  const xml = `<OpenSearchDescription>
    <Url type="application/x-suggestions+json" template="https://m.com/oneri?q={searchTerms}"/>
    <Url type="text/html" template="https://m.com/ara?q={searchTerms}&amp;start={startIndex?}"/>
  </OpenSearchDescription>`;

  // Öneri adresi değil HTML adresi seçilmeli — ilki JSON döndürüyor.
  t(
    openSearchUrlFromXml(xml) === "https://m.com/ara?q={searchTerms}&amp;start={startIndex?}",
    `HTML adresi seçiliyor: «${openSearchUrlFromXml(xml)}»`,
  );
}

/* 3) Sorgu adrese doğru giriyor. */
{
  t(
    fillTemplate("https://m.com/ara?q={search_term_string}", "gri pantolon") ===
      "https://m.com/ara?q=gri%20pantolon",
    "boşluk kodlanıyor",
  );
  t(
    fillTemplate("https://m.com/ara?q={searchTerms}", "çanta & ayakkabı").endsWith(
      "q=%C3%A7anta%20%26%20ayakkab%C4%B1",
    ),
    "Türkçe harf ve `&` kodlanıyor",
  );
  // İsteğe bağlı OpenSearch parametreleri düşmeli, yoksa adrese `{startIndex?}` gider.
  t(
    fillTemplate("https://m.com/ara?q={searchTerms}&start={startIndex?}", "triko") ===
      "https://m.com/ara?q=triko&start=",
    `isteğe bağlı parametre düşüyor: «${fillTemplate("https://m.com/ara?q={searchTerms}&start={startIndex?}", "triko")}»`,
  );
}

/* 4) Bot duvarı teşhisi. */
{
  t(looksLikeWall("<html><head><title>Just a moment...</title>"), "Cloudflare doğrulaması duvar sayılıyor");
  t(looksLikeWall('<div id="cf-browser-verification">'), "cf imzası duvar sayılıyor");
  t(looksLikeWall("<html>Access Denied</html>"), "erişim reddi duvar sayılıyor");
  t(!looksLikeWall("<html><body>Ürün listesi</body></html>"), "normal sayfa duvar sayılmıyor");
  /*
   * Sayfanın ilerisinde geçen kelime duvar değil.
   *
   * Yardım metninde «captcha» yazan bir mağazayı elemek, ölçümü yanlış yapardı —
   * ve bu tür bir yanlış, «bot duvarı» satırının arkasına saklanıp fark edilmezdi.
   */
  t(
    !looksLikeWall(`<html><body>${"x".repeat(5000)}g-recaptcha</body></html>`),
    "gövdenin ilerisindeki kelime duvar sayılmıyor",
  );
}

/* 5) Ürün bağlantısı süzgeci. */
{
  const html = `
    <a href="/marka/gri-pantolon-p-123456789">ürün</a>
    <a href="/marka/gri-pantolon-p-123456789?merchantId=42">aynı ürün, izleme parametreli</a>
    <a href="/sr?q=gri+pantolon">arama sayfası</a>
    <a href="/kadin-pantolon-c-1234">kategori</a>
    <a href="https://www.baskasite.com/urun-p-987654321">başka mağaza</a>
    <a href="https://cdn.trendyol.com/foto.jpg">görsel</a>
    <a href="https://www.trendyol.com/marka/bej-bluz-p-222222222">tam adresli ürün</a>
  `;
  const links = productLinks(html, "https://www.trendyol.com/sr?q=gri+pantolon", "trendyol.com");

  t(links.length === 2, `iki ürün kaldı (${links.length}): ${JSON.stringify(links)}`);
  t(links.some((l) => l.includes("gri-pantolon-p-123456789")), "göreli adres çözülüyor");
  t(links.some((l) => l.includes("bej-bluz-p-222222222")), "tam adres geçiyor");
  t(!links.some((l) => l.includes("baskasite")), "başka mağaza elenmiyor değil — eleniyor");
  /*
   * Arama ve kategori sayfası aday sayılmamalı. Bunu eleyen şey `isDirectProductUrl`
   * — sıra onun içinde bilerek böyle kurulmuş. Kontrol yine de duruyor çünkü ölçtüğü
   * şey uygulamanın davranışı, hangi satırın elediği değil.
   */
  t(!links.some((l) => l.includes("/sr?")), "arama sayfası aday sayılmıyor");
  t(!links.some((l) => l.includes("-c-1234")), "kategori sayfası aday sayılmıyor");
}

/*
 * 6) Uçtan uca — sahte bir mağazaya karşı.
 *
 * Parçaların tek tek doğru olması yetmiyor: ölçülmek istenen şey «ana sayfadan
 * kalıbı oku, aramaya git, adayları çıkar» zincirinin **bütünü**. Zincirin bir
 * halkası ötekinin çıktısını yanlış biçimde bekliyorsa, parça kontrolleri yeşil
 * kalır ve betik yine her mağaza için «bağlantı yok» yazar.
 */
{
  let searchPath = null;
  let base = "";

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");

    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><head><script type="application/ld+json">${JSON.stringify({
        "@type": "WebSite",
        potentialAction: {
          "@type": "SearchAction",
          target: { urlTemplate: `${base}/ara?q={search_term_string}` },
        },
      })}</script></head><body>ana sayfa</body></html>`);
      return;
    }

    if (url.pathname === "/ara") {
      searchPath = url.search;
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<html><body>
        <a href="/urun/gri-pantolon-p-111111111">bir</a>
        <a href="/ara?q=baska">tekrar ara</a>
        <a href="/urun/bej-bluz-p-222222222">iki</a>
      </body></html>`);
      return;
    }

    res.writeHead(404);
    res.end("yok");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(`${base}/`).then((r) => r.text());
  const template = searchActionTemplate(home);

  t(template === `${base}/ara?q={search_term_string}`, `ana sayfadan kalıp okundu: «${template}»`);

  /*
   * Kalıp okunamadıysa zincirin gerisi çalıştırılmıyor.
   *
   * İlk hâli çalıştırıyordu ve kalıp okuyucusu bozulduğunda süit bir yığın iziyle
   * çöküyordu: çıkış kodu doğru ama ekranda tek bir kırmızı satır yok. Bozulan
   * şeyin hangisi olduğunu söylemeyen bir ölçüm, ölçüm değil.
   */
  if (template) {
    const searchUrl = fillTemplate(template, "gri pantolon");
    const body = await fetch(searchUrl).then((r) => r.text());

    t(searchPath === "?q=gri%20pantolon", `sorgu mağazaya ulaştı: «${searchPath}»`);
    t(!looksLikeWall(body), "sahte mağaza duvar sayılmıyor");

    const links = productLinks(body, searchUrl, "127.0.0.1");

    t(links.length === 2, `zincirin sonunda iki aday (${links.length}): ${JSON.stringify(links)}`);
    t(!links.some((l) => l.includes("/ara")), "arama bağlantısı aday listesine sızmıyor");
  } else {
    fails.push("kalıp okunamadığı için zincirin gerisi ölçülemedi");
  }

  server.close();
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
