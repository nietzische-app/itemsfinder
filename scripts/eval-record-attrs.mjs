/**
 * Records VLM garment attributes for the eval set.
 *
 * Needs `ANTHROPIC_API_KEY`. Writes one JSON per look into
 * `eval/fixtures/attrs/`, keyed by catalogue item id, which `npm run eval` then
 * replays offline — so the question "does looking at the crop actually beat
 * measuring the box?" gets answered by a number instead of by a screenshot.
 *
 *   ANTHROPIC_API_KEY=... npm run eval:record-attrs
 *
 * The ground-truth boxes are used rather than Vision's, so this measures the
 * attribute stage on its own instead of compounding two error sources. Re-run it
 * after changing the prompt or the schema.
 */
import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const ROOT = new URL("..", import.meta.url).pathname;
const KEY = process.env.ANTHROPIC_API_KEY ?? "";

if (!KEY) {
  console.error(
    "\nANTHROPIC_API_KEY yok. Öznitelik kaydı gerçek bir model çağrısı ister.\n" +
      "«npm run eval» anahtar olmadan ölçülen renk metriğini yine raporlar.\n",
  );
  process.exit(1);
}

const { familyOf } = await import("@/lib/itemFamily");
const { imageSize } = await import("@/services/regionColor");
const { createAttributeExtractor } = await import("@/services/attributeExtractor");
const { groundTruth } = await import("../eval/groundTruth.ts");

const outDir = `${ROOT}eval/fixtures/attrs`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const extractor = createAttributeExtractor(KEY, {
  model: process.env.VLM_MODEL?.trim() || undefined,
  // The eval is not latency-bound and every item matters here, so no item cap and
  // a generous budget — unlike a live scan.
  maxItems: 32,
  deadlineMs: 120_000,
  requestTimeoutMs: 60_000,
  baseUrl: process.env.VLM_BASE_URL?.trim() || undefined,
});

for (const testCase of groundTruth(familyOf)) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) {
    console.log(`  ! görsel yok: ${testCase.image}`);
    continue;
  }

  const buffer = readFileSync(path);
  const size = await imageSize(buffer);

  const results = await extractor.extract(
    buffer,
    testCase.items.map((item) => ({
      key: item.id,
      box: item.box,
      // The coarse class the detector would have supplied, not the full label —
      // handing over the hand-written label would be feeding it the answer.
      itemType: item.itemType,
    })),
    { size },
  );

  const payload = Object.fromEntries(Array.from(results.entries()));
  const file = `${outDir}/${testCase.exampleId}.json`;
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(
    `  ✓ ${testCase.exampleId}: ${results.size}/${testCase.items.length} parça betimlendi -> ${file}`,
  );
}

console.log("\nŞimdi «npm run eval» VLM renk ve sorgu metriklerini de raporlar.\n");
