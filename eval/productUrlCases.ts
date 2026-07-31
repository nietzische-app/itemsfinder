/**
 * Gerçek ürün ve liste sayfası adresleri, `isDirectProductUrl` için.
 *
 * **Neden bu dosya var.** Ürün bağlantısı yasağı (`src/lib/productUrl.ts`) yalnızca
 * yedi uluslararası mağazanın adres şekline göre yazılmıştı. Sahibi yirmi gerçek
 * ürün sayfası verince ölçüldü: on ikisi reddediliyordu — LCW, DeFacto, Pull&Bear,
 * Stradivarius, Gap, M&S, Altınyıldız, Tudors, Vatkalı, Hafka, Paen, Void, hepsi
 * sıradan ürün sayfaları — ve bir Zara **kategori** sayfası kabul ediliyordu.
 *
 * İkinci hata birincisinden ağır: yanlış red bir CTA'yı eksiltiyor, yanlış kabul
 * ise alışveriş yapan birini «Ürüne git»e bastığında bir sonuç sayfasına
 * düşürüyor — yasağın en baştan engellemek için var olduğu şey.
 *
 * Kalıplar bu iki listeye göre düzeltildi, o yüzden listeler burada duruyor: bir
 * dahaki düzenleme ölçüyü kaybetmesin. Adreslerin hiçbiri uydurma değil; ürün
 * tarafı sahibinin gönderdiği bağlantılar, liste tarafı aynı mağazaların kategori
 * ve arama yolları.
 *
 * Vaka eklemek: doğru kutuya bir adres yaz. Yeni bir mağazanın ürün şekli
 * reddediliyorsa `PDP_URLS`'e, bir liste yolu kabul ediliyorsa `LISTING_URLS`'e.
 */

/** Tıklandığında tek bir ürüne giden gerçek adresler. Hepsi kabul edilmeli. */
export const PDP_URLS: readonly string[] = [
  "https://www.trendyol.com/fit-women/korse-tayt-4409-p-193934145?boutiqueId=61&merchantId=204106",
  "https://www.amazon.com.tr/dp/B0CJRGT916?th=1&psc=1",
  "https://www.zara.com/tr/tr/pamuklu-keten-relaxed-fit-pantolon-p04470460.html?v1=545461210",
  "https://www.lcw.com/100-pamuk-regular-fit-basic-tisort-lacivert-o-4827604",
  "https://www.defacto.com.tr/pamuklu-fitted-jakarli-acik-mavi-sort-3505824",
  "https://paen.com/paen-unisex-oversize-t-shirt?vid=9d819cd3-d801-4a34-a291-2f5701a1a848",
  "https://www.mavi.com/kahverengi-basic-tisort/p/0612731-90892",
  "https://www.pullandbear.com/tr/bermuda-jogger-ve-tisort-paketi-l03241999?cS=800",
  "https://www.altinyildizclassics.com/erkek-slim-fit-bisiklet-yaka-beyaz-tisort-4-p",
  "https://www.tudors.com/unisex-oversize-basic-bisiklet-yaka-siyah-tisort-30843",
  "https://www.marksandspencer.com.tr/kadin-kirmizi-saf-pamuklu-desenli-tisort-10000001395568/",
  "https://www.stradivarius.com/tr/pensli-smart-pantolon-l08301116?colorId=252",
  "https://gap.com.tr/slim-khaki-pantolon-500357-acik-kahverengi/?integration_color_id=002",
  "https://www.boyner.com.tr/straight-fit-erkek-siyah-jean-pantolon-p-15589062",
  "https://www.vatkali.com/tr/cross-palazzo-pantolon_79846",
  "https://www.hafkagiyim.com/buz-mavi-angel-baskili-premium-baggy-pantolon-9917",
  "https://www.viadellerose.com/products/kadin-yesil-pantolon-vs2415307-109?variant=50863465333075",
  "https://www.tugba.com/products/arkasi-lastikli-pantolon-vizon?variant=52596773519649",
  "https://www.kigili.com/products/koyu-antrasit-super-slim-fit-klasik-kumas-pantolon-kssz3h76dz002q10-e",
  "https://voidtr.com/void-raw-nakis-detayli-premium-ekstra-baggy-pantolon?vid=3f0631bd-592c-4cb2-9ac0-057b72bc7c42",
  /*
   * Vitrin kombinlerinin on üç ürünü — sahibinin bulup gönderdiği gerçek
   * sayfalar. Türkiye perakendesinin geniş bir kesitini kapsıyorlar: büyük
   * zincirler, Inditex, gözlükçü, kürkçü, butik. Neselibutik'in stok kodu
   * (`-nbstr4085`) harfle başladığı için kalıplara bir satır daha ekletti.
   */
  "https://www.trendyol.com/macharel-jeans/pembe-devrik-yaka-fermuarli-triko-hirka-p-861541982",
  "https://www.boyner.com.tr/yuksek-bel-mini-meghan-deri-sort-siyah-p-15845369",
  "https://www.pullandbear.com/tr/suni-deri-biker-ceket-l03720323",
  "https://www.pullandbear.com/tr/ince-askili-poliamid-body-l03230388",
  "https://www.lcw.com/yuksek-bel-super-skinny-fit-kadin-jean-pantolon-indigo-o-5239461",
  "https://www.angeleyes.com.tr/angel-eyes-siyah-dikdortgen-unisex-gunes-gozlugu-6452",
  "https://www.paulmark.com.tr/kadin-kusakli-uzun-kaban_399424",
  "https://www.trendyol.com/jimmy-key/bej-sac-orgu-desenli-bere-p-1048646418",
  "https://gangown.com.tr/black-vandal-yirtik-detayli-boyfriend-jean-pantolon?vid=55b16e38-13b7-4605-b8b5-1c9891490482",
  "https://derimod.com.tr/products/kadin-siyah-bilekten-bantli-kalin-topuklu-sandalet-26sfe462318-5637145339?variant=51966618075449",
  "https://www.neselibutik.com/neselibutik-kadin-siyah-oversize-tek-dugmeli-blazer-ceket-pantolon-takim-nbstr4085",
  "https://www.sephora.com.tr/p/soft-matte-et-easy---mat-ruj-614289.html",
  "https://www.boyner.com.tr/kadin-siyah-bantli-topuklu-sandalet-01sah321140a100-p-15865262",
];

