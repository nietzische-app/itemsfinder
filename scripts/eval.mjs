/**
 * Detection accuracy eval.
 *
 * Scores the parts of the pipeline that can be measured without calling Google
 * Vision, plus — when fixtures are present — the detection cleanup against real
 * recorded Vision responses.
 *
 *   npm run eval              offline: colour, family, query
 *   npm run eval -- --verbose per-item detail
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
const { buildSearchQuery, colorNameFromHex } = await import("@/lib/searchQuery");
const { regionDominantColor, imageSize } = await import("@/services/regionColor");
const {
  dedupeDetections,
  bodyPosition,
  familyFitsBody,
  iou,
} = await import("@/lib/detectionFilter");
const { groundTruth } = await import("../eval/groundTruth.ts");
const { colorBucketOf } = await import("../eval/colorBucket.ts");

/**
 * Metric floors: set just under the measured baseline so a regression trips the
 * run, not so high that the run is aspirational and permanently red.
 *
 * Colour sits at 0.70 because four of the fourteen items are a known, documented
 * class of failure rather than a bug to tune away: lc-beanie, lc-jeans,
 * lc-sandals and bb-heels are all cases where the garment is a *minority of its
 * own bounding box* — thin sandal straps framing a grey floor, a small beanie
 * against a studio wall, a heel against a white backdrop — so the modal colour is
 * the background. Three things were measured against this set and rejected: a
 * larger sampling inset (worse), background-colour rejection (worse — it discards
 * the garment when garment and backdrop are both dark), and a dominance
 * abstention threshold (cost two correct answers, recovered none). The fix is a
 * real mask, which is the VLM/segmentation work, not another constant.
 *
 * Raise the floor when that lands.
 */
const FLOORS = {
  color: 0.7,
  query: 0.9,
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
  visualRetrieval: 0.7,
  family: 0.9,
  hotspotCount: 0.75,
};

const cases = groundTruth(familyOf);
const pct = (n, d) => (d === 0 ? 0 : n / d);
const fmt = (v) => `${(v * 100).toFixed(0)}%`;

/* -------------------------------------------------------------------------- */
/*  1. Per-region colour                                                      */
/* -------------------------------------------------------------------------- */

let colorHits = 0;
let colorTotal = 0;
const colorMisses = [];
/** Per-item outcome, so the VLM section can be scored on the same items. */
const regionHitById = new Map();

