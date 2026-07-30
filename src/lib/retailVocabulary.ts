import { normalizeTr } from "@/lib/itemFamily";
import type { ItemFamily } from "@/lib/itemFamily";
import { familyOf } from "@/lib/itemFamily";

/**
 * Turkish retail vocabulary.
 *
 * Cloud Vision answers in English — "Outerwear", "Footwear", "High heels" — and
 * the products are on Turkish storefronts. Sending "Siyah Shorts" to Trendyol
 * ranks badly against "siyah şort", and three of Vision's most common garment
 * classes were faring worse than that: "Outerwear", "Footwear" and "Top" sat on
 * the noise list, so the query for a black jacket was the single word "Siyah".
 *
 * Two jobs here:
 *
 *  1. **Translate** a detector class or an English descriptor into the term a
 *     Turkish shopper types. Longest phrase first, because "High heels" is one
 *     product and "high" alone is nothing.
 *  2. **Reject** a live product row that cannot be what was detected — a child's
 *     coat for an adult look, a shoe-lace listing for a sneaker, a phone case for
 *     a bag. Storefront search returns these constantly, and the provider used to
 *     take whatever ranked first.
 *
 * Precision over coverage: a term is listed only where one Turkish word is
 * clearly the retail term. Anything genuinely ambiguous is left untranslated
 * rather than guessed at, because a wrong noun is worse than an English one — it
 * searches confidently for the wrong garment.
 */

/* -------------------------------------------------------------------------- */
/*  Garment and product nouns                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Multi-word terms, checked before single tokens.
 *
 * Keys are space-joined normalised tokens, so hyphenation and casing in the
 * source ("High-Heels", "high heels") both arrive here the same way.
 */
const PHRASES: Record<string, string> = {
  // Footwear
  "high heels": "topuklu ayakkabı",
  "high heel": "topuklu ayakkabı",
  "ankle boot": "bilekte bot",
  "ankle boots": "bilekte bot",
  "knee high boots": "çizme",
  "running shoes": "koşu ayakkabısı",
  "sports shoes": "spor ayakkabı",
  "athletic shoe": "spor ayakkabı",
  // Bags
  "shoulder bag": "omuz çantası",
  "cross body": "çapraz askılı çanta",
  "tote bag": "tote çanta",
  "luggage bags": "çanta",
  // Outerwear and tops
  "trench coat": "trençkot",
  "puffer jacket": "şişme mont",
  "denim jacket": "kot ceket",
  "leather jacket": "deri ceket",
  "biker jacket": "deri biker ceket",
  "bomber jacket": "bomber ceket",
  "polo shirt": "polo tişört",
  "button down": "düğmeli gömlek",
  "tank top": "atlet",
  "crop top": "crop bluz",
  "turtle neck": "balıkçı yaka",
  "mock neck": "yüksek yaka",
  "high neck": "yüksek yaka",
  "v neck": "v yaka",
  "long sleeve": "uzun kollu",
  "short sleeve": "kısa kollu",
  "zip up": "fermuarlı",
  // Bottoms
  "high waisted": "yüksek bel",
  "wide leg": "bol paça",
  "cargo pants": "kargo pantolon",
  "mini skirt": "mini etek",
  // Accessories
  "sun hat": "hasır şapka",
  "cowboy hat": "kovboy şapka",
  "baseball cap": "şapka",
  "hair clip": "toka",
  // Beauty
  "lip gloss": "dudak parlatıcısı",
  "lip balm": "dudak balmı",
  "lip liner": "dudak kalemi",
  "eye shadow": "göz farı",
  "eye liner": "eyeliner",
  "nail polish": "oje",
  "setting powder": "sabitleyici pudra",
  // Patterns
  "polka dot": "puantiyeli",
  "animal print": "hayvan desenli",
  "leopard print": "leopar desenli",
};

/**
 * Single tokens.
 *
 * **Only words Turkish retail does not already use.** Turkish e-commerce speaks a
 * lot of English natively — "sneaker", "blazer", "body", "crop", "oversize",
 * "jean", "loafer", "sweatshirt" are all live search terms on Trendyol — and
 * rewriting those is churn that *loses* precision: "spor ayakkabı" returns running
 * shoes, "sneaker" returns the lifestyle shoe that was actually detected. The eval
 * caught exactly that regression.
 *
 * So an entry belongs here when the source word is one a Turkish shopper would
 * never type ("footwear", "outerwear", "trousers", "trainers", "pumps"), when the
 * spelling differs ("espadrille" -> "espadril"), or when a plural or a phrase needs
 * normalising ("loafers" -> "loafer"). Identity mappings are left out — a word not
 * in the table already passes through unchanged.
 */