/** Liste, kategori ve arama yolları. Hiçbiri kabul edilmemeli. */
export const LISTING_URLS: readonly string[] = [
  "https://www.trendyol.com/sr?q=triko+ceket",
  "https://www.trendyol.com/kadin-triko-x-g1-c56",
  "https://www.zara.com/tr/tr/search?searchTerm=blazer",
  "https://www.zara.com/tr/tr/kadin-pantolonlar-l1335.html",
  "https://www.amazon.com.tr/s?k=sneaker",
  "https://www2.hm.com/tr_tr/search-results.html?q=jean",
  "https://shop.mango.com/tr/search?q=body",
  "https://www.asos.com/search/?q=jean",
  "https://www.lcw.com/kadin-tisort-c-1050",
  "https://www.defacto.com.tr/kadin-elbise",
  "https://www.mavi.com/kadin-jean/c/kadin-jean",
  "https://www.pullandbear.com/tr/kadin/giyim/pantolonlar-n1803",
  "https://www.boyner.com.tr/kadin-elbise-c-124",
  "https://www.marksandspencer.com.tr/kadin/",
  "https://www.stradivarius.com/tr/kadin/giyim-n1802",
  "https://gap.com.tr/erkek-pantolon/",
  "https://www.kigili.com/collections/pantolon",
  "https://www.tugba.com/collections/tesettur-pantolon",
  "https://www.viadellerose.com/collections/kadin-pantolon",
  "https://voidtr.com/kategori/pantolon",
  "https://www.vatkali.com/tr/kadin-pantolon",
  "https://www.hafkagiyim.com/pantolon",
  "https://www.tudors.com/erkek-tisort",
  "https://www.altinyildizclassics.com/erkek-gomlek",
  "https://www.angeleyes.com.tr/gunes-gozlugu",
  "https://www.paulmark.com.tr/kadin-kaban",
  "https://derimod.com.tr/collections/kadin-ayakkabi",
  "https://www.neselibutik.com/kadin-blazer",
  "https://gangown.com.tr/kategori/jean",
  "https://www.sephora.com.tr/c/makyaj-ruj",
];
