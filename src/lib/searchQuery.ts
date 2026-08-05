import { toTurkishRetailTerms } from "@/lib/retailVocabulary";

/**
 * Search query construction.
 *
 * Vision hands back three loosely related signals — an object label
 * (`OBJECT_LOCALIZATION`), a richer phrase (`WEB_DETECTION`) and dominant
 * colours (`IMAGE_PROPERTIES`). Searching on the object label alone produces
 * useless queries like "Ruj"; combining all three produces the descriptive
 * query a shopper would actually type: "Kırmızı Mat Likit Ruj".
 */

/**
 * Named Turkish colours with their reference RGB, used for nearest-match.
 *
 * Exported because the live product stage reads colour words out of retailer
 * titles and has to place them on the same scale the pipeline measures on.
 */
export const COLOR_NAMES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: "Siyah", rgb: [17, 17, 17] },
  { name: "Antrasit", rgb: [60, 62, 68] },
  { name: "Gri", rgb: [140, 140, 142] },
  { name: "Açık Gri", rgb: [205, 205, 208] },
  { name: "Beyaz", rgb: [250, 250, 250] },
  { name: "Kırık Beyaz", rgb: [240, 236, 226] },
  { name: "Bej", rgb: [223, 205, 177] },
  { name: "Camel", rgb: [181, 137, 90] },
  { name: "Kahverengi", rgb: [98, 66, 44] },
  { name: "Bordo", rgb: [110, 26, 38] },
  { name: "Kırmızı", rgb: [204, 24, 38] },
  { name: "Mercan", rgb: [224, 86, 56] },
  { name: "Turuncu", rgb: [235, 130, 40] },
  { name: "Hardal", rgb: [206, 168, 50] },
  { name: "Sarı", rgb: [240, 214, 70] },
  { name: "Yeşil", rgb: [58, 132, 74] },
  { name: "Haki", rgb: [110, 116, 78] },
  { name: "Turkuaz", rgb: [50, 168, 168] },
  { name: "Mavi", rgb: [42, 92, 170] },
  { name: "Lacivert", rgb: [30, 40, 78] },
  { name: "Mor", rgb: [110, 62, 160] },
  { name: "Lila", rgb: [186, 160, 214] },
  { name: "Pembe", rgb: [226, 120, 158] },
  { name: "Pudra", rgb: [235, 200, 196] },
  { name: "Altın", rgb: [212, 175, 85] },
  { name: "Gümüş", rgb: [196, 199, 204] },
];

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Nearest named Turkish colour for a hex value, or `null` if unparseable.
 * Plain squared RGB distance: the palette is coarse enough that a perceptual
 * space would not change which bucket a garment colour falls into.
 */
