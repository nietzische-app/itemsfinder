/**
 * Grid search over the detection-cleanup constants.
 *
 *   npm run eval:sweep
 *   npm run eval:sweep -- --top 20
 *
 * `dedupeDetections` has four numbers — a confidence floor, an IoU threshold, a
 * containment threshold and a merge gap — and every one of them was chosen by
 * looking at a screenshot and picking something that seemed right. This scores the
 * whole grid against recorded Vision responses and says where the shipped values
 * land in it.
 *
 * Needs fixtures (`npm run eval:record`, which needs a Vision key). Without them
 * there is nothing to search against and it says so rather than printing a
 * confident ranking of nothing.
 *
 * It replays through `eval/replay.ts`, the same module the eval uses, so the thing
 * being optimised is the thing that ships. A sweep against a slightly different
 * filter is worse than no sweep: it produces authoritative numbers for code nobody
 * runs.
 */
import { register } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const ROOT = new URL("..", import.meta.url).pathname;
const TOP = Number.parseInt(
  process.argv.find((arg) => arg.startsWith("--top"))?.split(/[= ]/)[1] ?? "12",
  10,
);

const { familyOf, } = await import("@/lib/itemFamily");
const { DEDUPE_DEFAULTS } = await import("@/lib/detectionFilter");
const { groundTruth } = await import("../eval/groundTruth.ts");
const { replayVisionFixture } = await import("../eval/replay.ts");
const { matchBoxes, median } = await import("../eval/boxMatch.ts");

const IOU_MATCH = 0.5;

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

const fixtureDir = `${ROOT}eval/fixtures`;
const files = existsSync(fixtureDir)
  ? readdirSync(fixtureDir).filter((name) => name.endsWith(".json"))
  : [];

if (files.length === 0) {
  console.error(
    "\nFixture yok. Tarama, kaydedilmiş Vision yanıtlarına ihtiyaç duyuyor:\n" +
      "  GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record\n",
  );
  process.exit(1);
}

const cases = groundTruth(familyOf);
const loaded = [];

for (const name of files) {
  const exampleId = name.replace(/\.json$/, "");
  const truth = cases.find((entry) => entry.exampleId === exampleId);
  if (!truth) continue;

  loaded.push({
    exampleId,
    raw: JSON.parse(readFileSync(`${fixtureDir}/${name}`, "utf8")),
    truthBoxes: truth.items.map((item) => item.box),
    truthFamilies: truth.items.map((item) => item.family),
  });
}

console.log(`\n${loaded.length} fixture, ${loaded.reduce((n, c) => n + c.truthBoxes.length, 0)} etiketli parça\n`);

/* -------------------------------------------------------------------------- */
/*  Grid                                                                      */
/* -------------------------------------------------------------------------- */

const GRID = {
  minScore: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75],
  maxIou: [0.3, 0.35, 0.4, 0.45, 0.5, 0.6],
  maxContainment: [0.6, 0.65, 0.7, 0.75, 0.8, 0.9],
  mergeGap: [0.02, 0.04, 0.06, 0.08, 0.12],
};

/**
 * How a configuration is ranked.
 *
 * F1 over "found the garment" carries most of it, because a detector that misses
 * items or invents them is wrong in a way a shopper sees immediately. Median
 * overlap carries the rest: among configurations that find the same set, the one
 * that frames them better feeds a better crop to everything downstream.
 *
 * The weights are a judgement, not a discovery — which is exactly why the table
 * below prints the components too. If recall and precision disagree about the
 * winner, that is a decision for a person, not for a weighted sum.
 */
const F1_WEIGHT = 0.7;
const IOU_WEIGHT = 0.3;

function score(options) {
  let matched = 0;
  let truthTotal = 0;
  let detectionTotal = 0;
  let familyHits = 0;
  const overlaps = [];

  for (const entry of loaded) {
    const { detections } = replayVisionFixture(entry.raw, options);
    const detectionBoxes = detections.map((detection) => detection.box);

    const { matches } = matchBoxes(entry.truthBoxes, detectionBoxes, IOU_MATCH);

    matched += matches.length;
    truthTotal += entry.truthBoxes.length;
    detectionTotal += detectionBoxes.length;
    overlaps.push(...matches.map((match) => match.iou));

    for (const match of matches) {
      if (detections[match.detectionIndex].family === entry.truthFamilies[match.truthIndex]) {
        familyHits += 1;
      }
    }
  }

  const recall = truthTotal === 0 ? 0 : matched / truthTotal;
  const precision = detectionTotal === 0 ? 0 : matched / detectionTotal;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  const medianIou = median(overlaps);

  return {
    recall,
    precision,
    f1,
    medianIou,
    familyRate: matched === 0 ? 0 : familyHits / matched,
    detections: detectionTotal,
    objective: F1_WEIGHT * f1 + IOU_WEIGHT * medianIou,
  };
}

const results = [];

for (const minScore of GRID.minScore) {
  for (const maxIou of GRID.maxIou) {
    for (const maxContainment of GRID.maxContainment) {
      for (const mergeGap of GRID.mergeGap) {
        const options = { minScore, maxIou, maxContainment, mergeGap };
        results.push({ options, ...score(options) });
      }
    }
  }
}

results.sort((a, b) => b.objective - a.objective);

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(4);
const row = (entry, rank) =>
  `  ${String(rank).padStart(4)}  ` +
  `${entry.options.minScore.toFixed(2)} ${entry.options.maxIou.toFixed(2)} ` +
  `${entry.options.maxContainment.toFixed(2)} ${entry.options.mergeGap.toFixed(2)}  ` +
  `${pct(entry.recall)} ${pct(entry.precision)} ${pct(entry.f1)}  ` +
  `${entry.medianIou.toFixed(3)}  ${pct(entry.familyRate)}  ${String(entry.detections).padStart(3)}  ` +
  `${entry.objective.toFixed(4)}`;

console.log(`${results.length} kombinasyon denendi.\n`);
console.log("  sıra  skor  IoU  içerm  boşluk  bulma isbt   F1  medIoU  aile  tsp  hedef");
console.log("  " + "─".repeat(76));

for (let i = 0; i < Math.min(TOP, results.length); i += 1) {
  console.log(row(results[i], i + 1));
}

// Where today's shipped values land.
const current = { ...DEDUPE_DEFAULTS };
delete current.maxItems;
const currentIndex = results.findIndex((entry) =>
  Object.keys(current).every((key) => entry.options[key] === current[key]),
);

console.log("\n  Şu anki değerler:");
if (currentIndex >= 0) {
  console.log(row(results[currentIndex], currentIndex + 1));
  const best = results[0];
  const gain = best.objective - results[currentIndex].objective;
  console.log(
    `\n  En iyi kombinasyon hedefte ${gain >= 0 ? "+" : ""}${gain.toFixed(4)} fark yapıyor` +
      ` (bulma ${pct(results[currentIndex].recall)} -> ${pct(best.recall)},` +
      ` medyan IoU ${results[currentIndex].medianIou.toFixed(3)} -> ${best.medianIou.toFixed(3)}).`,
  );
  console.log(
    "\n  Küçük bir farkı kovalamak, dört fotoğrafa aşırı uydurmaktır. Setin\n" +
      "  büyümesini bekle (docs/ROADMAP.md 1.1); bu tablo o zaman anlam kazanır.",
  );
} else {
  console.log(`    ${JSON.stringify(current)} — ızgarada yok, karşılaştırma yapılamıyor.`);
}

console.log("");
