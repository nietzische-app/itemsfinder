import { normalizeTr } from "@/lib/itemFamily";

/**
 * Kimin için alışveriş yapıldığı, ve bir başlığın kimin için olduğu.
 *
 * ## Neden var
 *
 * Üretimde ölçüldü: kadın kombini tarandı, Boyner'in arama sayfası «Slim Fit
 * Orta Bel Düz Paça **Erkek** Gri Pantolon» döndürdü ve satır bütün kapıları
 * geçti — doğru aile, doğru renk, doğru cins ürün. Teknik olarak kusursuz,
 * kullanıcı için yanlış ürün.
 *
 * ## Neden fotoğraftan çıkarılmıyor
 *
 * Fotoğraftaki kişinin görünüşünden cinsiyet çıkarmak hem güvenilmez hem de
 * yapılmaması gereken bir şey. Bu yüzden burada **tahmin yok**: değer yalnızca
 * kullanıcının kendi seçiminden geliyor ve varsayılan «fark etmez».
 *
 * ## Neden yalnızca çelişki cezalandırılıyor
 *
 * `attributeMatch` kuralının aynısı: yokluk bir listeye karşı kullanılmaz.
 * Mağazaların çoğu başlığa cinsiyet yazıyor ama hepsi yazmıyor, ve yazmayan bir
 * mağazayı cezalandırmak yalnızca uzun başlık yazanı ödüllendirirdi.
 */

/** Kullanıcının seçimi. Yokluğu «fark etmez» demek. */
export type ShopperGender = "kadın" | "erkek";

/** Bir başlığın kime hitap ettiği. `çocuk` ikisiyle de çelişiyor. */
export type TitleAudience = ShopperGender | "çocuk" | "unisex";

/**
 * Sıra önemli: «erkek çocuk» bir çocuk ürünü, erkek ürünü değil. Çocuk kalıpları
 * önce bakılıyor, yoksa «erkek» kelimesi onu yetişkin ürünü sayardı.
 */
const CHILD = ["çocuk", "bebek", "junior", "kids", "baby"];
const WOMEN = ["kadın", "bayan", "women", "woman", "female"];
const MEN = ["erkek", "men", "man", "male"];
const UNISEX = ["unisex"];

/**
 * Kelime sınırı, ve sınıra Türkçe harfler dahil.
 *
 * İki tuzak var ve ölçüm ikisini de yakaladı:
 *
 *  - `normalizeTr` yalnızca küçük harfe çeviriyor, ASCII'ye katlamıyor. Liste
 *    `cocuk` diye yazılınca «Erkek Çocuk» hiç eşleşmedi ve bir çocuk pantolonu
 *    yetişkine gösterilecekti.
 *  - Sınıf `[^a-z0-9]` olsaydı «çocuk» kelimesinin `ç`si sınır sayılır, kelime
 *    ortadan bölünürdü — `itemFamily.split` aynı sebeple Türkçe harfleri
 *    sınıfına almış.
 *
 * Alt dize araması da yetmez: «Mango **Kadi**fe Pantolon» kadın ürünü bildirmiyor.
 */
function mentions(text: string, words: string[]): boolean {
  return words.some((word) =>
    new RegExp(`(^|[^a-z0-9çğıöşü])${word}([^a-z0-9çğıöşü]|$)`).test(text),
  );
}

/** Başlığın hitap ettiği kitle, ya da söylemiyorsa `null`. */
export function audienceOf(title: string): TitleAudience | null {
  const text = normalizeTr(title);

  if (mentions(text, CHILD)) return "çocuk";
  if (mentions(text, UNISEX)) return "unisex";
  if (mentions(text, WOMEN)) return "kadın";
  if (mentions(text, MEN)) return "erkek";
  return null;
}

/**
 * Bu başlık, seçilen kitleyle çelişiyor mu?
 *
 * Seçim yoksa çelişki de yok — «fark etmez» gerçekten fark etmiyor. `unisex`
 * hiçbir seçimle çelişmiyor, zaten ikisi için de satılıyor.
 */
export function contradictsShopper(title: string, shopper?: ShopperGender): boolean {
  if (!shopper) return false;

  const audience = audienceOf(title);
  if (audience === null || audience === "unisex") return false;

  return audience !== shopper;
}

/** Gövdeden gelen değeri güvenle okur — dışarıdan gelen her şey gibi. */
export function parseShopperGender(value: unknown): ShopperGender | undefined {
  return value === "kadın" || value === "erkek" ? value : undefined;
}