const TERMS: Record<string, string> = {
  // --- Footwear ---
  footwear: "ayakkabı",
  shoe: "ayakkabı",
  shoes: "ayakkabı",
  trainer: "spor ayakkabı",
  trainers: "spor ayakkabı",
  boot: "bot",
  boots: "bot",
  bootie: "bilekte bot",
  booties: "bilekte bot",
  heel: "topuklu ayakkabı",
  heels: "topuklu ayakkabı",
  pumps: "stiletto",
  sandal: "sandalet",
  sandals: "sandalet",
  loafers: "loafer",
  mules: "mule",
  slipper: "terlik",
  slippers: "terlik",
  espadrille: "espadril",

  // --- Bags ---
  bag: "çanta",
  bags: "çanta",
  handbag: "el çantası",
  clutch: "portföy çanta",
  tote: "tote çanta",
  backpack: "sırt çantası",
  crossbody: "çapraz askılı çanta",
  purse: "el çantası",
  satchel: "postacı çantası",
  shopper: "shopper çanta",

  // --- Outerwear ---
  // "Outerwear" is Vision's class for anything from a cardigan to a parka. No
  // Turkish shopper searches the category name ("dış giyim"); "ceket" is the term
  // that actually returns outerwear, and it beats dropping the token entirely.
  outerwear: "ceket",
  jacket: "ceket",
  jackets: "ceket",
  coat: "kaban",
  coats: "kaban",
  overcoat: "palto",
  trench: "trençkot",
  trenchcoat: "trençkot",
  cardigan: "hırka",
  vest: "yelek",
  waistcoat: "yelek",
  puffer: "şişme mont",
  poncho: "panço",

  // --- Tops ---
  // Vision's "Top" covers tees, blouses, bodysuits and tanks alike. "Bluz" is the
  // broadest Turkish women's-top retail term, and it was previously on the noise
  // list — so a detected top contributed nothing but its colour to the query.
  top: "bluz",
  tops: "bluz",
  shirt: "gömlek",
  shirts: "gömlek",
  blouse: "bluz",
  tshirt: "tişört",
  tee: "tişört",
  sweater: "kazak",
  jumper: "kazak",
  pullover: "kazak",
  hoodie: "kapüşonlu sweatshirt",
  knit: "triko",
  knitwear: "triko",
  tank: "atlet",
  camisole: "askılı bluz",
  bodysuit: "body",
  corset: "korse",
  bustier: "büstiyer",

  // --- Bottoms ---
  trouser: "pantolon",
  trousers: "pantolon",
  pant: "pantolon",
  pants: "pantolon",
  jeans: "jean",
  short: "şort",
  shorts: "şort",
  skirt: "etek",
  miniskirt: "mini etek",
  legging: "tayt",
  leggings: "tayt",
  chino: "chino pantolon",
  chinos: "chino pantolon",
  culottes: "kültür pantolon",
  joggers: "jogger",

  // --- One-piece ---
  dress: "elbise",
  dresses: "elbise",
  gown: "abiye elbise",
  jumpsuit: "tulum",
  romper: "tulum",
  playsuit: "tulum",

  // --- Accessories ---
  hat: "şapka",
  cap: "şapka",
  beanie: "bere",
  fedora: "fedora şapka",
  sunglasses: "güneş gözlüğü",
  glasses: "gözlük",
  eyewear: "gözlük",
  goggles: "gözlük",
  scarf: "fular",
  shawl: "şal",
  belt: "kemer",
  watch: "kol saati",
  necklace: "kolye",
  pendant: "kolye",
  choker: "choker kolye",
  earring: "küpe",
  earrings: "küpe",
  bracelet: "bileklik",
  bangle: "bileklik",
  anklet: "halhal",
  glove: "eldiven",
  gloves: "eldiven",
  sock: "çorap",
  socks: "çorap",
  jewelry: "takı",
  jewellery: "takı",
  tie: "kravat",
  suit: "takım elbise",
  swimwear: "mayo",
  brassiere: "sütyen",
  nightwear: "pijama",
  helmet: "kask",

  // --- Beauty ---
  lipstick: "ruj",
  gloss: "dudak parlatıcısı",
  balm: "dudak balmı",
  mascara: "maskara",
  eyeshadow: "göz farı",
  kohl: "kalem eyeliner",
  foundation: "fondöten",
  concealer: "kapatıcı",
  blush: "allık",
  highlighter: "aydınlatıcı",
  bronzer: "bronzlaştırıcı",
  contour: "kontür",
  primer: "makyaj bazı",
  powder: "pudra",

  // --- Materials ---
  leather: "deri",
  suede: "süet",
  wool: "yün",
  cotton: "pamuk",
  silk: "ipek",
  satin: "saten",
  linen: "keten",
  cashmere: "kaşmir",
  velvet: "kadife",
  corduroy: "fitilli kadife",
  tweed: "tüvit",
  lace: "dantel",
  chiffon: "şifon",
  sequin: "payetli",
  sequined: "payetli",

  // --- Patterns ---
  striped: "çizgili",
  stripe: "çizgili",
  plaid: "ekose",
  checked: "ekose",
  tartan: "ekose",
  floral: "çiçekli",
  leopard: "leopar desenli",
  zebra: "zebra desenli",
  paisley: "şal desenli",

  // --- Cut and detail ---
  oversized: "oversize",
  cropped: "crop",
  fitted: "dar kesim",
  slim: "slim fit",
  baggy: "bol kesim",
  pleated: "pileli",
  ruched: "büzgülü",
  belted: "kemerli",
  hooded: "kapüşonlu",
  zipped: "fermuarlı",
  zipper: "fermuarlı",
  buttoned: "düğmeli",
  sleeveless: "kolsuz",
  strapless: "straplez",
  turtleneck: "balıkçı yaka",
  pocket: "cepli",
  pockets: "cepli",
  quilted: "kapitone",
  distressed: "yırtık",
  matte: "mat",
  glossy: "parlak",
};