for (const testCase of cases) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) {
    console.log(`  ! görsel yok, atlanıyor: ${testCase.image}`);
    continue;
  }

  const buffer = readFileSync(path);
  const size = await imageSize(buffer);

  for (const item of testCase.items) {
    // Occluders: the other labelled regions that overlap this one, exactly as
    // the pipeline supplies them.
    const exclude = testCase.items
      .filter((other) => other.id !== item.id)
      .map((other) => other.box);

    const hex = await regionDominantColor(buffer, item.box, { size, exclude });
    colorTotal += 1;

    const bucket = hex ? colorBucketOf(hex) : null;
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
/*  1b. VLM attributes, replayed from fixtures                                */
/* -------------------------------------------------------------------------- */

/*
 * The measured colour above describes a *rectangle*; these describe the garment
 * inside it. The four standing colour failures are all cases where those are not
 * the same thing, so this is the metric that says whether the attribute stage
 * earns its API call — scored on the same items, against the same labels.
 *
 * No fixtures means the stage has never been recorded; the section stays silent
 * rather than reporting a zero that would read as a regression.
 */
const attrDir = `${ROOT}eval/fixtures/attrs`;
const attrFixtures = existsSync(attrDir)
  ? readdirSync(attrDir).filter((name) => name.endsWith(".json"))
  : [];

let vlmColorHits = 0;
let vlmColorTotal = 0;
let vlmDescribed = 0;
let vlmNounHits = 0;
/**
 * Region-colour hits on exactly the items the VLM was recorded for.
 *
 * The overall region score covers all fourteen items; fixtures may cover four.
 * Comparing 3/4 against 10/14 would be comparing two different questions, and the
 * gate below is only meaningful on a like-for-like subset.
 */
let regionHitsOnVlmItems = 0;
const vlmColorMisses = [];
const vlmNounMisses = [];

for (const name of attrFixtures) {
  const exampleId = name.replace(/\.json$/, "");
  const truth = cases.find((entry) => entry.exampleId === exampleId);
  if (!truth) continue;

  const recorded = JSON.parse(readFileSync(`${attrDir}/${name}`, "utf8"));

  for (const item of truth.items) {
    vlmColorTotal += 1;
    if (regionHitById.get(item.id)?.hit) regionHitsOnVlmItems += 1;

    const attrs = recorded[item.id];

    // An item the model declined to describe scores as a miss, not as an absence:
    // in the pipeline it falls back to the measured colour, and the point of the
    // comparison is what the user actually ends up with.
    if (!attrs) {
      vlmColorMisses.push({ id: item.id, want: item.color, got: "betimlenmedi" });
      vlmNounMisses.push({ id: item.id, want: item.queryToken, got: "betimlenmedi" });
      continue;
    }

    vlmDescribed += 1;

    const bucket = colorBucketOf(attrs.colorHex);
    if (bucket === item.color) {
      vlmColorHits += 1;
      if (VERBOSE) {
        console.log(
          `    ✓ ${item.id.padEnd(16)} ${attrs.colorHex} ${bucket} («${attrs.colorName}» ${attrs.garmentType})`,
        );
      }
    } else {
      vlmColorMisses.push({ id: item.id, want: item.color, got: bucket, hex: attrs.colorHex });
    }

    // The garment noun is what the query is actually built around, so it is held
    // to the same expected token as the query metric below.
    const noun = String(attrs.garmentType ?? "").toLocaleLowerCase("tr");
    if (noun.includes(item.queryToken.toLocaleLowerCase("tr"))) {
      vlmNounHits += 1;
    } else {
      vlmNounMisses.push({ id: item.id, want: item.queryToken, got: attrs.garmentType });
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

    if (query.toLocaleLowerCase("tr").includes(item.queryToken.toLocaleLowerCase("tr"))) {
      queryHits += 1;
      if (VERBOSE) console.log(`    ✓ ${item.id.padEnd(16)} "${query}"`);
    } else {
      queryMisses.push({ id: item.id, want: item.queryToken, query });
    }
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
let visionQueryHits = 0;
let visionQueryTotal = 0;
const visionQueryMisses = [];

for (const testCase of cases) {
  for (const item of testCase.items) {
    visionQueryTotal += 1;

    const query = buildSearchQuery({ itemType: item.visionClass, colorHex: "#111111" });
    const lower = query.toLocaleLowerCase("tr");

    // Two conditions, both required: the Turkish term has to be there, and the
    // English class must be gone. A query carrying both would score as a pass
    // while still shipping an English word to a Turkish search box.
    const hasTurkish = lower.includes(item.visionToken.toLocaleLowerCase("tr"));
    const englishLeft = item.visionClass
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .some((word) => lower.includes(word) && !item.visionToken.toLowerCase().includes(word));

    if (hasTurkish && !englishLeft) {
      visionQueryHits += 1;
      if (VERBOSE) console.log(`    ✓ ${item.id.padEnd(16)} ${item.visionClass} -> "${query}"`);
    } else {
      visionQueryMisses.push({
        id: item.id,
        want: item.visionToken,
        query,
        note: englishLeft ? "İngilizce kelime kaldı" : "Türkçe terim yok",
      });
    }
  }
}

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

const fixtures = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))
  : [];

for (const name of fixtures) {
  const exampleId = name.replace(/\.json$/, "");
  const truth = cases.find((entry) => entry.exampleId === exampleId);
  if (!truth) continue;

  const raw = JSON.parse(readFileSync(`${fixtureDir}/${name}`, "utf8"));
  const objects = raw?.responses?.[0]?.localizedObjectAnnotations ?? [];

  const toBox = (vertices = []) => {
    const xs = vertices.map((v) => v.x ?? 0);
    const ys = vertices.map((v) => v.y ?? 0);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    return {
      x,
      y,
      width: Math.min(1, Math.max(...xs)) - x,
      height: Math.min(1, Math.max(...ys)) - y,
    };
  };

  const person = objects
    .filter((o) => /person|human|woman|man|girl|boy/i.test(o.name ?? ""))
    .map((o) => toBox(o.boundingPoly?.normalizedVertices))
    .sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;

  const candidates = objects
    .filter((o) => o.name && !/person|human|woman|man|girl|boy/i.test(o.name))
    .map((o) => ({
      name: o.name,
      score: o.score ?? 0,
      box: toBox(o.boundingPoly?.normalizedVertices),
      family: familyOf(o.name),
    }))
    .filter((c) => c.box.width > 0.01 && c.box.height > 0.01)
    .filter((c) => familyFitsBody(c.family, bodyPosition(c.box, person)));

  const detections = dedupeDetections(candidates);

  hotspotCases += 1;
  const expectedCount = truth.items.length;
  const withinOne = Math.abs(detections.length - expectedCount) <= 1;
  if (withinOne) hotspotHits += 1;

  hotspotDetail.push({
    exampleId,
    raw: objects.length,
    kept: detections.length,
    expected: expectedCount,
  });

  // Family agreement on boxes that actually overlap a labelled item.
  for (const item of truth.items) {
    const best = detections
      .map((d) => ({ d, overlap: iou(d.box, item.box) }))
      .sort((a, b) => b.overlap - a.overlap)[0];

    if (best && best.overlap >= 0.3) {
      matchedFamilyTotal += 1;
      if (best.d.family === item.family) matchedFamilyHits += 1;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

const colorScore = pct(colorHits, colorTotal);
const queryScore = pct(queryHits, queryTotal);
const familyScore = pct(familyHits, familyTotal);
const visionQueryScore = pct(visionQueryHits, visionQueryTotal);
const retrievalScore = pct(retrievalHits, tight.length);
const hotspotScore = pct(hotspotHits, hotspotCases);

const vlmColorScore = pct(vlmColorHits, vlmColorTotal);
const vlmNounScore = pct(vlmNounHits, vlmColorTotal);
const regionSubsetScore = pct(regionHitsOnVlmItems, vlmColorTotal);

console.log(`\n${cases.length} kombin / ${colorTotal} parça\n`);
console.log(`  Bölge rengi      ${fmt(colorScore)}  (${colorHits}/${colorTotal})   taban ${fmt(FLOORS.color)}`);
if (vlmColorTotal > 0) {
  console.log(
    `  VLM rengi        ${fmt(vlmColorScore)}  (${vlmColorHits}/${vlmColorTotal})   taban ${fmt(regionSubsetScore)} (aynı parçalarda ölçülen renk)`,
  );
  console.log(`  VLM ürün adı     ${fmt(vlmNounScore)}  (${vlmNounHits}/${vlmColorTotal})`);
  console.log(`      ${vlmDescribed}/${vlmColorTotal} parça betimlendi`);
} else {
  console.log(
    `  VLM rengi        —      (fixture yok; «npm run eval:record-attrs» bir ANTHROPIC_API_KEY ister)`,
  );
}
console.log(`  Sorgu token'ı    ${fmt(queryScore)}  (${queryHits}/${queryTotal})   taban ${fmt(FLOORS.query)}`);
console.log(`  Vision sınıfı    ${fmt(visionQueryScore)}  (${visionQueryHits}/${visionQueryTotal})   taban ${fmt(FLOORS.visionQuery)}`);
console.log(`  Görsel erişim    ${fmt(retrievalScore)}  (${retrievalHits}/${tight.length})   taban ${fmt(FLOORS.visualRetrieval)}, şans %7`);
console.log(`  Aile tutarlılığı ${fmt(familyScore)}  (${familyHits}/${familyTotal})   taban ${fmt(FLOORS.family)}`);

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
    console.log(`      ${row.exampleId.padEnd(14)} ${row.raw} ham -> ${row.kept} hotspot (beklenen ${row.expected})`);
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

const failures = [
  colorScore < FLOORS.color && `bölge rengi ${fmt(colorScore)} < ${fmt(FLOORS.color)}`,
  queryScore < FLOORS.query && `sorgu token'ı ${fmt(queryScore)} < ${fmt(FLOORS.query)}`,
  familyScore < FLOORS.family && `aile ${fmt(familyScore)} < ${fmt(FLOORS.family)}`,
  visionQueryScore < FLOORS.visionQuery &&
    `Vision sınıfı ${fmt(visionQueryScore)} < ${fmt(FLOORS.visionQuery)}`,
  tight.length > 0 &&
    retrievalScore < FLOORS.visualRetrieval &&
    `görsel erişim ${fmt(retrievalScore)} < ${fmt(FLOORS.visualRetrieval)}`,
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
].filter(Boolean);

if (failures.length) {
  console.log(`\n✗ taban altında: ${failures.join(", ")}\n`);
  process.exit(1);
}

console.log("\n✓ tüm metrikler tabanın üstünde\n");
