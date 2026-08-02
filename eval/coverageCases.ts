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
 * **Bilinen ve kabul edilen boşluklar** listenin sonunda, `KNOWN_GAPS` içinde:
 * oje, parfüm ve iç giyim. Üçü de yeni bir `ItemFamily` **ve** o ailede katalog
 * satırı istiyor; sözlüğe kelime eklemek tek başına onları çözmez, yalnızca boş
 * bir aileye yönlendirir. Notlanmıyorlar ama yazılılar, çünkü sessizce eksik
 * bırakılan bir kapsam, kapanmış gibi görünen bir kapsamdır.
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
];

/**
 * Henüz karşılanamayan ürün türleri, gerekçesiyle.
 *
 * Yukarıdaki listeye eklenmiyorlar çünkü sözlüğe kelime eklemek onları boş bir
 * aileye yönlendirmekten başka bir şey yapmaz — her biri yeni bir `ItemFamily`
 * **ve** o ailede katalog satırı istiyor. Kapsam metriği bunları saymıyor; bu
 * liste, sayılmadıklarının unutulmaması için var.
 */
export const KNOWN_GAPS: readonly string[] = [
  "oje / tırnak bakımı — yeni aile gerekiyor",
  "parfüm — yeni aile gerekiyor",
  "iç giyim (sütyen, boxer, iç çamaşırı) — yeni aile gerekiyor",
];
