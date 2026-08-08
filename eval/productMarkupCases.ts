/**
 * Ürün işaretlemesi vakaları — `extractProductMarkup` gerçek şekilleri okuyor mu?
 *
 * ## Neden ayrı bir dosya
 *
 * `og:image` ayrıştırıcısı için de aynısı yapıldı (`ogImageCases.ts`) ve aynı
 * gerekçeyle: ağ çağrısı standart, **kırılgan olan ayrıştırma**. Bu ortamdan
 * hiçbir mağazaya yol yok, yani şekiller ancak burada sürülebilir.
 *
 * ## Bunlar gerçek mi
 *
 * İşaretleme **schema.org standardından** kuruldu, bir mağazadan kopyalanmadı —
 * ve bu ayrım yazılı kalsın. Standart olduğu için şekiller gerçek: `@graph`
 * sarmalayıcısı, dizi hâlindeki `offers`, `ImageObject`, `AggregateOffer` hepsi
 * spesifikasyonda tanımlı ve sahada karşılaşılan biçimler. Ama hangi mağazanın
 * hangisini kullandığı **ölçülmedi** — onu ancak ağı açık bir makinede gerçek
 * sayfalar söyleyebilir.
 *
 * Yani bu süit «ayrıştırıcı standarda uyuyor mu» diyor, «Trendyol'u okuyabiliyor
 * mu» demiyor. İkincisi bağlantılar ve ağ geldiğinde ölçülecek.
 */

export interface ProductMarkupCase {
  name: string;
  html: string;
  pageUrl: string;
  /** `null` beklentisi «bu sayfadan ürün çıkarılamaz» demek. */
  expect: {
    title?: string;
    price?: number | null;
    currency?: string | null;
    inStock?: boolean;
    brand?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
    imageUrl?: string | null;
  } | null;
}

const PAGE = "https://www.example.com/urun/triko-ceket-p-123456789";