/** Longest phrase we bother looking for, in tokens. */
const MAX_PHRASE_TOKENS = 3;

/* -------------------------------------------------------------------------- */
/*  Materials                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turkish material words a retailer puts in a title.
 *
 * Used to tell whether a listing contradicts a detected material. Synonyms are
 * folded to one group below — "denim" and "kot" are the same cloth, and treating
 * them as different would invent a conflict on half the jeans in Turkey.
 */
export const TURKISH_MATERIALS = [
  "deri",
  "süet",
  "triko",
  "denim",
  "kot",
  "yün",
  "pamuk",
  "ipek",
  "saten",
  "keten",
  "kaşmir",
  "kadife",
  "tüvit",
  "dantel",
  "şifon",
  "polyester",
  "viskon",
  "örme",
  "jarse",
] as const;

/** Materials that are the same cloth under two names. */
const MATERIAL_GROUPS: Record<string, string> = {
  kot: "denim",
  denim: "denim",
  örme: "triko",
  triko: "triko",
  jarse: "örme-kumaş",
  süet: "deri",
  deri: "deri",
};

/** Canonical group for a material word, or the word itself. */
export function materialGroupOf(material: string): string {
  const key = normalizeTr(material);
  return MATERIAL_GROUPS[key] ?? key;
}

/** Word separator, matching the one `buildSearchQuery` uses. */
const SEPARATOR = /[^0-9A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü]+/;

function wordsOf(text: string): string[] {
  return text.split(SEPARATOR).filter(Boolean);
}

function tokensOf(text: string): string[] {
  return wordsOf(text).map(normalizeTr);
}

/**
 * Lookup keys for one word.
 *
 * Two, because Turkish lowering maps `I` to `ı`: an all-caps "SHIRT" folds to
 * "shırt" and would miss the table. Vision sends Title Case so the Turkish fold
 * is the right one for Turkish input, and the ASCII fold is the safety net for
 * shouty English.
 */
function keysFor(word: string): [string, string] {
  return [normalizeTr(word), word.toLowerCase()];
}

