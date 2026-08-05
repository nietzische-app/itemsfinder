/**
 * Records VLM garment attributes for the eval set.
 *
 * Needs `GEMINI_API_KEY`. Writes one JSON per look into
 * `eval/fixtures/attrs/`, which `npm run eval` then replays offline — so the
 * question "does looking at the crop actually beat measuring the box?" gets
 * answered by a number instead of by a screenshot.
 *
 *   GEMINI_API_KEY=... npm run eval:record-attrs
 *   GEMINI_API_KEY=... npm run eval:record-attrs -- --repeat 3
 * *
 * The ground-truth boxes are used rather than Vision's, so this measures the
 * attribute stage on its own instead of compounding two error sources. Re-run it
 * after changing the prompt or the schema.
 *
 * **On `--repeat`.** The model is sampled, not deterministic, and fourteen items
 * is a small enough set that one unlucky draw moves the score by seven points. A
 * single recording cannot tell "the model knows this" apart from "the model
 * guessed right once" — and this project has already spent months on a wrong
 * answer that a single look confirmed. Repeats cost N times as much and are off by
 * default; the eval reports how often the repeated answers agree with each other,
 * which is a different and more useful thing than the score itself.
 *
 * Scoring always uses the **first** sample, because production makes exactly one
 * call. Grading a majority vote would report an accuracy no user receives.
 */
import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const ROOT = new URL("..", import.meta.url).pathname;
const KEY = process.env.GEMINI_API_KEY ?? "";

const repeatArg = process.argv.findIndex((arg) => arg === "--repeat");
const REPEAT = Math.max(
  1,
  Number.parseInt(
    repeatArg >= 0 ? (process.argv[repeatArg + 1] ?? "1") : (process.argv.find((a) => a.startsWith("--repeat="))?.split("=")[1] ?? "1"),
    10,
  ) || 1,
);

if (!KEY) {
  console.error(
    "\nGEMINI_API_KEY yok. Öznitelik kaydı gerçek bir model çağrısı ister.\n" +
      "«npm run eval» anahtar olmadan ölçülen renk metriğini yine raporlar.\n",
  );
  process.exit(1);
}

const { familyOf } = await import("@/lib/itemFamily");
const { imageSize } = await import("@/services/regionColor");
const { createVlmService } = await import("@/services/vlmService");
const { groundTruth } = await import("../eval/groundTruth.ts");

const outDir = `${ROOT}eval/fixtures/attrs`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const MODEL = process.env.VLM_MODEL?.trim() || "gemini-2.0-flash";

const extractor = createVlmService(KEY, {
  model: process.env.VLM_MODEL?.trim() || undefined,
  // The eval is not latency-bound and every item matters here, so no item cap and
  // a generous budget — unlike a live scan.
  maxItems: 32,
  deadlineMs: 120_000,
  requestTimeoutMs: 60_000,
  baseUrl: process.env.VLM_BASE_URL?.trim() || undefined,
});

console.log(`\n${MODEL}, tur başına ${REPEAT} örnek\n`);

for (const testCase of groundTruth(familyOf)) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) {
    console.log(`  ! görsel yok: ${testCase.image}`);
    continue;
  }

  const buffer = readFileSync(path);
  const size = await imageSize(buffer);

  const requests = testCase.items.map((item) => ({
    key: item.id,
    box: item.box,
    // The coarse class the detector would have supplied, not the full label —
    // handing over the hand-written label would be feeding it the answer.
    itemType: item.itemType,
  }));

  /** id -> array of `REPEAT` results, `null` where the model declined. */
  const samples = new Map(testCase.items.map((item) => [item.id, []]));

  for (let round = 0; round < REPEAT; round += 1) {
    const results = await extractor.extract(buffer, requests, { size });
    for (const item of testCase.items) {
      samples.get(item.id).push(results.get(item.id) ?? null);
    }
  }

  const payload = {
    exampleId: testCase.exampleId,
    model: MODEL,
    repeat: REPEAT,
    recordedAt: new Date().toISOString(),
    items: Object.fromEntries(
      Array.from(samples.entries()).map(([id, rounds]) => [id, { samples: rounds }]),
    ),
  };

  const file = `${outDir}/${testCase.exampleId}.json`;
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);

  // Counted on the first sample, which is the one the eval scores.
  const described = Array.from(samples.values()).filter((rounds) => rounds[0]).length;
  console.log(
    `  ✓ ${testCase.exampleId}: ${described}/${testCase.items.length} parça betimlendi -> ${file}`,
  );
}

console.log(
  "\nŞimdi «npm run eval» VLM renk, ürün adı, sorgu ve öznitelik metriklerini de\n" +
    "raporlar. Zor dört parçanın (bkz. HARD_COLOR_ITEMS) kaçının kurtarıldığını da.\n",
);