const ld = (payload: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(payload)}</script></head><body></body></html>`;

export const PRODUCT_MARKUP_CASES: readonly ProductMarkupCase[] = [
  {
    name: "düz Product, tek offer",
    pageUrl: PAGE,
    html: ld({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Pembe Fermuarlı Triko Ceket",
      image: "https://cdn.example.com/1.jpg",
      brand: { "@type": "Brand", name: "Markafoni" },
      offers: {
        "@type": "Offer",
        price: "749.50",
        priceCurrency: "TRY",
        availability: "https://schema.org/InStock",
      },
    }),
    expect: {
      title: "Pembe Fermuarlı Triko Ceket",
      price: 749.5,
      currency: "TRY",
      inStock: true,
      brand: "Markafoni",
      imageUrl: "https://cdn.example.com/1.jpg",
    },
  },
  {
    name: "@graph sarmalayıcısı",
    pageUrl: PAGE,
    html: ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "BreadcrumbList", itemListElement: [] },
        {
          "@type": "Product",
          name: "Siyah Deri Mini Şort",
          offers: { "@type": "Offer", price: 1299.9, priceCurrency: "TRY" },
        },
      ],
    }),
    expect: { title: "Siyah Deri Mini Şort", price: 1299.9, currency: "TRY", inStock: true },
  },
  {
    name: "kök dizi, ikinci eleman Product",
    pageUrl: PAGE,
    html: ld([
      { "@type": "Organization", name: "Mağaza" },
      { "@type": "Product", name: "Keten Gömlek", offers: { price: "899", priceCurrency: "TRY" } },
    ]),
    expect: { title: "Keten Gömlek", price: 899 },
  },
  {
    name: "offers dizi — ilk geçerli fiyat alınıyor",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Sneaker",
      offers: [
        { "@type": "Offer", availability: "https://schema.org/OutOfStock" },
        { "@type": "Offer", price: "2499.00", priceCurrency: "TRY", availability: "InStock" },
      ],
    }),
    expect: { title: "Sneaker", price: 2499, inStock: true },
  },
  {
    name: "AggregateOffer, lowPrice",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Kot Pantolon",
      offers: { "@type": "AggregateOffer", lowPrice: "699.99", priceCurrency: "TRY" },
    }),
    expect: { title: "Kot Pantolon", price: 699.99, currency: "TRY" },
  },
  {
    name: "tükendi — stok yanlış gösterilmemeli",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Bere",
      offers: { price: "199", availability: "https://schema.org/OutOfStock" },
    }),
    expect: { title: "Bere", price: 199, inStock: false },
  },
  {
    name: "image dizi ve ImageObject",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ceket",
      image: [{ "@type": "ImageObject", url: "https://cdn.example.com/a.jpg" }, "https://cdn.example.com/b.jpg"],
      offers: { price: "1", priceCurrency: "TRY" },
    }),
    expect: { imageUrl: "https://cdn.example.com/a.jpg" },
  },
  {
    name: "göreli görsel yolu sayfaya göre çözülüyor",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ceket",
      image: "/medya/urun.jpg",
      offers: { price: "1", priceCurrency: "TRY" },
    }),
    expect: { imageUrl: "https://www.example.com/medya/urun.jpg" },
  },
  {
    name: "http görsel — karışık içerik, alınmamalı",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ceket",
      image: "http://cdn.example.com/a.jpg",
      offers: { price: "1", priceCurrency: "TRY" },
    }),
    expect: { imageUrl: null },
  },
  {
    name: "puan ve değerlendirme sayısı",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ruj",
      offers: { price: "349", priceCurrency: "TRY" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "4.6", reviewCount: 218 },
    }),
    expect: { rating: 4.6, reviewCount: 218 },
  },
  {
    name: "ratingCount, reviewCount yerine",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ruj",
      offers: { price: "349" },
      aggregateRating: { ratingValue: 5, ratingCount: 12 },
    }),
    expect: { rating: 5, reviewCount: 12 },
  },
  {
    /*
     * Ölçek dışı puan reddediliyor — ve reddedilince adet de düşüyor.
     * Bu kural canlı yolda ölçülmüş bir kusurdan geldi: reddedilen bir puanın
     * adedi ayakta kalıyordu, yani «218 değerlendirme» yazıp puanı gizliyorduk.
     */
    name: "10 üzerinden puan — ölçeksiz, adediyle birlikte düşüyor",
    pageUrl: PAGE,
    html: ld({
      "@type": "Product",
      name: "Ruj",
      offers: { price: "349" },
      aggregateRating: { ratingValue: "9.2", reviewCount: 40 },
    }),
    expect: { rating: null, reviewCount: null },
  },
  {
    name: "Türkçe biçimli fiyat: 1.299,90",
    pageUrl: PAGE,
    html: ld({ "@type": "Product", name: "Çanta", offers: { price: "1.299,90", priceCurrency: "TRY" } }),
    expect: { price: 1299.9 },
  },
  {
    name: "İngilizce biçimli fiyat: 1,299.90",
    pageUrl: PAGE,
    html: ld({ "@type": "Product", name: "Çanta", offers: { price: "1,299.90" } }),
    expect: { price: 1299.9 },
  },
  {
    name: "binlik nokta, ondalık yok: 1.299",
    pageUrl: PAGE,
    html: ld({ "@type": "Product", name: "Çanta", offers: { price: "1.299" } }),
    expect: { price: 1299 },
  },
  {
    name: "@type dizi olarak [Product, Thing]",
    pageUrl: PAGE,
    html: ld({ "@type": ["Product", "Thing"], name: "Etek", offers: { price: "599" } }),
    expect: { title: "Etek", price: 599 },
  },
  {
    name: "bozuk JSON bloğu atlanıyor, sağlam blok okunuyor",
    pageUrl: PAGE,
    html:
      `<html><head>` +
      `<script type="application/ld+json">{ bu json değil }</script>` +
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Gömlek",
        offers: { price: "450" },
      })}</script>` +
      `</head></html>`,
    expect: { title: "Gömlek", price: 450 },
  },
  {
    name: "JSON-LD yok — Open Graph'a düşülüyor",
    pageUrl: PAGE,
    html:
      `<html><head>` +
      `<meta property="og:title" content="Kaşmir Kazak">` +
      `<meta property="og:image" content="https://cdn.example.com/k.jpg">` +
      `<meta property="product:price:amount" content="2199.00">` +
      `<meta property="product:price:currency" content="TRY">` +
      `</head></html>`,
    expect: {
      title: "Kaşmir Kazak",
      price: 2199,
      currency: "TRY",
      imageUrl: "https://cdn.example.com/k.jpg",
    },
  },
  {
    name: "fiyatsız Product — yarım kart çizmektense hiç çizme",
    pageUrl: PAGE,
    html: ld({ "@type": "Product", name: "Ceket", image: "https://cdn.example.com/a.jpg" }),
    expect: null,
  },
  {
    name: "isimsiz Product",
    pageUrl: PAGE,
    html: ld({ "@type": "Product", offers: { price: "100" } }),
    expect: null,
  },
  {
    name: "Product değil — kategori sayfası",
    pageUrl: PAGE,
    html: ld({ "@type": "ItemList", name: "Triko", itemListElement: [] }),
    expect: null,
  },
  {
    name: "işaretleme hiç yok",
    pageUrl: PAGE,
    html: "<html><body><h1>Ceket</h1><span>749,50 TL</span></body></html>",
    expect: null,
  },
];
