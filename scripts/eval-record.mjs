/**
 * Records real Google Vision responses for the eval set.
 *
 * Needs `GOOGLE_CLOUD_VISION_API_KEY` (or `GOOGLE_VISION_API_KEY`). Writes one
 * JSON per look into `eval/fixtures/`, which `npm run eval` then replays offline
 * — so the detection metrics stay reproducible and cost nothing to re-check after
 * the first capture.
 *
 *   GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record
 *
 * Re-run it when the request features change; the fixtures are the raw API
 * response, so the cleanup logic can be re-scored against them freely.
 */
import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const ROOT = new URL("..", import.meta.url).pathname;
const KEY =
  process.env.GOOGLE_CLOUD_VISION_API_KEY ?? process.env.GOOGLE_VISION_API_KEY ?? "";

if (!KEY) {
  console.error(
    "\nGOOGLE_CLOUD_VISION_API_KEY yok. Fixture kaydı gerçek Vision çağrısı ister.\n" +
      "«npm run eval» anahtar olmadan renk/sorgu/aile metriklerini yine ölçer.\n",
  );
  process.exit(1);
}

/**
 * Vision host, overridable so this script can be driven end to end without a key.
 *
 * The attribute recorder already had `VLM_BASE_URL` and this one did not, which
 * meant the only way to find out whether it works was to run it against the real
 * API — with a real key, on a real bill, and on the one session someone has the
 * key in. Both recorders can now be pointed at a stub, so a crash on line ninety
 * is found for free instead of halfway through a paid capture.
 */
const VISION_BASE_URL =
  process.env.VISION_BASE_URL?.trim().replace(/\/$/, "") || "https://vision.googleapis.com";

const { familyOf } = await import("@/lib/itemFamily");
const { groundTruth } = await import("../eval/groundTruth.ts");

const outDir = `${ROOT}eval/fixtures`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const testCase of groundTruth(familyOf)) {
  const path = `${ROOT}public${testCase.image}`;
  if (!existsSync(path)) {
    console.log(`  ! görsel yok: ${testCase.image}`);
    continue;
  }

  const content = readFileSync(path).toString("base64");

  const response = await fetch(
    `${VISION_BASE_URL}/v1/images:annotate?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content },
            // Same features the app requests, so the fixture scores the real path.
            features: [
              { type: "OBJECT_LOCALIZATION", maxResults: 20 },
              { type: "WEB_DETECTION", maxResults: 10 },
              { type: "IMAGE_PROPERTIES" },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    console.error(`  ✗ ${testCase.exampleId}: Vision ${response.status}`);
    console.error(`    ${(await response.text()).slice(0, 300)}`);
    continue;
  }

  const payload = await response.json();
  const file = `${outDir}/${testCase.exampleId}.json`;
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);

  const objects = payload?.responses?.[0]?.localizedObjectAnnotations ?? [];
  console.log(`  ✓ ${testCase.exampleId}: ${objects.length} ham nesne -> ${file}`);
}

console.log("\nŞimdi «npm run eval» hotspot metriklerini de raporlar.\n");
