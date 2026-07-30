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

    if (query.toLocaleLowerCase("tr").includes(item.queryToken.toLocaleLowerCase("tr"))) {
      queryHits += 1;
      if (VERBOSE) console.log(`    ✓ ${item.id.padEnd(16)} "${query}"`);
    } else {
      queryMisses.push({ id: item.id, want: item.queryToken, query });
    }
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
const hotspotScore = pct(hotspotHits, hotspotCases);

console.log(`\n${cases.length} kombin / ${colorTotal} parça\n`);
console.log(`  Bölge rengi      ${fmt(colorScore)}  (${colorHits}/${colorTotal})   taban ${fmt(FLOORS.color)}`);
console.log(`  Sorgu token'ı    ${fmt(queryScore)}  (${queryHits}/${queryTotal})   taban ${fmt(FLOORS.query)}`);
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
if (queryMisses.length) {
  console.log("\n  Sorgu sapmaları:");
  for (const miss of queryMisses) {
    console.log(`    ${miss.id.padEnd(16)} «${miss.want}» yok -> "${miss.query}"`);
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
  fixtures.length > 0 &&
    hotspotScore < FLOORS.hotspotCount &&
    `hotspot ${fmt(hotspotScore)} < ${fmt(FLOORS.hotspotCount)}`,
].filter(Boolean);

if (failures.length) {
  console.log(`\n✗ taban altında: ${failures.join(", ")}\n`);
  process.exit(1);
}

console.log("\n✓ tüm metrikler tabanın üstünde\n");
