/**
 * `extractImage` için işaretleme şekilleri (`scripts/fetch-images.mjs`).
 *
 * **Neden var.** `fetch:images`, bağlantılar doldurulduktan sonraki adım ve bugüne
 * kadar hiç çalıştırılmadı — mağazalara ağ yolu olmadığı için çalıştırılamadı da.
 * Ağ çağrısı standart; kırılgan olan, sayfadan görseli çeken dört kalıbın gerçek
 * mağaza işaretlemesine uyup uymadığı. O parça ağ istemiyor, yani ölçülebilir.
 *
 * Buradaki `head` parçaları gerçek hayatta karşılaşılan yazım biçimleri: nitelik
 * sırasının ters dönmesi, tek tırnak, `og:image:secure_url`, göreli yol, ve
 * yalnızca `twitter:image` veren sayfa. Hepsi bir kalıbın atlaması kolay olan
 * durumlar.
 *
 * Reddedilmesi gerekenler de burada: `og:image` hiç yoksa `null` dönmeli, ve
 * `http:` bir değer kabul edilmemeli — sayfa https ise karışık içerik tarayıcıda
 * zaten engellenir, yani sessizce bozuk bir görsel yerine boş dönmek doğrusu.
 */

export interface OgImageCase {
  /** Ne denendiği — başarısız olduğunda basılan ad. */
  name: string;
  /** Sayfanın `<head>`inden bir parça. */
  html: string;
  /** Sayfanın kendi adresi; göreli değerleri çözmek için gerekiyor. */
  pageUrl: string;
  /** Beklenen sonuç, ya da `null` (çıkarılmamalı). */
  expected: string | null;
}

const PAGE = "https://www.example.com.tr/urun/kirmizi-elbise-p-123456";

export const OG_IMAGE_CASES: readonly OgImageCase[] = [
  {
    name: "og:image, düz",
    html: '<meta property="og:image" content="https://cdn.example.com/a.jpg">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/a.jpg",
  },
  {
    name: "og:image, nitelik sırası ters",
    html: '<meta content="https://cdn.example.com/b.jpg" property="og:image">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/b.jpg",
  },
  {
    name: "og:image, tek tırnak",
    html: "<meta property='og:image' content='https://cdn.example.com/c.jpg'>",
    pageUrl: PAGE,
    expected: "https://cdn.example.com/c.jpg",
  },
  {
    name: "og:image:secure_url",
    html: '<meta property="og:image:secure_url" content="https://cdn.example.com/d.jpg">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/d.jpg",
  },
  {
    name: "göreli yol, sayfaya göre çözülüyor",
    html: '<meta property="og:image" content="/medya/urun/e.jpg">',
    pageUrl: PAGE,
    expected: "https://www.example.com.tr/medya/urun/e.jpg",
  },
  {
    name: "yalnızca twitter:image",
    html: '<meta name="twitter:image" content="https://cdn.example.com/f.jpg">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/f.jpg",
  },
  {
    name: "link rel=image_src",
    html: '<link rel="image_src" href="https://cdn.example.com/g.jpg">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/g.jpg",
  },
  {
    name: "og:image, değerde boşluk",
    html: '<meta property="og:image" content="  https://cdn.example.com/h.jpg  ">',
    pageUrl: PAGE,
    expected: "https://cdn.example.com/h.jpg",
  },
  {
    name: "og:image yok — boş dönmeli",
    html: '<meta name="description" content="Kırmızı elbise">',
    pageUrl: PAGE,
    expected: null,
  },
  {
    name: "http değer — karışık içerik, alınmamalı",
    html: '<meta property="og:image" content="http://cdn.example.com/i.jpg">',
    pageUrl: PAGE,
    expected: null,
  },
  {
    name: "JSON-LD Product.image string",
    html: `<script type="application/ld+json">{"@type":"Product","name":"Elbise","image":"https://cdn.example.com/j.jpg"}</script>`,
    pageUrl: PAGE,
    expected: "https://cdn.example.com/j.jpg",
  },
  {
    name: "JSON-LD Product.image ImageObject",
    html: `<script type="application/ld+json">{"@type":"Product","image":{"@type":"ImageObject","url":"https://cdn.example.com/k.jpg"}}</script>`,
    pageUrl: PAGE,
    expected: "https://cdn.example.com/k.jpg",
  },
  {
    name: "JSON-LD @graph Product",
    html: `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Product","image":["https://cdn.example.com/l.jpg"]}]}</script>`,
    pageUrl: PAGE,
    expected: "https://cdn.example.com/l.jpg",
  },
];
