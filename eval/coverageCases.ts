/**
 * «Bulunamadı» ekranının ölçüsü.
 *
 * **Neden var.** Bir tespitin ailesi okunamazsa (`familyOf` -> `unknown`)
 * `findProductsForLabel` hiçbir ürün döndürmüyor — bu bir hata değil, bilinçli bir
 * karar: yanlış giysiyi göstermektense hiçbir şey göstermemek. Ama sonucu,
 * kullanıcının sıradan bir parça için boş ekran görmesi.
 *
 * Ölçülünce çıktı: yaygın yetmiş yedi Türkçe giysi ve kozmetik kelimesinin
 * **dörtte biri** hiçbir aileye düşmüyordu — eşofman, kravat, atkı, mayo, rimel,
 * palazzo, kombinezon, papyon, cüzdan, kapri, pijama, sabahlık, bikini, anorak.
 * Hiçbiri egzotik değil; hepsi bir Türk mağazasının ana kategorilerinde duruyor.
 *
 * Bu liste o boşluğun kapalı kalmasını sağlıyor. Sözlüğe bir aile eklendiğinde
 * ölçü yükseliyor; bir kelime unutulduğunda düşüyor.
 *
 * O boşluk kapatıldı: yetmiş yedi kelimenin tamamı artık bir aileye düşüyor. Son
 * üçü — oje, parfüm ve iç giyim — kendi `ItemFamily`'leri **ve** katalog
 * satırlarıyla birlikte geldi, çünkü sözlüğe kelime eklemek tek başına onları
 * yalnızca boş bir aileye yönlendirirdi, ve boş bir aile boş ekranla aynı şey.
 */

export interface CoverageCase {
  /** Bir tespitin taşıyabileceği Türkçe ürün adı. */
  label: string;
  category: "clothing" | "beauty";
}

/** Her biri en az bir ürün döndürmeli. */
export const COVERAGE_CASES: readonly CoverageCase[] = [
  // Üst
  { label: "Basic Tişört", category: "clothing" },
  { label: "Oversize Sweatshirt", category: "clothing" },
  { label: "Triko Kazak", category: "clothing" },
  { label: "Keten Gömlek", category: "clothing" },
  { label: "Saten Bluz", category: "clothing" },
  { label: "İnce Askılı Body", category: "clothing" },
  { label: "Crop Atlet", category: "clothing" },
  // Alt
  { label: "Kot Pantolon", category: "clothing" },
  { label: "Yüksek Bel Jean", category: "clothing" },
  { label: "Midi Etek", category: "clothing" },
  { label: "Denim Şort", category: "clothing" },
  { label: "Eşofman Altı", category: "clothing" },
  { label: "Palazzo Pantolon", category: "clothing" },
  { label: "Kapri Tayt", category: "clothing" },
  // Elbise ve tek parça
  { label: "Midi Elbise", category: "clothing" },
  { label: "Tulum", category: "clothing" },
  { label: "Bikini Takımı", category: "clothing" },
  { label: "Mayo", category: "clothing" },
  { label: "Saten Pijama", category: "clothing" },
  // Dış giyim
  { label: "Şişme Mont", category: "clothing" },
  { label: "Uzun Kaban", category: "clothing" },
  { label: "Deri Ceket", category: "clothing" },
  { label: "Oversize Blazer", category: "clothing" },
  { label: "Trençkot", category: "clothing" },
  { label: "Anorak", category: "clothing" },
  { label: "Yelek", category: "clothing" },
  // Ayakkabı
  { label: "Spor Ayakkabı", category: "clothing" },
  { label: "Deri Bot", category: "clothing" },
  { label: "Topuklu Sandalet", category: "clothing" },
  { label: "Babet", category: "clothing" },
  { label: "Loafer", category: "clothing" },
  // Çanta ve şapka
  { label: "Omuz Çantası", category: "clothing" },
  { label: "Sırt Çantası", category: "clothing" },
  { label: "Cüzdan", category: "clothing" },
  { label: "Örgü Bere", category: "clothing" },
  { label: "Kasket", category: "clothing" },
  // Aksesuar
  { label: "Güneş Gözlüğü", category: "clothing" },
  { label: "Deri Kemer", category: "clothing" },
  { label: "Zincir Kolye", category: "clothing" },
  { label: "Halka Küpe", category: "clothing" },
  { label: "İpek Atkı", category: "clothing" },
  { label: "Kravat", category: "clothing" },
  { label: "Papyon", category: "clothing" },
  { label: "Deri Eldiven", category: "clothing" },
  // Kozmetik
  { label: "Mat Ruj", category: "beauty" },
  { label: "Dudak Balmı", category: "beauty" },
  { label: "Far Paleti", category: "beauty" },
  { label: "Rimel", category: "beauty" },
  { label: "Eyeliner", category: "beauty" },
  { label: "Fondöten", category: "beauty" },
  { label: "Allık", category: "beauty" },
  // Kendi aileleriyle birlikte eklenen üç tür — `KNOWN_GAPS` artık boş.
  { label: "Uzun Kalıcı Oje", category: "beauty" },
  { label: "Eau de Parfum", category: "beauty" },
  { label: "Dikişsiz Sütyen", category: "clothing" },
  { label: "Boxer", category: "clothing" },
  { label: "Bralet", category: "clothing" },
];