function lookup(table: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const hit = table[key];
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Rewrites recognised English retail terms into Turkish, leaving everything else
 * alone.
 *
 * Unmatched words are returned **exactly as they arrived**, casing included. A
 * made-up translation searches confidently for the wrong garment, while an
 * untranslated word is merely a weak query — and lower-casing the whole string
 * would rewrite the colour names the query is built to lead with. Turkish input
 * is unaffected: none of the keys are Turkish words.
 */
export function toTurkishRetailTerms(text: string): string {
  const words = wordsOf(text);
  const folded = words.map(normalizeTr);
  const out: string[] = [];

  let index = 0;
  while (index < words.length) {
    let matched = false;

    // Longest phrase first: "high heels" must not be read as "high" + "heels".
    for (let length = Math.min(MAX_PHRASE_TOKENS, words.length - index); length > 1; length -= 1) {
      const slice = words.slice(index, index + length);
      const replacement = lookup(PHRASES, [
        folded.slice(index, index + length).join(" "),
        slice.map((word) => word.toLowerCase()).join(" "),
      ]);

      if (replacement) {
        out.push(replacement);
        index += length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const word = words[index]!;
    out.push(lookup(TERMS, keysFor(word)) ?? word);
    index += 1;
  }

  return out.join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Disqualifying terms for live product rows                                 */
/* -------------------------------------------------------------------------- */

/**
 * Words that mean a listing is not the garment that was detected, whatever it
 * ranked at.
 *
 * These are the things Turkish storefront search returns alongside the real
 * thing: the children's version of the same garment, and accessories *for* the
 * product rather than the product. Both are common enough that taking the
 * top-ranked result without checking is how a scan ends up offering a toddler's
 * coat for an adult look.
 *
 * Stems, prefix-matched per token, so Turkish suffixes are covered.
 */
const UNIVERSAL_REJECTS = [
  // Not the wearer we detected.
  "çocuk",
  "bebek",
  "kids",
  "kid",
  "baby",
  "toddler",
  "infant",
  "junior",
  // Not a garment at all.
  "kılıf",
  "sticker",
  "poster",
  "oyuncak",
  "maket",
  "figür",
  "anahtarlık",
  "puzzle",
  // Spare parts, not the product.
  "yedek",
  "aparat",
  "askısı",
  "askılık",
];

/**
 * Multi-word rejects, matched against the whole normalised title.
 *
 * These have to be phrases because their first word is innocent on its own, and
 * a bare stem silently deletes real products. "Bakım" was one such stem, and the
 * catalogue's own "Renkli Dudak Bakım Balmı" — a lip balm, which is exactly what a
 * lip detection wants — was disqualified by it. Same trap for "temizleyici" (face
 * cleanser is a real beauty product) and "koruyucu" (so is sunscreen).
 */
const REJECT_PHRASES = [
  "bakım kremi",
  "bakım spreyi",
  "bakım seti",
  "temizleme fırçası",
  "temizleme köpüğü seti",
  "leke çıkarıcı",
  "koruyucu sprey",
  "kalıbı",
];

/**
 * Extra rejects that only make sense for one family.
 *
 * Kept narrow on purpose. "Askı" and "zincir" were here for bags and both had to
 * go: "Zincir Askılı Çanta" is a real bag style, and prefix-matching "askı" also
 * catches "askılı". A reject list that eats real products is worse than no reject
 * list, because the loss is silent.
 */
const FAMILY_REJECTS: Partial<Record<ItemFamily, string[]>> = {
  footwear: ["bağcık", "bağcığı", "tabanlık", "çekecek", "boyası", "cilası"],
  bag: ["organizer", "düzenleyic"],
  headwear: ["standı", "kutusu", "askısı"],
  accessory: ["standı", "kutusu", "tutucu"],
  lips: ["fırça", "sünger", "kalemtıraş", "çantası"],
  eyes: ["fırça", "sünger", "kalemtıraş", "çantası", "cımbız"],
  face: ["fırça", "sünger", "çantası"],
};

/**
 * Why this listing cannot be the detected item, or `null` if it might be.
 *
 * Two independent checks. The family check is the strong one: a title that
 * classifies as a different family than the detection is the wrong kind of
 * product, full stop. It is skipped when either side is `unknown`, because
 * "unknown" means the classifier had no opinion — not that it disagreed.
 */
export function rejectProductTitle(title: string, family: ItemFamily): string | null {
  const tokens = tokensOf(title);
  if (tokens.length === 0) return "boş başlık";

  const joined = tokens.join(" ");
  const phrase = REJECT_PHRASES.find((entry) => joined.includes(entry));
  if (phrase) return `«${phrase}» bu tespit için diskalifiye`;

  const rejects = [...UNIVERSAL_REJECTS, ...(FAMILY_REJECTS[family] ?? [])];

  for (const token of tokens) {
    const hit = rejects.find((stem) => token.startsWith(stem));
    if (hit) return `«${token}» bu tespit için diskalifiye`;
  }

  const titleFamily = familyOf(title);
  if (family !== "unknown" && titleFamily !== "unknown" && titleFamily !== family) {
    return `başlık ${titleFamily} ailesinde, tespit ${family}`;
  }

  return null;
}
