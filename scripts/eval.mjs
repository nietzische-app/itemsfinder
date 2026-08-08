/**
 * Detection accuracy eval.
 *
 * Scores the parts of the pipeline that can be measured without calling Google
 * Vision, plus — when fixtures are present — the detection cleanup against real
 * recorded Vision responses.
 *
 *   npm run eval              offline: colour, family, query
 *   npm run eval -- --verbose per-item detail
 *   npm run eval -- --floors  paste-ready FLOORS block for the current set
 *
 * Recording fixtures needs a Vision key and is a separate step:
 *
 *   npm run eval:record
 *
 * which writes `eval/fixtures/<exampleId>.json`. Fixtures are replayed offline
 * afterwards, so the detection scores stay reproducible and free.
 *
 * Exit code is non-zero when any metric falls below its floor, so this can gate
 * a change the way the type checker does.
 */
import { register } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import sharp from "sharp";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const VERBOSE = process.argv.includes("--verbose");
const ROOT = new URL("..", import.meta.url).pathname;

const { familyOf } = await import("@/lib/itemFamily");
const { buildSearchQuery, colorNameFromHex, relaxedQueries } = await import("@/lib/searchQuery");
const { regionDominantColor, imageSize } = await import("@/services/regionColor");
const { learnBackdrop, foregroundFilter } = await import("@/services/foreground");
const {
  dedupeDetections,
  bodyPosition,
  familyFitsBody,
  iou,
} = await import("@/lib/detectionFilter");
const { attributeSearchQuery } = await import("@/lib/searchQuery");
const { groundTruth, HARD_COLOR_ITEMS } = await import("../eval/groundTruth.ts");
const { replayVisionFixture } = await import("../eval/replay.ts");
const { matchBoxes, bestOverlaps, median, fractionAtLeast } = await import(
  "../eval/boxMatch.ts"
);
const { materialVerdict, patternVerdict, tally, containsToken } = await import(
  "../eval/attributeScore.ts"
);
const { colorBucketOf } = await import("../eval/colorBucket.ts");
const { isDirectProductUrl } = await import("@/lib/productUrl");
const { PDP_URLS, LISTING_URLS } = await import("../eval/productUrlCases.ts");
const { extractImage } = await import("./fetch-images.mjs");
const { OG_IMAGE_CASES } = await import("../eval/ogImageCases.ts");
const { MOCK_SCENARIOS, hydrateProduct } = await import("@/services/mockCatalog");
const { merchantLabel, merchantHost } = await import("@/services/merchantSearch");
const { priceIsShowable } = await import("@/utils/affiliate");
const { findProductsForLabel } = await import("@/services/mockCatalog");
const { COVERAGE_CASES, KNOWN_GAPS, VISION_CLASSES, GENERIC_VISION_CLASSES } = await import(
  "../eval/coverageCases.ts"
);
const { SEARCH_QUERY_CASES } = await import("../eval/searchQueryCases.ts");
const { PRODUCT_MARKUP_CASES } = await import("../eval/productMarkupCases.ts");
const { extractProductMarkup } = await import("@/lib/productMarkup");
const { toTurkishRetailTerms } = await import("@/lib/retailVocabulary");

/**
 * Metric floors: set just under the measured baseline so a regression trips the
 * run, not so high that the run is aspirational and permanently red.
 *
 * Colour sat at 0.70 for as long as four of the fourteen items were a documented
 * class of failure rather than a bug to tune away: lc-beanie, lc-jeans, lc-sandals
 * and bb-heels are all cases where the garment is a *minority of its own bounding
 * box* — thin sandal straps framing a grey floor, a small beanie against a studio
 * wall, a heel against a white backdrop — so the modal colour was the background.
 * Three things were measured against this set and rejected: a larger sampling inset
 * (worse), background-colour rejection (worse — it discards the garment when
 * garment and backdrop are both dark), and a dominance abstention threshold (cost
 * two correct answers, recovered none).
 *
 * `services/foreground.ts` recovered two of the four by removing what a rectangle
 * cannot: a backdrop learned from pixels outside every box, and skin. 10/14 -> 12/14
 * with nothing broken, so the floor moves to 0.80 — under the new measurement, above
 * the old one, which is what a floor is for.
 *
 * `lc-jeans` and `bb-heels` are still wrong and are still the same class of problem:
 * ripped denim showing more leg than cloth, and straps thin enough that almost every
 * pixel of them is an edge blend. Colour statistics over a region have nothing left
 * to give there — those need a real per-pixel mask (ROADMAP 2.1, the SAM option) or
 * the model's own reading of the crop (1.3).
 */
const FLOORS = {
  /*
   * Re-derived when the set grew from 4 photographs to 15 (`docs/ROADMAP.md` 1.1).
   *
   * 30/37 measured. The seven misses are three known classes and nothing new:
   * denim in shadow measuring dark (lc-jeans, cf-jeans), an item so thin its box is
   * mostly what is behind it (bb-heels, bo-sunglasses), and near-neutrals a person
   * and a histogram can legitimately name differently (nf-top, ls-shirt).
   *
   * The seventh, `fd-dress`, is a finding the small set could not have produced: a
   * cream dress photographed against sunlit dry grass shares quantised colours with
   * its own background, so the backdrop model removes the garment. The palette gate
   * in `foreground.ts` guards against a *scene* being mistaken for a backdrop; it
   * has nothing to say about a garment that matches the backdrop it is standing in
   * front of. Documented rather than patched — one item is not enough to design a
   * guard against, and a guard designed on one item is a guess.
   *
   * Raised to 0.78 at 31 photographs / 74 items. 59/73 measured — the set nearly
   * doubled and the score went *up*, because the new photographs found a rule that
   * was wrong rather than a case that was hard: HSL saturation is unreliable at
   * both ends of the lightness range, not just the top, so a white tee in shade and
   * a near-black skirt both came out blue. `NO_HUE` in `colorFamily.ts` covers both
   * ends now. The floor moves under the new measurement and above the old one,
   * which is the only reason to move a floor.
   */
  color: 0.78,
  query: 0.9,
  /*
   * Ürün adı, merdivenin her basamağında sorgunun içinde ve sonunda.
   *
   * 1.0, çünkü burada indirilebilecek bir pay yok: bu bir doğruluk sınırı değil,
   * bir kurulum hatası. Sorgunun içinde aranan ürün yoksa mağazadan gelen her
   * satır zaten yanlış — kaç tanesinin doğru olduğu sorusu anlamsız. Bir kaçak,
   * ölçülemeyen bir zorluk değil düzeltilecek bir kusur.
   */
  queryNoun: 1,
  /*
   * Ürün işaretlemesi okuma. %100, çünkü buradaki her vaka schema.org'da tanımlı
   * bir şekil — kaçırılan bir şekil, ölçülemeyen bir zorluk değil, desteklenmeyen
   * bir biçim. Yani düzeltilecek bir kusur.
   */
  productMarkup: 1,
  /*
   * The coarse-class path. Set to 1.0 because unlike colour there is nothing
   * irreducible here: every class Vision emits either has a Turkish retail term
   * or should not be in the ground truth. A miss is a missing table entry, which
   * is a fix, not a limitation.
   */
  visionQuery: 1,
  /*
   * Descriptor retrieval, measured at 86% (12/14) against a chance rate of 7%.
   *
   * The floor sits below that because the two misses are the descriptor's real
   * limit, not a tuning gap: `bk-body` (a black bodysuit) loses to `bk-jeans` (dark
   * denim in the same photo, same light), and `bk-sunglasses` — a crop that is
   * mostly face — loses to `lc-coat`. A colour histogram plus 64 bits of structure
   * has nothing left to distinguish those with; separating them needs semantics,
   * which means a learned embedding.
   *
   * **This test is easier than the job.** Both crops come from the same photograph
   * under the same light, so 86% here does not predict 86% against real studio
   * product shots. Its value is regression detection: the number was a trivial 100%
   * until the loose crop was mirrored and re-exposed, which would have stayed green
   * straight through a broken descriptor.
   */
  /*
   * Re-derived for the larger set, and *lowered on purpose*.
   *
   * The task got harder, not the code worse. Each tight crop now has to pick its
   * own loose crop out of 37 candidates instead of 14, so chance fell from 7% to
   * 2.7% and every near-miss has more ways to go wrong. 62% against 2.7% is a
   * stronger result than 86% against 7% was — roughly 23 times chance instead of
   * 12 — and reading the two percentages side by side without that context would
   * be reading a harder exam as a worse student.
   *
   * Lowered again for the same reason at 74 items: 50% against a 1.4% chance rate,
   * which is about 37 times chance where the 53-item run was 33 and the 37-item run
   * 23. Every growth of the set makes this number fall and the result behind it
   * improve, so the percentage on its own is not readable — the ratio to chance is
   * printed next to it for exactly that reason.
   */
  visualRetrieval: 0.45,
  family: 0.9,
  /*
   * Ürün kapsamı — sıradan bir parçanın boş ekran görmemesi.
   *
   * 47/51 ölçüldü. Kaçan dördü tek bir sebep: katalogda `dress` ailesinde **hiç**
   * satır yok, yani elbise, tulum, mayo ve bikini tespit edilse bile gösterilecek
   * bir ürün bulunamıyor. Sözlük tarafı bu turda kapatıldı (yaygın yetmiş yedi
   * kelimenin tanınmayanı %25'ten %6'ya indi); kalan boşluk veri tarafında.
   *
   * Elbise satırları eklendi ve ölçüm 51/51'e çıktı, yani taban 1.0 oldu.
   *
   * Diğer «taban %100» metrikleri gibi burada da pazarlık payı yok, ve sebebi
   * aynı: bir parça ya bir ürün döndürüyor ya döndürmüyor, arada yorum yok. Yeni
   * bir ürün türü desteklenmeye başladığında `eval/coverageCases.ts`'e bir satır
   * eklemek, desteğin geri gitmemesini sağlıyor — ve o satır ilk gün kırmızı
   * olacaksa, kapsamın gerçekten büyümesi gerektiği anlamına geliyor.
   */
  coverage: 1,
  hotspotCount: 0.75,
  /*
   * Box accuracy. No floor yet — nothing has ever measured this, so any number
   * put here would be a guess dressed as a gate. It is reported and left ungated
   * until the first recorded run says what the detector actually does; the value
   * to set it just under is the one that run prints.
   *
   * `boxRecall` is the fraction of labelled garments a detection actually claimed
   * at IoU >= 0.5, matched one-to-one. `boxIou` is the median overlap on the ones
   * it did claim — "how well framed", separate from "how many found".
   */
  boxRecall: null,
  boxIou: null,
  /*
   * How many of the four background-dominated items the attribute stage has to
   * recover to be worth its API call.
   *
   * Unlike the box floors above, this is not a guess about an unmeasured quantity
   * — it is the stage's stated purpose. `lc-beanie`, `lc-jeans`, `lc-sandals` and
   * `bb-heels` are the items whose bounding box is mostly backdrop, three
   * different thresholds were measured against them and rejected, and "look at the
   * crop instead" was the remaining idea. If looking at the crop fixes fewer than
   * three of them, the stage costs a call per item and buys something else; that
   * is a decision to reopen, and it should arrive as a red run rather than as a
   * paragraph in a document.
   *
   * Only judged when the recording covers all four. A partial run says nothing.
   */
  vlmHardColors: 3,
  /*
   * Rate of asserted attributes the photograph contradicts.
   *
   * Reported, ungated, for the same reason as the box floors: nothing has measured
   * it, so any number here would be a guess wearing a gate's clothes. It is the
   * metric to watch, though — an abstention costs nothing, while a wrong material
   * carries `MATERIAL_CONFLICT` and pushes correct products down the ranking. Set
   * this just above whatever the first real recording prints.
   */
  vlmHallucination: null,
};