export function colorNameFromHex(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let best = COLOR_NAMES[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of COLOR_NAMES) {
    const distance =
      (candidate.rgb[0] - rgb[0]) ** 2 +
      (candidate.rgb[1] - rgb[1]) ** 2 +
      (candidate.rgb[2] - rgb[2]) ** 2;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best.name;
}

export interface SearchQueryParts {
  /** Coarse object label, e.g. "Ruj" or Vision's "Cosmetics". */
  itemType: string;
  /** Richer phrase, typically from web detection, e.g. "Mat Likit Ruj". */
  label?: string;
  /** Dominant colour of the region as hex. */
  colorHex?: string;
  /**
   * Colour name to use instead of the one derived from `colorHex`.
   *
   * The hex is a *measurement* of a rectangle; when a vision model has looked at
   * the crop and named the garment's own colour, its word is the better one — the
   * measurement is the background whenever the garment is a minority of its box.
   */
  colorName?: string;
  /**
   * Ordered descriptors placed between the colour and the garment noun — pattern,
   * material, visible details, fit. This is the order a Turkish shopper types
   * ("pembe fermuarlı triko ceket") and the order storefront relevance rewards.
   */
  descriptors?: Array<string | null | undefined>;
  /** Free-text attributes, e.g. "Gerçek Kırmızı • Kadife Mat". */
  attributes?: string;
}

/** Tokens too generic to help a storefront search. */
const NOISE = new Set([
  "clothing",
  "outerwear",
  "footwear",
  "cosmetics",
  "person",
  "apparel",
  "top",
  "tops",
  "üst",
  "alt",
  "giyim",
  "kozmetik",
  "ürün",
  "parça",
  // "Plain" is the default for most garments, so as a search token it narrows
  // nothing while consuming one of the few slots a search box respects.
  "düz",
  "sade",
  "desensiz",
]);

/**
 * Product nouns that must never be the *entire* search query (alone or with only
 * a colour). "Jean" is kept as a token inside "Kargo Jean" — it is banned only
 * as a singleton final query, which is what produced repetitive wrong products
 * after Gemini 429s.
 */
const BANNED_SINGLETON_NOUNS = new Set([
  "top",
  "tops",
  "üst",
  "alt",
  "jean",
  "jeans",
  "clothing",
  "outerwear",
  "footwear",
  "apparel",
  "giyim",
  "bluz",
  "pantolon",
]);

const COLOUR_TOKEN_HINTS = new Set([
  "siyah",
  "beyaz",
  "gri",
  "bej",
  "krem",
  "kahverengi",
  "kırmızı",
  "mavi",
  "lacivert",
  "yeşil",
  "pembe",
  "pudra",
  "mor",
  "sarı",
  "turuncu",
  "camel",
  "bordo",
  "haki",
  "antrasit",
  "altın",
  "gümüş",
  "kırık",
  "açık",
  "koyu",
]);

/** Storefront search boxes degrade past a handful of words. */
const MAX_TOKENS = 6;

/**
 * Bir sözcüğü kenarındaki noktalama ve süslemeden arındırır.
 *
 * Tek bir yerde, çünkü hem sıfat hem ürün adı yolu aynı kuralı uygulamak zorunda:
 * ikisi ayrı ayrı temizlense, «Ceket,» ile «Ceket» farklı sözcük sayılır ve isim
 * hem sıfatların arasında hem sonda iki kez geçerdi.
 */
function cleanToken(word: string): string {
  return word
    .trim()
    .replace(/^[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+|[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+$/g, "");
}

/**
 * Builds a descriptive, de-duplicated search query.
 *
 * Order matters: colour first, then the descriptors, then the descriptive
 * phrase, then the object type — that is the order Turkish shoppers type
 * ("kırmızı mat ruj"), and it is the order storefront relevance ranking
 * rewards. The object type is placed last but reserved first, so it survives
 * the token cap.
 */
export function buildSearchQuery(parts: SearchQueryParts): string {
  const tokens: string[] = [];
  const noun: string[] = [];
  const seen = new Set<string>();

  const push = (value: string | undefined, into: string[] = tokens) => {
    if (!value) return;

    /*
     * Vision answers in English and the storefronts are Turkish. Translating here
     * rather than at each call site means every path — the coarse detector class,
     * a web entity, the model's own words if it slips into English — arrives in
     * the language the search box speaks. Unknown words pass through unchanged.
     */
    const translated = toTurkishRetailTerms(value);

    // Attribute lines are bullet-separated; split them into words.
    for (const word of translated.split(/[\s•·,/]+/)) {
      const clean = cleanToken(word);
      if (clean.length < 2) continue;

      const key = clean.toLocaleLowerCase("tr");
      if (seen.has(key) || NOISE.has(key)) continue;

      seen.add(key);
      into.push(clean);
    }
  };

  push(parts.colorName ?? (parts.colorHex ? colorNameFromHex(parts.colorHex) ?? undefined : undefined));
  for (const descriptor of parts.descriptors ?? []) push(descriptor ?? undefined);
  push(parts.label);
  push(parts.attributes);

  /*
   * The garment noun is collected separately: it is the one token a search box
   * cannot do without, and it used to sit last, so a rich set of attributes
   * truncated it away — "pudra düz triko fermuarlı yüksek yaka" is a query with
   * no product in it. Room is reserved for it instead of hoping it fits.
   *
   * **Ama rezervasyon, isim daha önce geçtiyse çalışmıyordu.** `seen` paylaşıldığı
   * için etikette zaten «ceket» geçen bir parçada `push` onu atlıyor, `noun` boş
   * kalıyor, ayrılan yer sıfır oluyor — ve isim etiketin içinde, kesme sınırının
   * ötesinde kalabiliyor. Ölçülen hâli, yorumun engellediğini söylediği durumun
   * ta kendisi:
   *
   *   etiket «Yüksek yakalı ince örgü pastel pembe triko ceket», ürün adı «Ceket»
   *   → «Pudra Pembe Yüksek yakalı ince örgü»   — içinde ürün yok
   *
   * İsim daha önce geçmişse **yalnızca kesilecekse** taşınıyor, her hâlükârda
   * değil. Önce hepsini sona almayı denedim; ölçüm reddetti:
   *
   *   ürün adı «Triko», etiket «Bej Triko Kazak»
   *   hep taşı → «Bej Kazak İnce Oversize Triko»    — Türkçe ters okunuyor
   *   gerekirse → «Bej Triko Kazak İnce Oversize»   — olması gereken
   *
   * Yani doğru olan iddia «sorgu isimle bitsin» değil, **«isim sorguda kalsın»**.
   * İlki benim düzenim, ikincisi kusurun kendisi. Türkçe'de sıfat isimden önce
   * gelir; etiketin içinde doğru yerde duran bir ismi sona çekmek, düzeltmek değil
   * bozmak oluyor.
   */
  const nounKeys: string[] = [];
  for (const word of toTurkishRetailTerms(parts.itemType ?? "").split(/[\s•·,/]+/)) {
    const clean = cleanToken(word);
    if (clean.length < 2) continue;

    const key = clean.toLocaleLowerCase("tr");
    if (NOISE.has(key) || nounKeys.includes(key)) continue;
    nounKeys.push(key);

    // Hiç geçmemişse sona eklenecek; ayrılan yer de buradan doğuyor.
    if (!seen.has(key)) {
      seen.add(key);
      noun.push(clean);
    }
  }

  /*
   * Kesme sınırının ötesinde kalan isim sözcüklerini sona taşı.
   *
   * Sabit noktaya kadar: her taşıma sona bir sözcük eklediği için sınır bir
   * daralıyor, ve bu daralma daha önce güvenli görünen başka bir isim sözcüğünü
   * sınırın dışına itebiliyor. En fazla birkaç tur — isim iki üç sözcük.
   */
  for (;;) {
    const limit = Math.max(1, MAX_TOKENS - noun.length);
    const at = tokens.findIndex(
      (token, index) => index >= limit && nounKeys.includes(token.toLocaleLowerCase("tr")),
    );
    if (at === -1) break;

    noun.unshift(...tokens.splice(at, 1));
  }

  return [...tokens.slice(0, Math.max(1, MAX_TOKENS - noun.length)), ...noun].join(" ");
}

/**
 * True when a finished query is too thin to send to a storefront — a lone
 * banned noun, or that noun plus only colour words ("Krem Üst", "Mavi Jean").
 *
 * Callers with a WEB_DETECTION phrase should rebuild; callers without one still
 * avoid shipping the bare generic by falling through to a richer label.
 */
export function isTooGenericQuery(query: string): boolean {
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => cleanToken(w).toLocaleLowerCase("tr"))
    .filter((w) => w.length >= 2);

  if (words.length === 0) return true;

  const nonColour = words.filter((w) => !COLOUR_TOKEN_HINTS.has(w) && !NOISE.has(w));
  if (nonColour.length === 0) return true;
  if (nonColour.length === 1) return BANNED_SINGLETON_NOUNS.has(nonColour[0]!);
  return nonColour.every((w) => BANNED_SINGLETON_NOUNS.has(w));
}

/**
 * The attribute fields a described garment contributes to a query.
 *
 * Declared structurally rather than imported from `attributeExtractor`, which is
 * `server-only`: this module is reached from client bundles and from the eval, and
 * neither should be pulling a server module in to name a shape.
 */
export interface GarmentAttributeLike {
  garmentType: string;
  colorName: string;
  colorHex: string;
  material: string | null;
  pattern: string | null;
  details: string[];
  fit: string | null;
}

/**
 * The query the pipeline builds once something has actually looked at the crop.
 *
 * Exported so the eval scores **this** rather than its own re-assembly of the same
 * fields. The ordering below is a real decision — pattern, then details, then
 * material immediately before the noun, because "triko ceket" is itself a category
 * name on Turkish storefronts — and a second copy of it in the eval would quietly
 * drift until the measured query was one no user ever receives.
 *
 * No `label`: the web entity names the photograph, not the garment, and the
 * pipeline stops consulting it the moment a crop has been described.
 *
 * `normalizeAttributes` guarantees `garmentType`, `colorName` and `colorHex` are
 * non-empty — an object missing any of them is rejected as unusable rather than
 * returned — so there is no fallback to thread through here.
 */
export function attributeSearchQuery(attrs: GarmentAttributeLike): string {
  return buildSearchQuery({
    itemType: attrs.garmentType,
    colorName: attrs.colorName,
    colorHex: attrs.colorHex,
    descriptors: [attrs.pattern, ...attrs.details, attrs.material, attrs.fit],
  });
}

/**
 * Aynı parçanın giderek gevşeyen sorguları — en özelden en genele.
 *
 * **Neden.** Canlı arama tek bir sorgu deniyordu: renk + malzeme + desen + ürün
 * adı. Bir mağazada o kombinasyonun tam karşılığı yoksa sonuç sıfır oluyordu, ve
 * kullanıcı «beyaz keten oversize gömlek» için boş ekran görüyordu — oysa aynı
 * mağazada onlarca gömlek var. Sıfır sonuç, «biraz farklı bir gömlek»ten kötü.
 *
 * Basamaklar:
 *
 *  1. Tam sorgu — renk + betimleyiciler + ürün adı.
 *  2. Renk + ürün adı — malzeme ve desen düşüyor. Bunlar bir mağazanın
 *     başlığında en sık eksik olan iki alan; «keten» yazmayan bir gömlek ilanı
 *     keten olmadığı için değil, başlığa yazılmadığı için eşleşmiyor.
 *  3. Yalnız ürün adı — son çare. Renk bile düşüyor, çünkü bir mağazada o rengin
 *     hiç bulunmaması gerçek bir durum ve o noktada doğru cevap «bu mağazada
 *     beyaz yok» değil, «işte gömlekler».
 *
 * Aynı metne çıkan basamaklar eleniyor: betimleyicisi olmayan bir parçada üç
 * basamak da aynı olur ve üç arama yapmanın anlamı yok.
 */
export function relaxedQueries(parts: SearchQueryParts): string[] {
  const ladder = [
    buildSearchQuery(parts),
    buildSearchQuery({ ...parts, descriptors: undefined, attributes: undefined }),
    buildSearchQuery({
      ...parts,
      descriptors: undefined,
      attributes: undefined,
      colorHex: undefined,
      colorName: undefined,
      // Etiket bir cümle olabiliyor ("Yüksek yakalı ince örgü pastel pembe triko
      // ceket"); son basamakta ondan da vazgeçiliyor, geriye ürün adı kalıyor.
      label: undefined,
    }),
  ];

  const seen = new Set<string>();
  return ladder.filter((query) => {
    const trimmed = query.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    return true;
  });
}
