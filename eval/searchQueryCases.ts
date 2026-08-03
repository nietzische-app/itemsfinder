/**
 * Sorgu kurma vakaları — merdivenin her basamağında ürün adı duruyor mu?
 *
 * ## Neden ayrı bir dosya
 *
 * `eval/groundTruth.ts` bir fotoğrafta ne olduğunu söylüyor: kutu, renk, ürün
 * adı. Boru hattının sorguyu kurarken kullandığı **öznitelik satırı** orada yok —
 * onu bir fotoğrafa bakarak yazmak da mümkün değil, çünkü öznitelikler modelin
 * ürettiği bir metin. Referans veriye uydurma öznitelik yazmak, bu projenin
 * baştan reddettiği şey.
 *
 * Bu yüzden vakalar burada ve **kurgu oldukları açıkça yazılı**. Hiçbiri bir
 * fotoğrafın ölçümü değil; her biri kodun gerçekten karşılaştığı bir **girdi
 * şekli** — çoğu doğrudan `mockCatalog.ts` ve `relaxedQueries` yorumundan
 * alındı.
 *
 * ## Ne ölçüyor
 *
 * Bir sorguda aranan ürün yoksa mağazadan dönen her satır zaten yanlış. Ölçülmüş
 * hâli, kodun kendi yorumunun «engellendi» dediği durumdu:
 *
 *   etiket «Yüksek yakalı ince örgü pastel pembe triko ceket», ürün adı «Ceket»
 *   → «Pudra Pembe Yüksek yakalı ince örgü»       — içinde ürün yok
 *
 * Sebep: `buildSearchQuery` ürün adına yer ayırıyor ama ayırma `seen` kümesini
 * paylaştığı için ad daha önce geçmişse hiç ayrılmıyordu.
 *
 * Ölçülen iddia tek: **ürün adı merdivenin her basamağında sorgunun içinde.**
 *
 * ## Ölçülüp reddedilen ikinci iddia
 *
 * Önce «sorgu ürün adıyla bitsin» diye de ölçtüm — Türkçe'de sıfat isimden önce
 * gelir, mağaza sıralaması da sondaki ismi ürün sanar. Kulağa doğru geliyor ve
 * yedi vakada da doğru; sekizincisi reddetti:
 *
 *   ürün adı «Triko», etiket «Bej Triko Kazak»
 *   hep sona taşı → «Bej Kazak İnce Oversize Triko»    — ters okunuyor
 *   gerekirse taşı → «Bej Triko Kazak İnce Oversize»   — olması gereken
 *
 * Ad etiketin içinde zaten doğru yerde durabiliyor; onu sona çekmek düzeltmek
 * değil bozmak. Yani ilk iddia kusurun kendisi, ikincisi benim düzenimdi — ve
 * ölçüm ikisini ayırdı. `buildSearchQuery` artık adı **yalnızca kesilecekse**
 * taşıyor.
 */

export interface SearchQueryCase {
  /** Vakanın neyi zorladığı — kaçtığında raporda bu yazıyor. */
  name: string;
  itemType: string;
  label?: string;
  colorName?: string;
  colorHex?: string;
  /** Modelin ürettiği öznitelik satırı; madde işaretiyle ayrılmış olabiliyor. */
  attributes?: string;
}

export const SEARCH_QUERY_CASES: readonly SearchQueryCase[] = [
  /*
   * Asıl kusur. Cümle hâlindeki etiket `relaxedQueries` yorumunun kendi verdiği
   * örnek, ürün adı etiketin **sonunda** — yani kesme sınırının öbür tarafında.
   */
  {
    name: "cümle etiket, ad sonda",
    itemType: "Ceket",
    label: "Yüksek yakalı ince örgü pastel pembe triko ceket",
    colorName: "Pudra Pembe",
  },
  /*
   * `mockCatalog.ts` → po-cardigan'ın gerçek şekli. Ad etikette geçiyor ve
   * öznitelik satırı da dolu, yani ada ayrılan yer sıfırken sonda bir sıfat
   * kalıyordu: «… Triko Ceket Pastel».
   */
  {
    name: "kısa etiket + zengin öznitelik",
    itemType: "Ceket",
    label: "Pembe Fermuarlı Triko Ceket",
    colorName: "Pudra Pembe",
    attributes: "Pastel Pembe • İnce Triko",
  },
  {
    name: "po-shorts şekli",
    itemType: "Şort",
    label: "Siyah Deri Mini Şort",
    colorName: "Siyah",
    attributes: "Mat Siyah • Deri Görünümlü",
  },
  /* Ad etikette hiç geçmiyor — rezervasyonun zaten çalıştığı yol; bozulmasın. */
  {
    name: "ad etikette yok",
    itemType: "Gömlek",
    label: "Beyaz keten oversize",
    colorName: "Kırık Beyaz",
    attributes: "Keten • Oversize",
  },
  /*
   * Çok sözcüklü ad. Türkçe'de son ünsüz yumuşuyor («gözlük» → «gözlüğü»), yani
   * düz alt-dize karşılaştırması burada yanlış cevap verir — metriğin kendisi de
   * `containsToken` kullanmak zorunda.
   */
  {
    name: "çok sözcüklü ad, etikette geçiyor",
    itemType: "Güneş Gözlüğü",
    label: "Siyah Oval Güneş Gözlüğü",
    colorName: "Siyah",
    attributes: "Metal Çerçeve • Oval",
  },
  /* Adın sözcüğü aynı zamanda bir sıfat olarak da geçiyor: taşıma iki kopya bırakmamalı. */
  {
    name: "ad hem sıfatta hem isimde",
    itemType: "Triko",
    label: "Bej Triko Kazak",
    colorName: "Bej",
    attributes: "İnce Triko • Oversize",
  },
  /* Uzun öznitelik satırı: kesme sınırı gerçekten devreye giriyor. */
  {
    name: "sınırı aşan öznitelik satırı",
    itemType: "Elbise",
    label: "Çiçek Desenli Midi Elbise",
    colorName: "Lacivert",
    attributes: "Çiçek Desenli • Viskon • Midi Boy • Kısa Kollu • Bel Detaylı",
  },
  /* Etiket yok — canlı yolda bazı tespitler yalnız ad ve renkle geliyor. */
  {
    name: "etiketsiz tespit",
    itemType: "Bot",
    colorName: "Kahverengi",
    attributes: "Süet • Bilekli",
  },
];