/** Overlap at which a detection counts as having found a garment. */
const IOU_MATCH = 0.5;

const cases = groundTruth(familyOf);
const pct = (n, d) => (d === 0 ? 0 : n / d);
const fmt = (v) => `${(v * 100).toFixed(0)}%`;

/* -------------------------------------------------------------------------- */
/*  1. Per-region colour                                                      */
/* -------------------------------------------------------------------------- */

let colorHits = 0;
let colorTotal = 0;
/**
 * Items with no colour to grade — prints, whose ground colour nobody could name.
 *
 * Counted and printed rather than silently dropped. A denominator that quietly
 * shrinks is how a score improves without the pipeline changing, and the number of
 * items the eval declines to grade is itself something a reader should see.
 */
let colorUngraded = 0;
const colorMisses = [];
/** Per-item outcome, so the VLM section can be scored on the same items. */
const regionHitById = new Map();
/** Whether the backdrop model engaged per look, and how tight the palette was. */
const backdropDetail = [];

for (const testCase of cases) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) {
    console.log(`  ! görsel yok, atlanıyor: ${testCase.image}`);
    continue;
  }

  const buffer = readFileSync(path);
  const size = await imageSize(buffer);

  /*
   * Foreground separation, set up exactly as the pipeline does it.
   *
   * The person box is Vision's in production and is not available offline, so the
   * union of the labelled boxes stands in. That union can only be larger than the
   * person, never smaller, so it can only shrink the area the backdrop is learned
   * from — the conservative direction. It cannot let skin in and call it scenery.
   */
  const boxes = testCase.items.map((item) => item.box);
  const personBox = {
    x: Math.min(...boxes.map((box) => box.x)),
    y: Math.min(...boxes.map((box) => box.y)),
    width:
      Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x)),
    height:
      Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y)),
  };
  const backdrop = await learnBackdrop(buffer, { size, boxes: [...boxes, personBox] });
  const foreground = foregroundFilter(backdrop);

  backdropDetail.push({
    exampleId: testCase.exampleId,
    palette: backdrop?.paletteSize ?? null,
    buckets: backdrop?.buckets.size ?? 0,
  });

  for (const item of testCase.items) {
    // Occluders: the other labelled regions that overlap this one, exactly as
    // the pipeline supplies them.
    const exclude = testCase.items
      .filter((other) => other.id !== item.id)
      .map((other) => other.box);

    const hex = await regionDominantColor(buffer, item.box, { size, exclude, foreground });
    const bucket = hex ? colorBucketOf(hex) : null;

    if (item.color === null) {
      colorUngraded += 1;
      // `hit: null` rather than `false`: the VLM subset baseline must not treat an
      // unasked question as a region-colour failure.
      regionHitById.set(item.id, { hit: null, bucket, hex });
      continue;
    }

    colorTotal += 1;
    regionHitById.set(item.id, { hit: bucket === item.color, bucket, hex });

    if (bucket === item.color) {
      colorHits += 1;
      if (VERBOSE) {
        console.log(`    ✓ ${item.id.padEnd(16)} ${hex} ${bucket} (${colorNameFromHex(hex)})`);
      }
    } else {
      colorMisses.push({ id: item.id, want: item.color, got: bucket, hex });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  2. Query tokens                                                           */
/* -------------------------------------------------------------------------- */

let queryHits = 0;
let queryTotal = 0;
const queryMisses = [];

for (const testCase of cases) {
  for (const item of testCase.items) {
    // The query the pipeline would build from what it detected.
    const query = buildSearchQuery({
      itemType: item.itemType,
      label: item.label,
      colorHex: "#000000",
    });
    queryTotal += 1;

    /*
     * `containsToken`, not `includes`. Turkish softens a final consonant under a
     * vowel-initial suffix, so "Güneş Gözlüğü" does not contain "gözlük" as a
     * substring — and this metric scored a perfect query as a miss the moment a
     * photograph with sunglasses entered the set. The attribute scorer already had
     * the fix; this call site was left on the naive comparison.
     */
    if (containsToken(query, item.queryToken)) {
      queryHits += 1;
      if (VERBOSE) console.log(`    ✓ ${item.id.padEnd(16)} "${query}"`);
    } else {
      queryMisses.push({ id: item.id, want: item.queryToken, query });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  2a. Ürün adı merdivenin her basamağında duruyor mu                        */
/* -------------------------------------------------------------------------- */

/*
 * «İçinde ürün olmayan sorgu» — ölçülmüş bir hataydı, tahmin değil.
 *
 * `buildSearchQuery` ürün adına yer ayırıyor, ama ayırma `seen` kümesini
 * paylaştığı için ad **daha önce geçmişse** hiç ayrılmıyordu: etikette zaten
 * «ceket» geçen bir parçada isim dizisi boş kalıyor, kesme sınırı adı etiketin
 * içinden kesip atıyordu.
 *
 *   etiket «Yüksek yakalı ince örgü pastel pembe triko ceket», ürün adı «Ceket»
 *   → «Pudra Pembe Yüksek yakalı ince örgü»
 *
 * O sorgu bir mağazada ne bulur belli değil ama aradığımız şeyi bulmaz. Mevcut
 * «Sorgu token'ı» metriği bunu görmüyordu çünkü tek bir basamağa ve elle
 * seçilmiş bir token'a bakıyor; buradaki kapı **her basamağa** ve parçanın kendi
 * adına bakıyor.
 *
 * İki ayrı iddia ölçülüyor: ad sorgunun içinde mi (doğruluk), ve sorgu adla mı
 * bitiyor (Türkçe'de sıfat isimden önce gelir, mağaza sıralaması da sondaki
 * ismi ürün sanır).
 */
let nounHits = 0;
let nounTotal = 0;
const nounMisses = [];

/*
 * İki kaynak, ve ikincisi olmadan kapı ısırmıyor.
 *
 * Referans setinin 74 parçası sorguyu yalnızca **ad + etiket + renk**'ten kuruyor,
 * çünkü öznitelik satırı modelin ürettiği bir metin ve referansta yok. Oysa kusur
 * tam olarak öznitelik satırı doluyken çıkıyordu. Yalnız referansla ölçseydim
 * metrik %100 yazardı ve hiçbir şey kanıtlamazdı — bu projede yeşil ama boş bir
 * ölçüm, ölçüm yokluğundan kötü. `SEARCH_QUERY_CASES` eksik girdi şekillerini
 * getiriyor ve kurgu oldukları kendi dosyasında yazılı.
 */
const nounSources = [
  ...cases.flatMap((testCase) =>
    testCase.items.map((item) => ({
      id: item.id,
      parts: { itemType: item.itemType, label: item.label, colorHex: "#000000" },
    })),
  ),
  ...SEARCH_QUERY_CASES.map((entry) => ({
    id: entry.name,
    parts: {
      itemType: entry.itemType,
      label: entry.label,
      colorName: entry.colorName,
      colorHex: entry.colorHex,
      attributes: entry.attributes,
    },
  })),
];

for (const source of nounSources) {
  // Parçanın kendi adının son sözcüğü: «Güneş Gözlüğü» için «Gözlüğü».
  const want = source.parts.itemType.trim().split(/\s+/).filter(Boolean).at(-1);
  if (!want) continue;

  for (const [rung, query] of relaxedQueries(source.parts).entries()) {
    nounTotal += 1;

    /*
     * Ölçülen iddia «ad sorguda kalıyor mu», «sorgu adla bitiyor mu» değil.
     * İkincisini de ölçmeyi denedim ve ölçüm reddetti: ürün adı «Triko», etiket
     * «Bej Triko Kazak» olan bir parçada adı sona çekmek «Bej Kazak … Triko»
     * üretiyor — Türkçe'de sıfat isimden önce geldiği için bu düzeltmek değil
     * bozmak. Gerekçe `eval/searchQueryCases.ts` ve `searchQuery.ts` içinde.
     */
    if (containsToken(query, want)) {
      nounHits += 1;
    } else {
      nounMisses.push({ id: source.id, rung, want, query, why: "ad sorguda yok" });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  2c. Ürün işaretlemesi — sayfayı modele okutmadan okuyabiliyor muyuz       */
/* -------------------------------------------------------------------------- */

/*
 * `web.extract` boru hattındaki en pahalı ve tek satıcıya bağlı adım: sayfayı bir
 * modele okutuyor, ve kredi bitince ürün araması tamamen duruyor. Oysa mağazalar
 * fiyatı, stoğu ve puanı ürün sayfasına schema.org işaretlemesiyle zaten yazıyor.
 *
 * Bu satır o ayrıştırıcıyı ölçüyor. Vakalar **standarttan** kuruldu, bir mağazadan
 * kopyalanmadı — yani ölçtüğü şey «standarda uyuyor mu», «Trendyol'u okuyabiliyor
 * mu» değil. İkincisi ancak ağı açık bir makinede ölçülebilir ve o ölçüm yapılana
 * kadar bu yol açılmamalı.
 */
let markupHits = 0;
const markupMisses = [];

for (const testCase of PRODUCT_MARKUP_CASES) {
  const got = extractProductMarkup(testCase.html, testCase.pageUrl);

  if (testCase.expect === null) {
    if (got === null) markupHits += 1;
    else markupMisses.push(`${testCase.name}: null bekleniyordu`);
    continue;
  }

  if (!got) {
    markupMisses.push(`${testCase.name}: hiç okunamadı`);
    continue;
  }

  const wrong = Object.entries(testCase.expect).filter(([key, want]) => got[key] !== want);
  if (wrong.length === 0) markupHits += 1;
  else {
    markupMisses.push(
      `${testCase.name}: ` +
        wrong.map(([key, want]) => `${key} ${JSON.stringify(got[key])} ≠ ${JSON.stringify(want)}`).join(", "),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  2b. Turkish query from the coarse detector class alone                     */
/* -------------------------------------------------------------------------- */

/*
 * The metric above is fed the hand-written Turkish label, so it has always
 * reported 100% — while the *default* path (no VLM key, no web entity) had only
 * Vision's English class to work with and was sending "Siyah Shorts" to Turkish
 * storefronts. For "Outerwear", "Footwear" and "Top" it sent nothing but the
 * colour, because those sat on the noise list.
 *
 * Scored against `visionToken`, which is deliberately the coarse answer: Vision
 * says "Footwear", not "sneaker", and no vocabulary table recovers a detail the
 * detector never saw.
 */
/**
 * The coarse-path query for one item, and whether it works.
 *
 * A function rather than inline code because the VLM section below needs the same
 * answer on its own subset of items: "the model's query is 93% accurate" means
 * nothing without "and the path it replaces was 57% on those same items".
 */
function visionQueryOutcome(item) {
  const query = buildSearchQuery({ itemType: item.visionClass, colorHex: "#111111" });
  const lower = query.toLocaleLowerCase("tr");

  // Two conditions, both required: the Turkish term has to be there, and the
  // English class must be gone. A query carrying both would score as a pass
  // while still shipping an English word to a Turkish search box.
  const hasTurkish = containsToken(query, item.visionToken);
  const englishLeft = item.visionClass
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .some((word) => lower.includes(word) && !item.visionToken.toLowerCase().includes(word));

  return {
    query,
    ok: hasTurkish && !englishLeft,
    note: englishLeft ? "İngilizce kelime kaldı" : "Türkçe terim yok",
  };
}

let visionQueryHits = 0;
let visionQueryTotal = 0;
const visionQueryMisses = [];
/** Per-item outcome, so the VLM arm can be compared like for like. */
const visionQueryById = new Map();

for (const testCase of cases) {
  for (const item of testCase.items) {
    visionQueryTotal += 1;

    const outcome = visionQueryOutcome(item);
    visionQueryById.set(item.id, outcome.ok);

    if (outcome.ok) {
      visionQueryHits += 1;
      if (VERBOSE) {
        console.log(`    ✓ ${item.id.padEnd(16)} ${item.visionClass} -> "${outcome.query}"`);
      }
    } else {
      visionQueryMisses.push({
        id: item.id,
        want: item.visionToken,
        query: outcome.query,
        note: outcome.note,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  2c. VLM attributes, replayed from fixtures                                */
/* -------------------------------------------------------------------------- */

/*
 * Does looking at the crop beat measuring the box?
 *
 * The measured colour above describes a *rectangle*; these describe the garment
 * inside it. The four standing colour failures are all cases where those are not
 * the same thing — which is the entire argument for spending an API call per item.
 * This section is where that argument gets a number.
 *
 * Four questions, in increasing order of how much they matter:
 *
 *   colour   — the bucket, against the same labels the measured colour is scored on
 *   noun     — the garment word the query is built around
 *   query    — the whole query, built by the *shipped* assembly, against the
 *              specific token; compared against the coarse path on the same items
 *   claims   — material and pattern, scored three ways, because a hallucinated
 *              material is not a neutral miss: it carries a negative weight in
 *              `scoreTitleAgreement` and demotes correct products
 *
 * It sits after the coarse arm because it needs it as a baseline. No fixtures
 * means the stage has never been recorded; the section stays silent rather than
 * reporting a zero that would read as a regression.
 */
const attrDir = `${ROOT}eval/fixtures/attrs`;
const attrFixtures = existsSync(attrDir)
  ? readdirSync(attrDir).filter((name) => name.endsWith(".json"))
  : [];

/**
 * Reads a recording into `id -> samples[]`.
 *
 * The current recorder writes `{ items: { id: { samples: [...] } } }`; a flat
 * `id -> attributes` map was the earlier shape and is still accepted, so an
 * existing fixture directory keeps working instead of silently scoring zero.
 */
function readAttrFixture(raw) {
  if (raw && typeof raw === "object" && raw.items) {
    return {
      repeat: raw.repeat ?? 1,
      samples: new Map(
        Object.entries(raw.items).map(([id, entry]) => [id, entry?.samples ?? []]),
      ),
    };
  }
  return {
    repeat: 1,
    samples: new Map(Object.entries(raw ?? {}).map(([id, attrs]) => [id, [attrs ?? null]])),
  };
}

let vlmColorHits = 0;
/** Recorded items whose colour is graded — prints are described but not scored. */
let vlmColorTotal = 0;
/** Every recorded item, which is what the noun and query metrics are asked about. */
let vlmItemTotal = 0;
let vlmDescribed = 0;
let vlmNounHits = 0;
let vlmQueryHits = 0;
/**
 * Baselines on exactly the items the VLM was recorded for.
 *
 * The overall region score covers all fourteen items; fixtures may cover four.
 * Comparing 3/4 against 10/14 would be comparing two different questions, and the
 * gates below are only meaningful on a like-for-like subset.
 */
let regionHitsOnVlmItems = 0;
let visionQueryHitsOnVlmItems = 0;
const vlmColorMisses = [];
const vlmNounMisses = [];
const vlmQueryMisses = [];
const materialVerdicts = [];
const patternVerdicts = [];
/** Asserted attributes the photograph contradicts — the expensive kind of error. */
const attributeLapses = [];
/** id -> did the model's colour land on the right bucket, for the hard four. */
const hardOutcome = new Map();
let repeatRounds = 1;
let stabilityItems = 0;
let stabilityColorAgreed = 0;
let stabilityTokenAgreed = 0;

for (const name of attrFixtures) {
  const exampleId = name.replace(/\.json$/, "");
  const truth = cases.find((entry) => entry.exampleId === exampleId);
  if (!truth) continue;

  const recorded = readAttrFixture(JSON.parse(readFileSync(`${attrDir}/${name}`, "utf8")));
  repeatRounds = Math.max(repeatRounds, recorded.repeat);

  for (const item of truth.items) {
    vlmItemTotal += 1;
    if (item.color !== null) {
      vlmColorTotal += 1;
      if (regionHitById.get(item.id)?.hit) regionHitsOnVlmItems += 1;
    }
    if (visionQueryById.get(item.id)) visionQueryHitsOnVlmItems += 1;

    const samples = recorded.samples.get(item.id) ?? [];
    // Production makes one call. Scoring a majority vote across repeats would
    // report an accuracy no user ever receives; the repeats are for the agreement
    // measure below, not for a better answer.
    const attrs = samples[0] ?? null;

    /*
     * A declined item is not a zero — it is a fallback.
     *
     * With the stage on and the model refusing, the pipeline keeps the measured
     * colour and builds the query from Vision's class, which is exactly the
     * without-the-stage behaviour. Scoring the refusal as a flat miss would model
     * something the code does not do and would understate the stage; scoring it as
     * absent would drop the item from the denominator and overstate it. Both
     * headline numbers are therefore "what the shopper ends up with, stage on",
     * which is the only comparison the API call can be judged by.
     *
     * The cost of a refusal is real — a call spent for no gain — and it is
     * reported separately as the described count, not smuggled into the accuracy.
     */
    if (!attrs) {
      const fellBackToRegion = regionHitById.get(item.id)?.hit ?? false;
      const fellBackToVision = visionQueryById.get(item.id) ?? false;

      if (item.color === null) {
        // Nothing to inherit — the colour was never being graded on this item.
      } else if (fellBackToRegion) vlmColorHits += 1;
      else vlmColorMisses.push({ id: item.id, want: item.color, got: "betimlenmedi, ölçülene düşüldü" });

      if (fellBackToVision) vlmQueryHits += 1;
      else vlmQueryMisses.push({ id: item.id, want: item.queryToken, query: "betimlenmedi, Vision sınıfına düşüldü" });

      // The noun metric asks what the *model* named, so a refusal is a miss there
      // with no fallback to inherit: Vision's class is not a garment noun.
      vlmNounMisses.push({ id: item.id, want: item.queryToken, got: "betimlenmedi" });
      if (HARD_COLOR_ITEMS.includes(item.id)) hardOutcome.set(item.id, fellBackToRegion);
      continue;
    }

    vlmDescribed += 1;

    // --- colour -----------------------------------------------------------
    const bucket = colorBucketOf(attrs.colorHex);
    const colorOk = item.color !== null && bucket === item.color;
    if (HARD_COLOR_ITEMS.includes(item.id)) hardOutcome.set(item.id, colorOk);

    if (item.color === null) {
      // Ungraded: a print has no ground colour, so whatever the model named for it
      // is neither right nor wrong and belongs in no denominator.
    } else if (colorOk) {
      vlmColorHits += 1;
      if (VERBOSE) {
        console.log(
          `    ✓ ${item.id.padEnd(16)} ${attrs.colorHex} ${bucket} («${attrs.colorName}» ${attrs.garmentType})`,
        );
      }
    } else {
      vlmColorMisses.push({ id: item.id, want: item.color, got: bucket, hex: attrs.colorHex });
    }

    // --- garment noun -----------------------------------------------------
    if (containsToken(String(attrs.garmentType ?? ""), item.queryToken)) {
      vlmNounHits += 1;
    } else {
      vlmNounMisses.push({ id: item.id, want: item.queryToken, got: attrs.garmentType });
    }

    // --- the whole query, as the pipeline assembles it ---------------------
    // Built by the shipped function, not by a copy of it here: a metric that
    // measures its own re-implementation reports on code nobody runs.
    const query = attributeSearchQuery(attrs);
    if (containsToken(query, item.queryToken)) {
      vlmQueryHits += 1;
      if (VERBOSE) console.log(`    ✓ ${item.id.padEnd(16)} -> "${query}"`);
    } else {
      vlmQueryMisses.push({ id: item.id, want: item.queryToken, query });
    }

    // --- asserted attributes ----------------------------------------------
    const material = materialVerdict(item.material, attrs.material);
    const pattern = patternVerdict(item.pattern, attrs.pattern);
    materialVerdicts.push(material);
    patternVerdicts.push(pattern);

    if (material === "wrong") {
      attributeLapses.push({ id: item.id, field: "malzeme", want: item.material, got: attrs.material });
    }
    if (pattern === "wrong") {
      attributeLapses.push({ id: item.id, field: "desen", want: item.pattern, got: attrs.pattern });
    }

    // --- agreement across repeats -----------------------------------------
    /*
     * Not accuracy — consistency. A model that answers "pembe" on one draw and
     * "bej" on the next is unreliable in a way a single recording cannot show, and
     * on fourteen items one unlucky draw moves the headline score by seven points.
     * Worth knowing before anyone reads the score as settled.
     */
    if (samples.length > 1) {
      stabilityItems += 1;
      const buckets = new Set(samples.map((sample) => (sample ? colorBucketOf(sample.colorHex) : null)));
      const tokens = new Set(
        samples.map((sample) => (sample ? containsToken(attributeSearchQuery(sample), item.queryToken) : null)),
      );
      if (buckets.size === 1) stabilityColorAgreed += 1;
      if (tokens.size === 1) stabilityTokenAgreed += 1;
    }
  }
}

const materialTally = tally(materialVerdicts);
const patternTally = tally(patternVerdicts);
/** Hard items the recording actually covered — a partial run cannot be judged. */
const hardCovered = HARD_COLOR_ITEMS.filter((id) => hardOutcome.has(id));
const hardRecovered = hardCovered.filter((id) => hardOutcome.get(id));

/* -------------------------------------------------------------------------- */
/*  2c. Visual descriptor retrieval                                            */
/* -------------------------------------------------------------------------- */

/*
 * Can the visual descriptor actually find the right garment?
 *
 * There are no product photographs to retrieve against — the catalogue ships
 * generated SVG thumbnails, and the live feed is not running here. So the test is
 * built out of the images that do exist: every labelled region is cropped twice, at
 * a tight padding and a loose one, which is a fair analogue of the real job (the
 * same garment framed differently, against more or less background). For each tight
 * crop, the nearest loose crop among **all fourteen** must be its own.
 *
 * Chance is 1/14, so this is a real test rather than a formality — and it is the
 * thing that would catch a descriptor broken by a refactor, which a smoke check on
 * one image pair would not.
 */
const { describeImage, visualSimilarity } = await import("@/services/visualDescriptor");
const { cropRegion } = await import("@/services/imageCrop");

const tight = [];
const loose = [];

for (const testCase of cases) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) continue;

  const buffer = readFileSync(path);
  const size = await imageSize(buffer);

  for (const item of testCase.items) {
    // The pipeline masks the neighbouring garments out of the crop, so the eval has
    // to as well — measuring an unmasked crop would be scoring code that does not
    // run. It is also worth a lot here: unmasked, the shorts crop on the reference
    // photo is 69% pink cardigan.
    const occluders = testCase.items
      .filter((other) => other.id !== item.id)
      .map((other) => other.box);

    for (const [padding, into] of [
      [0.02, tight],
      [0.16, loose],
    ]) {
      const crop = await cropRegion(buffer, item.box, { size, padding, exclude: occluders });
      if (!crop) continue;

      let bytes = Buffer.from(crop.base64, "base64");

      /*
       * The loose crop is mirrored and re-exposed before it is described. Without
       * that the two crops share most of their pixels and retrieval is trivially
       * 100% — a number that would keep reading as green through a broken
       * descriptor. Mirroring and a brightness shift are the two things that
       * genuinely differ between a studio product shot and a photo of someone
       * wearing the garment, and they hit the two halves of the descriptor
       * differently: the histogram is exactly mirror-invariant, the difference hash
       * is not, while the hash tolerates exposure and the histogram less so.
       */
      if (into === loose) {
        bytes = await sharp(bytes).flop().modulate({ brightness: 1.18 }).jpeg().toBuffer();
      }

      const descriptor = await describeImage(bytes, { exclude: crop.masks });
      if (descriptor) into.push({ id: item.id, descriptor });
    }
  }
}

let retrievalHits = 0;
const retrievalMisses = [];

for (const query of tight) {
  const ranked = loose
    .map((candidate) => ({
      id: candidate.id,
      score: visualSimilarity(query.descriptor, candidate.descriptor),
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  if (winner?.id === query.id) {
    retrievalHits += 1;
    if (VERBOSE) console.log(`    ✓ ${query.id.padEnd(16)} ${winner.score.toFixed(3)}`);
  } else {
    const own = ranked.findIndex((entry) => entry.id === query.id);
    retrievalMisses.push({
      id: query.id,
      got: winner?.id ?? "—",
      gotScore: winner?.score ?? 0,
      rank: own + 1,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  3. Family classification                                                  */
/* -------------------------------------------------------------------------- */

let familyHits = 0;
let familyTotal = 0;
const familyMisses = [];

for (const testCase of cases) {
  for (const item of testCase.items) {
    familyTotal += 1;
    // Ground truth families are derived by the same classifier, so this measures
    // self-consistency rather than correctness — it catches a rule change that
    // silently reclassifies half the catalogue.
    const got = familyOf(item.itemType);
    if (got === item.family || got === "unknown") {
      familyHits += 1;
    } else {
      familyMisses.push({ id: item.id, itemType: item.itemType, want: item.family, got });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  4. Detection cleanup against recorded Vision responses                    */
/* -------------------------------------------------------------------------- */

const fixtureDir = `${ROOT}eval/fixtures`;
let hotspotCases = 0;
let hotspotHits = 0;
let matchedFamilyHits = 0;
let matchedFamilyTotal = 0;
const hotspotDetail = [];

/*
 * Box accuracy — the assumption nothing had ever checked.
 *
 * Every stage downstream trusts that Vision's rectangle sits on the garment: the
 * colour is sampled inside it, the crop sent to the model is cut from it, the
 * visual descriptor compares it against a product photo. A box that is off by a
 * third measures the wrong pixels very precisely, and no existing metric would
 * notice — "hotspot count" only ever asked *how many*.
 *
 * Matching is one-to-one (`eval/boxMatch.ts`). Asking each truth item for its best
 * overlap independently lets one sprawling "Clothing" box claim to have found the
 * jacket, the top and the trousers at once, which reports perfect recall for a
 * detector that found one thing.
 */
const overlapSamples = [];
let boxMatched = 0;
let boxTruthTotal = 0;
let boxDetectionTotal = 0;
const boxDetail = [];

const fixtures = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))
  : [];

for (const name of fixtures) {
  const exampleId = name.replace(/\.json$/, "");
  const truth = cases.find((entry) => entry.exampleId === exampleId);
  if (!truth) continue;

  const raw = JSON.parse(readFileSync(`${fixtureDir}/${name}`, "utf8"));
  const { detections, rawCount, droppedByBody } = replayVisionFixture(raw);

  hotspotCases += 1;
  const expectedCount = truth.items.length;
  if (Math.abs(detections.length - expectedCount) <= 1) hotspotHits += 1;

  hotspotDetail.push({
    exampleId,
    raw: rawCount,
    kept: detections.length,
    expected: expectedCount,
    droppedByBody,
  });

  // --- box accuracy -------------------------------------------------------
  const truthBoxes = truth.items.map((item) => item.box);
  const detectionBoxes = detections.map((detection) => detection.box);

  const { matches, missedTruth, spuriousDetections } = matchBoxes(truthBoxes, detectionBoxes);
  boxMatched += matches.length;
  boxTruthTotal += truthBoxes.length;
  boxDetectionTotal += detectionBoxes.length;
  overlapSamples.push(...bestOverlaps(truthBoxes, detectionBoxes));

  boxDetail.push({
    exampleId,
    matched: matches.length,
    truth: truthBoxes.length,
    missed: missedTruth.map((index) => truth.items[index].id),
    spurious: spuriousDetections.length,
    medianIou: median(matches.map((match) => match.iou)),
  });

  // Family agreement on the *assigned* pairs, not on whatever overlapped most.
  for (const match of matches) {
    matchedFamilyTotal += 1;
    if (detections[match.detectionIndex].family === truth.items[match.truthIndex].family) {
      matchedFamilyHits += 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

const colorScore = pct(colorHits, colorTotal);
const queryScore = pct(queryHits, queryTotal);
const nounScore = pct(nounHits, nounTotal);
const markupScore = pct(markupHits, PRODUCT_MARKUP_CASES.length);
const familyScore = pct(familyHits, familyTotal);

/*
 * Ürün bağlantısı yasağı, gerçek adreslere karşı.
 *
 * Kalıplar yalnızca yedi uluslararası mağazaya göre yazılmıştı ve yirmi gerçek
 * ürün sayfasının on ikisini reddediyordu; bir Zara kategori sayfasını da kabul
 * ediyordu. İkisi de kod okunarak fark edilmedi, ölçülünce çıktı — o yüzden ölçüm
 * burada kalıyor.
 */
const urlFalseRejects = PDP_URLS.filter((url) => !isDirectProductUrl(url));
const urlFalseAccepts = LISTING_URLS.filter((url) => isDirectProductUrl(url));
const urlTotal = PDP_URLS.length + LISTING_URLS.length;
const urlHits = urlTotal - urlFalseRejects.length - urlFalseAccepts.length;
const urlScore = pct(urlHits, urlTotal);

/*
 * `fetch:images`in gerçekten yanlış olabilecek parçası.
 *
 * Bağlantılar doldurulduktan sonraki adım ve hiç çalıştırılmadı; ağ çağrısı
 * standart, kırılgan olan sayfadan görseli çeken kalıplar. O parça ağ istemiyor,
 * yani ilk çalıştırmada öğrenilmesi gerekmiyor.
 */
const ogMisses = OG_IMAGE_CASES.filter(
  (probe) => extractImage(probe.html, probe.pageUrl) !== probe.expected,
);
const ogScore = pct(OG_IMAGE_CASES.length - ogMisses.length, OG_IMAGE_CASES.length);

/*
 * Rozette yazan mağaza, «Ürüne git»in açtığı mağaza mı?
 *
 * Doğrulanmış bağlantılar yazılınca on dört üründen on biri yalan söylemeye
 * başladı: katalogdaki mağaza alanı elle girilmişti ve bağlantı başka bir
 * mağazaya gidiyordu — Zara rozeti, Boyner bağlantısı. Kırık bağlantı kadar
 * ciddi, çünkü ikisi de kullanıcıya gitmediği bir yeri gösteriyor, ve gözle
 * bakarak fark edilmesi daha zor.
 */
const badgeRows = Object.values(MOCK_SCENARIOS)
  .flat()
  .flatMap((item) => [item.exactMatch, ...item.alternatives])
  .filter(Boolean)
  .map((row) => hydrateProduct(row))
  .filter((product) => product.productUrl);

const badgeLies = badgeRows.filter((product) => {
  const label = merchantLabel(product.merchant, product.merchantDomain);
  // Tanınmayan mağazada etiket, alan adının uzantısız hâli olmalı — yani alan
  // adı etiketle başlamalı. Eşitlik aramak, uzantı atıldığı an yanlış olurdu.
  if (product.merchant === "Other") return !product.merchantDomain.startsWith(label);
  const stem = merchantHost(product.merchant).replace(/^www\d*\./, "").split(".")[0];
  return !product.merchantDomain.includes(stem);
});
const badgeScore = pct(badgeRows.length - badgeLies.length, badgeRows.length);

/*
 * Gerçek bir mağaza bağlantısının yanında uydurma fiyat kalmasın.
 *
 * Demo kataloğundaki bütün fiyatlar uydurma ve site bunu söylüyor; sorun, gerçek
 * bir Boyner bağlantısının yanındaki rakamın artık örnek veri gibi değil o
 * mağazanın fiyatı gibi okunması. Kural `priceIsShowable`da: canlı ölçülmüş ya da
 * bağlantısız olmayan hiçbir fiyat gösterilmiyor. Burada ölçülen, kuralın
 * kataloğun tamamında tutup tutmadığı.
 */
const pricedWithLink = badgeRows.filter((product) => priceIsShowable(product));
const priceScore = pct(badgeRows.length - pricedWithLink.length, badgeRows.length);

/*
 * Sıradan bir parça boş ekran görüyor mu?
 *
 * Bir tespitin ailesi okunamazsa katalog hiçbir ürün döndürmüyor — bu bilinçli
 * bir karar (yanlış giysi göstermektense hiçbir şey göstermemek), ama sonucu boş
 * ekran. Ölçüldüğünde yaygın yetmiş yedi Türkçe giysi kelimesinin dörtte biri
 * hiçbir aileye düşmüyordu: eşofman, kravat, atkı, mayo, rimel, palazzo… hiçbiri
 * egzotik değil.
 *
 * Bu metrik o boşluğun kapalı kalmasını sağlıyor: her vaka en az bir ürün
 * döndürmeli.
 */
const coverageMisses = COVERAGE_CASES.filter((probe) => {
  const { exactMatch, alternatives } = findProductsForLabel(probe.label, probe.category);
  return !exactMatch && alternatives.length === 0;
});
/*
 * Katalogdan asla puan sızmamalı.
 *
 * Puan yalnızca canlı satırlarda dolduruluyor, çünkü uydurma bir puan gerçek bir
 * mağaza bağlantısının yanında uydurma bir fiyat kadar yanıltıcı — ikisi de o
 * mağazanın söylediği şey gibi okunuyor. Tip düzeyinde `CatalogProduct`'ta
 * karşılığı yok, ama bir gün biri `hydrateProduct` içinde bir varsayılan koyarsa
 * derleyici bunu yakalamaz; bu satır yakalar.
 */
const ratingLeaks = badgeRows.filter(
  (product) => product.rating !== undefined || product.reviewCount !== undefined,
);

const coverageScore = pct(
  COVERAGE_CASES.length - coverageMisses.length,
  COVERAGE_CASES.length,
);

/*
 * Vision'ın sınıfları bir aileye düşüyor mu?
 *
 * Türkçe kelime listesinden daha kritik: boru hattına giren şey bu. Ölçülünce
 * elli dört sınıfın beşi hiçbir aileye düşmüyordu (Helmet, Wallet, Underpants,
 * Brassiere ve iki üst sınıf) ve ailesi olmayan bir tespit katalogdan hiçbir ürün
 * alamıyor. Üst sınıflar ayrı tutuluyor — onları bir aileye zorlamak yanlış.
 */
const visionFamilyMisses = VISION_CLASSES.filter(
  (name) => familyOf(`${name} ${toTurkishRetailTerms(name)}`) === "unknown",
);
const visionFamilyScore = pct(
  VISION_CLASSES.length - visionFamilyMisses.length,
  VISION_CLASSES.length,
);
const visionQueryScore = pct(visionQueryHits, visionQueryTotal);
const retrievalScore = pct(retrievalHits, tight.length);
const hotspotScore = pct(hotspotHits, hotspotCases);
const boxRecall = pct(boxMatched, boxTruthTotal);
const boxPrecision = pct(boxMatched, boxDetectionTotal);
const boxMedianIou = median(overlapSamples);
const boxHalfRate = fractionAtLeast(overlapSamples, IOU_MATCH);

const vlmColorScore = pct(vlmColorHits, vlmColorTotal);
const vlmNounScore = pct(vlmNounHits, vlmItemTotal);
const vlmQueryScore = pct(vlmQueryHits, vlmItemTotal);
const regionSubsetScore = pct(regionHitsOnVlmItems, vlmColorTotal);
const visionQuerySubsetScore = pct(visionQueryHitsOnVlmItems, vlmItemTotal);
const hallucinations = materialTally.wrong + patternTally.wrong;
const gradedClaims = materialTally.graded + patternTally.graded;
const hallucinationRate = pct(hallucinations, gradedClaims);

const itemTotal = cases.reduce((sum, entry) => sum + entry.items.length, 0);

console.log(`\n${cases.length} kombin / ${itemTotal} parça\n`);
console.log(
  `  Bölge rengi      ${fmt(colorScore)}  (${colorHits}/${colorTotal})   taban ${fmt(FLOORS.color)}` +
    (colorUngraded ? `, ${colorUngraded} parça desenli (renk notlanmıyor)` : ""),
);
for (const row of backdropDetail) {
  console.log(
    `      ${row.exampleId.padEnd(14)} ` +
      (row.palette === null
        ? "arka plan öğrenilmedi (sahne, fon değil) — yalnızca ten çıkarıldı"
        : `arka plan ${row.buckets} renk, %80 kapsama ${row.palette} kovada`),
  );
}
if (vlmItemTotal > 0) {
  console.log(
    `  VLM rengi        ${fmt(vlmColorScore)}  (${vlmColorHits}/${vlmColorTotal})   taban ${fmt(regionSubsetScore)} (aynı parçalarda ölçülen renk)`,
  );
  console.log(`  VLM ürün adı     ${fmt(vlmNounScore)}  (${vlmNounHits}/${vlmItemTotal})`);
  console.log(
    `  VLM sorgusu      ${fmt(vlmQueryScore)}  (${vlmQueryHits}/${vlmItemTotal})   taban ${fmt(visionQuerySubsetScore)} (aynı parçalarda Vision sınıfı)`,
  );
  console.log(`      ${vlmDescribed}/${vlmItemTotal} parça betimlendi`);

  /*
   * The reason the stage exists, item by item. A single percentage would let three
   * easy recoveries hide the fact that the sandals — the case the stage was
   * designed around — still reads the floor.
   */
  if (hardCovered.length > 0) {
    const marks = hardCovered
      .map((id) => `${id} ${hardOutcome.get(id) ? "✓" : "✗"}`)
      .join("   ");
    const partial = hardCovered.length < HARD_COLOR_ITEMS.length;
    console.log(
      `      Zor parçalar: ${marks}` +
        `   ${hardRecovered.length}/${hardCovered.length} kurtarıldı` +
        (partial
          ? `  (kayıt ${HARD_COLOR_ITEMS.length} parçanın ${hardCovered.length}'ini kapsıyor, değerlendirilmiyor)`
          : `  (gereken ${FLOORS.vlmHardColors})`),
    );
  }

  const claimRow = (name, counts) =>
    `      ${name.padEnd(9)} ${counts.correct} doğru, ${counts.abstained} çekimser, ` +
    `${counts.wrong} uydurma  (${counts.graded} dereceli)`;
  console.log(claimRow("Malzeme:", materialTally));
  console.log(claimRow("Desen:", patternTally));

  if (stabilityItems > 0) {
    console.log(
      `      Kararlılık (${repeatRounds} örnek): renk ${stabilityColorAgreed}/${stabilityItems}, ` +
        `sorgu ${stabilityTokenAgreed}/${stabilityItems} parçada örnekler birbiriyle aynı`,
    );
  }
} else {
  console.log(
    `  VLM rengi        —      (fixture yok; «npm run eval:record-attrs» bir ANTHROPIC_API_KEY ister)`,
  );
}
console.log(`  Sorgu token'ı    ${fmt(queryScore)}  (${queryHits}/${queryTotal})   taban ${fmt(FLOORS.query)}`);
console.log(
  `  Sorguda ürün adı ${fmt(nounScore)}  (${nounHits}/${nounTotal})   taban ${fmt(FLOORS.queryNoun)}` +
    `, ${cases.reduce((n, c) => n + c.items.length, 0)} parça + ${SEARCH_QUERY_CASES.length} kurgu vaka`,
);
for (const miss of nounMisses.slice(0, 6)) {
  console.log(`      ${miss.id.padEnd(16)} basamak ${miss.rung} «${miss.query}» — ${miss.why}`);
}
console.log(
  `  Ürün işaretlemesi ${fmt(markupScore)}  (${markupHits}/${PRODUCT_MARKUP_CASES.length})   ` +
    `taban ${fmt(FLOORS.productMarkup)}, schema.org şekilleri — mağaza ölçümü değil`,
);
for (const miss of markupMisses.slice(0, 6)) console.log(`      ${miss}`);
console.log(`  Vision sınıfı    ${fmt(visionQueryScore)}  (${visionQueryHits}/${visionQueryTotal})   taban ${fmt(FLOORS.visionQuery)}`);
// Chance is computed, not written down: it is 1/candidates, and the candidate
// pool is the eval set. Hard-coding "7%" was right for fourteen items and quietly
// wrong for every set after that — which is the reading that makes a harder task
// look like a worse result.
console.log(
  `  Görsel erişim    ${fmt(retrievalScore)}  (${retrievalHits}/${tight.length})   ` +
    `taban ${fmt(FLOORS.visualRetrieval)}, şans ${fmt(loose.length === 0 ? 0 : 1 / loose.length)}`,
);
console.log(`  Aile tutarlılığı ${fmt(familyScore)}  (${familyHits}/${familyTotal})   taban ${fmt(FLOORS.family)}`);
console.log(
  `  Bağlantı yasağı  ${fmt(urlScore)}  (${urlHits}/${urlTotal})   taban %100` +
    `, ${PDP_URLS.length} ürün + ${LISTING_URLS.length} liste sayfası`,
);
for (const url of urlFalseRejects) console.log(`      yanlış red    ${url.slice(0, 78)}`);
for (const url of urlFalseAccepts) console.log(`      yanlış KABUL  ${url.slice(0, 78)}`);
console.log(
  `  Vision sınıf ailesi ${fmt(visionFamilyScore)}  (${VISION_CLASSES.length - visionFamilyMisses.length}/${VISION_CLASSES.length})   taban %100` +
    `, ${GENERIC_VISION_CLASSES.length} üst sınıf ayrı tutuluyor`,
);
for (const name of visionFamilyMisses) {
  console.log(`      «${name}» hiçbir aileye düşmüyor`);
}
console.log(
  `  Puan sızıntısı   ${ratingLeaks.length === 0 ? "yok" : `${ratingLeaks.length} SATIR`}` +
    `             taban «yok», katalog satırı mağaza puanı taşımamalı`,
);
for (const product of ratingLeaks) {
  console.log(`      ${product.id}: katalog satırı puan taşıyor`);
}
console.log(
  `  Ürün kapsamı     ${fmt(coverageScore)}  (${COVERAGE_CASES.length - coverageMisses.length}/${COVERAGE_CASES.length})   taban ${fmt(FLOORS.coverage)}` +
    `, sıradan bir parça boş ekran görüyor mu`,
);
for (const probe of coverageMisses) {
  console.log(`      «${probe.label}» için hiç ürün yok`);
}
if (KNOWN_GAPS.length) {
  console.log(`      bilinen boşluklar (notlanmıyor): ${KNOWN_GAPS.length} tür — bkz. eval/coverageCases.ts`);
}
console.log(
  `  Mağaza rozeti    ${fmt(badgeScore)}  (${badgeRows.length - badgeLies.length}/${badgeRows.length})   taban %100` +
    `, rozet «Ürüne git»in gittiği yeri söylüyor mu`,
);
for (const product of badgeLies) {
  console.log(
    `      ${product.id}: rozet «${merchantLabel(product.merchant, product.merchantDomain)}» ` +
      `ama bağlantı ${product.merchantDomain}`,
  );
}
console.log(
  `  Fiyat dürüstlüğü ${fmt(priceScore)}  (${badgeRows.length - pricedWithLink.length}/${badgeRows.length})   taban %100` +
    `, bağlantılı üründe uydurma fiyat gösterilmiyor`,
);
for (const product of pricedWithLink) {
  console.log(`      ${product.id}: ${product.merchantDomain} bağlantısı var ama fiyat gösteriliyor`);
}
console.log(
  `  Ürün görseli     ${fmt(ogScore)}  (${OG_IMAGE_CASES.length - ogMisses.length}/${OG_IMAGE_CASES.length})   taban %100` +
    `, «fetch:images» og:image çıkarımı`,
);
for (const probe of ogMisses) {
  console.log(
    `      ${probe.name}: beklenen ${probe.expected ?? "boş"}, ` +
      `çıkan ${extractImage(probe.html, probe.pageUrl) ?? "boş"}`,
  );
}

if (fixtures.length === 0) {
  console.log(
    `  Hotspot sayısı   —      (fixture yok; «npm run eval:record» bir Vision anahtarı ister)`,
  );
} else {
  console.log(`  Hotspot sayısı   ${fmt(hotspotScore)}  (${hotspotHits}/${hotspotCases})   taban ${fmt(FLOORS.hotspotCount)}`);
  if (matchedFamilyTotal > 0) {
    console.log(
      `  Eşleşen aile     ${fmt(pct(matchedFamilyHits, matchedFamilyTotal))}  (${matchedFamilyHits}/${matchedFamilyTotal})`,
    );
  }
  for (const row of hotspotDetail) {
    console.log(
      `      ${row.exampleId.padEnd(14)} ${row.raw} ham -> ${row.kept} hotspot ` +
        `(beklenen ${row.expected}${row.droppedByBody ? `, ${row.droppedByBody} vücut kuralıyla elendi` : ""})`,
    );
  }

  console.log("");
  console.log(`  Kutu bulma       ${fmt(boxRecall)}  (${boxMatched}/${boxTruthTotal})   IoU >= ${IOU_MATCH}, bire-bir`);
  console.log(`  Kutu isabeti     ${fmt(boxPrecision)}  (${boxMatched}/${boxDetectionTotal})   tespitlerin kaçı bir parçaya oturdu`);
  console.log(`  Kutu IoU (medyan) ${boxMedianIou.toFixed(3)}        ${fmt(boxHalfRate)} parça IoU >= ${IOU_MATCH}`);

  for (const row of boxDetail) {
    console.log(
      `      ${row.exampleId.padEnd(14)} ${row.matched}/${row.truth} eşleşti, ` +
        `medyan IoU ${row.medianIou.toFixed(3)}` +
        `${row.spurious ? `, ${row.spurious} fazladan tespit` : ""}` +
        `${row.missed.length ? `, kaçan: ${row.missed.join(", ")}` : ""}`,
    );
  }
}

if (colorMisses.length) {
  console.log("\n  Renk sapmaları:");
  for (const miss of colorMisses) {
    console.log(`    ${miss.id.padEnd(16)} beklenen ${miss.want}, ölçülen ${miss.got} ${miss.hex ?? ""}`);
  }
}
if (vlmColorMisses.length) {
  console.log("\n  VLM renk sapmaları:");
  for (const miss of vlmColorMisses) {
    console.log(`    ${miss.id.padEnd(16)} beklenen ${miss.want}, ölçülen ${miss.got} ${miss.hex ?? ""}`);
  }
}
if (vlmNounMisses.length) {
  console.log("\n  VLM ürün adı sapmaları:");
  for (const miss of vlmNounMisses) {
    console.log(`    ${miss.id.padEnd(16)} «${miss.want}» yok -> "${miss.got}"`);
  }
}
if (vlmQueryMisses.length) {
  console.log("\n  VLM sorgu sapmaları:");
  for (const miss of vlmQueryMisses) {
    console.log(`    ${miss.id.padEnd(16)} «${miss.want}» yok -> "${miss.query}"`);
  }
}
if (attributeLapses.length) {
  console.log("\n  Uydurulan öznitelikler (ürün eşleşmesini aktif olarak bozar):");
  for (const lapse of attributeLapses) {
    console.log(
      `    ${lapse.id.padEnd(16)} ${lapse.field}: fotoğrafta «${lapse.want}» -> model «${lapse.got}»`,
    );
  }
}
if (queryMisses.length) {
  console.log("\n  Sorgu sapmaları:");
  for (const miss of queryMisses) {
    console.log(`    ${miss.id.padEnd(16)} «${miss.want}» yok -> "${miss.query}"`);
  }
}
if (visionQueryMisses.length) {
  console.log("\n  Vision sınıfı sapmaları:");
  for (const miss of visionQueryMisses) {
    console.log(`    ${miss.id.padEnd(16)} «${miss.want}» — ${miss.note} -> "${miss.query}"`);
  }
}
if (retrievalMisses.length) {
  console.log("\n  Görsel erişim sapmaları:");
  for (const miss of retrievalMisses) {
    console.log(
      `    ${miss.id.padEnd(16)} en yakın «${miss.got}» (${miss.gotScore.toFixed(3)}); kendi sırası ${miss.rank}`,
    );
  }
}
if (familyMisses.length) {
  console.log("\n  Aile sapmaları:");
  for (const miss of familyMisses) {
    console.log(`    ${miss.id.padEnd(16)} ${miss.itemType}: beklenen ${miss.want}, ölçülen ${miss.got}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Suggested floors                                                          */
/* -------------------------------------------------------------------------- */

/*
 * `npm run eval -- --floors` prints a paste-ready FLOORS block.
 *
 * The set is four photographs today and the floors were tuned against it. When it
 * grows (`docs/ROADMAP.md` 1.1) every one of them is wrong: too high and the run
 * is permanently red, too low and it is uninformative. Re-deriving them by hand is
 * the kind of chore that gets skipped, and a skipped floor is a gate that stopped
 * gating.
 *
 * The margin is deliberate and deliberately small. A floor exists to catch a
 * regression, so it sits just under what was measured — far enough that noise on a
 * couple of items does not trip it, close enough that a real drop does.
 *
 * Not applied automatically, and it never will be: a run that lowers its own bar to
 * whatever it just scored is not a gate, it is a rubber stamp. The number is
 * printed; a person decides.
 */
const FLOOR_MARGIN = 0.05;

if (process.argv.includes("--floors")) {
  const floor = (value) => Math.max(0, Math.floor((value - FLOOR_MARGIN) * 100) / 100);

  console.log("\n  Ölçülene göre önerilen tabanlar (scripts/eval.mjs içine):\n");
  console.log("  const FLOORS = {");
  console.log(`    color: ${floor(colorScore)},`);
  console.log(`    query: ${floor(queryScore)},`);
  console.log(`    visionQuery: ${floor(visionQueryScore)},`);
  console.log(`    visualRetrieval: ${floor(retrievalScore)},`);
  console.log(`    family: ${floor(familyScore)},`);
  if (fixtures.length > 0) {
    console.log(`    hotspotCount: ${floor(hotspotScore)},`);
    console.log(`    boxRecall: ${floor(boxRecall)},`);
    console.log(`    boxIou: ${Math.max(0, Math.floor((boxMedianIou - FLOOR_MARGIN) * 100) / 100)},`);
  } else {
    console.log("    // kutu tabanları için önce «npm run eval:record» gerekiyor");
  }
  if (gradedClaims > 0) {
    console.log(`    vlmHallucination: ${Math.ceil((hallucinationRate + FLOOR_MARGIN) * 100) / 100},`);
  }
  console.log("  };");
  console.log(
    `\n  ${FLOOR_MARGIN * 100} puanlık pay bırakıldı. Bunlar öneri, karar değil —\n` +
      "  kendi puanına taban koyan bir çalıştırma kapı değil, kaşedir.\n",
  );
}

const failures = [
  colorScore < FLOORS.color && `bölge rengi ${fmt(colorScore)} < ${fmt(FLOORS.color)}`,
  queryScore < FLOORS.query && `sorgu token'ı ${fmt(queryScore)} < ${fmt(FLOORS.query)}`,
  markupScore < FLOORS.productMarkup &&
    `ürün işaretlemesi ${fmt(markupScore)}: ${markupMisses.length} şekil okunamıyor`,
  nounScore < FLOORS.queryNoun &&
    `sorguda ürün adı ${fmt(nounScore)}: ${nounMisses.length} basamak ürün adı taşımıyor`,
  familyScore < FLOORS.family && `aile ${fmt(familyScore)} < ${fmt(FLOORS.family)}`,
  /*
   * Taban %100 ve pazarlık payı yok. Diğer metrikler ölçtükleri şeyin doğası
   * gereği eksik kalabilir — bir rengi insan da yanlış adlandırabilir. Burada
   * öyle bir belirsizlik yok: listedeki her adres ya bir ürüne gidiyor ya
   * gitmiyor, ve ikisi de elle bakılarak yazıldı.
   */
  visionFamilyScore < 1 &&
    `Vision sınıf ailesi ${fmt(visionFamilyScore)}: ${visionFamilyMisses.length} sınıf aileye düşmüyor`,
  ratingLeaks.length > 0 &&
    `puan sızıntısı: ${ratingLeaks.length} katalog satırı mağaza puanı taşıyor`,
  coverageScore < FLOORS.coverage &&
    `ürün kapsamı ${fmt(coverageScore)} < ${fmt(FLOORS.coverage)}: ` +
      `${coverageMisses.length} sıradan parça boş ekran görüyor`,
  badgeScore < 1 &&
    `mağaza rozeti ${fmt(badgeScore)}: ${badgeLies.length} kart gitmediği mağazayı gösteriyor`,
  priceScore < 1 &&
    `fiyat dürüstlüğü ${fmt(priceScore)}: ${pricedWithLink.length} üründe gerçek bağlantı yanında uydurma fiyat`,
  ogScore < 1 && `ürün görseli çıkarımı ${fmt(ogScore)}: ${ogMisses.length} şekil kaçtı`,
  urlScore < 1 &&
    `bağlantı yasağı ${fmt(urlScore)}: ${urlFalseRejects.length} yanlış red, ` +
      `${urlFalseAccepts.length} yanlış kabul`,
  visionQueryScore < FLOORS.visionQuery &&
    `Vision sınıfı ${fmt(visionQueryScore)} < ${fmt(FLOORS.visionQuery)}`,
  tight.length > 0 &&
    retrievalScore < FLOORS.visualRetrieval &&
    `görsel erişim ${fmt(retrievalScore)} < ${fmt(FLOORS.visualRetrieval)}`,
  fixtures.length > 0 &&
    FLOORS.boxRecall !== null &&
    boxRecall < FLOORS.boxRecall &&
    `kutu bulma ${fmt(boxRecall)} < ${fmt(FLOORS.boxRecall)}`,
  fixtures.length > 0 &&
    FLOORS.boxIou !== null &&
    boxMedianIou < FLOORS.boxIou &&
    `kutu IoU ${boxMedianIou.toFixed(3)} < ${FLOORS.boxIou}`,
  fixtures.length > 0 &&
    hotspotScore < FLOORS.hotspotCount &&
    `hotspot ${fmt(hotspotScore)} < ${fmt(FLOORS.hotspotCount)}`,
  /*
   * A relative floor rather than an absolute one. Picking a number for a stage
   * that has never been measured would be aspirational — permanently red or
   * trivially green, and either way uninformative. What is not negotiable is the
   * direction: the pipeline prefers the model's colour over the measured one, so
   * if the model's colour is the worse of the two, that preference is wrong and
   * this has to fail.
   */
  vlmColorTotal > 0 &&
    vlmColorScore < regionSubsetScore &&
    `VLM rengi ${fmt(vlmColorScore)} < aynı parçalarda ölçülen renk ${fmt(regionSubsetScore)}`,
  /*
   * Same shape, one level up: the colour gate says the model beats the
   * measurement, this says the *query built from everything it saw* beats the
   * query built from the detector's class alone. That is the comparison the API
   * call is actually paid for — a stage that describes colours beautifully and
   * still produces a worse search string has not earned it.
   */
  vlmItemTotal > 0 &&
    vlmQueryScore < visionQuerySubsetScore &&
    `VLM sorgusu ${fmt(vlmQueryScore)} < aynı parçalarda Vision sınıfı ${fmt(visionQuerySubsetScore)}`,
  /*
   * The stage's stated purpose. Judged only on a recording that covers all four
   * hard items — a run that skipped one has not asked the question.
   */
  hardCovered.length === HARD_COLOR_ITEMS.length &&
    hardRecovered.length < FLOORS.vlmHardColors &&
    `zor parçalar ${hardRecovered.length}/${HARD_COLOR_ITEMS.length} < ${FLOORS.vlmHardColors} ` +
      `— aşama eklenme gerekçesini karşılamıyor`,
  FLOORS.vlmHallucination !== null &&
    gradedClaims > 0 &&
    hallucinationRate > FLOORS.vlmHallucination &&
    `uydurulan öznitelik ${fmt(hallucinationRate)} > ${fmt(FLOORS.vlmHallucination)}`,
].filter(Boolean);

if (failures.length) {
  console.log(`\n✗ taban altında: ${failures.join(", ")}\n`);
  process.exit(1);
}

console.log("\n✓ tüm metrikler tabanın üstünde\n");