/**
 * Henüz karşılanamayan ürün türleri, gerekçesiyle.
 *
 * **Şu an boş.** Burada üç madde vardı — oje, parfüm, iç giyim — ve üçü de aynı
 * şeyi söylüyordu: sözlüğe kelime eklemek yetmez, çünkü boş bir aile de boş
 * ekranla aynı şey. Üçü de kendi `ItemFamily`'si ve katalog satırlarıyla birlikte
 * kapatıldı, ve yukarıdaki listeye vaka olarak eklendi.
 *
 * Liste boş kalsın diye silinmedi: bir sonraki karşılanamayan tür çıktığında
 * yazılacağı yer burası, ve boş olması "şu an bilinen bir boşluk yok" demek —
 * "kimse bakmadı" değil.
 */
export const KNOWN_GAPS: readonly string[] = [];

/**
 * Google Cloud Vision'ın döndürdüğü moda ve kozmetik sınıfları.
 *
 * **Türkçe kelime listesinden daha kritik, çünkü boru hattına giren şey bu.**
 * Ölçülünce elli dört sınıfın beşi hiçbir aileye düşmüyordu: Helmet, Wallet,
 * Underpants, Brassiere ve iki üst sınıf. Ailesi olmayan bir tespit katalogdan
 * hiçbir ürün alamıyor, yani her biri doğrudan bir boş ekran.
 *
 * Dördü çeviri tablosuna eklendi. Kalan ikisi listede **yok** ve olmamalı —
 * aşağıdaki `GENERIC_VISION_CLASSES` onları ayrı tutuyor.
 */
export const VISION_CLASSES: readonly string[] = [
  "Outerwear", "Coat", "Jacket", "Suit", "Blazer", "Sweater", "Shirt", "Top",
  "T-shirt", "Dress", "Skirt", "Shorts", "Trousers", "Jeans", "Miniskirt",
  "Swimwear", "Footwear", "Shoe", "Boot", "Sandal", "High heels", "Sneakers",
  "Slipper", "Hat", "Cap", "Helmet", "Sunglasses", "Glasses", "Goggles",
  "Scarf", "Tie", "Belt", "Glove", "Sock", "Handbag", "Bag", "Backpack",
  "Briefcase", "Wallet", "Watch", "Necklace", "Earrings", "Bracelet", "Ring",
  "Jewelry", "Lipstick", "Perfume", "Nail polish", "Brassiere", "Underpants",
];

/**
 * Tip bilgisi taşımayan üst sınıflar — bilerek aileye bağlanmıyorlar.
 *
 * "Clothing" duyan bir sisteme rastgele bir giysi ailesi seçtirmek, kullanıcıya
 * ayakkabı yerine ceket göstermenin kapısını açar. Bu sınıflar geldiğinde doğru
 * davranış, tespitin **kendi etiketine** bakmak: `findProductsForLabel` kelime
 * skoruyla çalışıyor ve «Clothing Beyaz Keten Gömlek» bir gömlek buluyor.
 * Ölçüldü — yalnız üst sınıf sıfır ürün, herhangi bir betimleyici kelimeyle üç.
 *
 * Ayrıca `detectionFilter` bu kutuları spesifik olanın lehine eliyor, yani
 * üstlerinde gerçek bir giysi kutusu varken zaten görünmüyorlar.
 */
export const GENERIC_VISION_CLASSES: readonly string[] = ["Clothing", "Cosmetics"];
