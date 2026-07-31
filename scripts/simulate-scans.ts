/**
 * End-to-end mock scan simulation + accuracy report.
 *
 * Drives `MockVisualSearchService.analyze` for every example scenario and
 * scores each detection on category lock, whitelist, PDP-only CTA, birebir
 * badge, box geometry, and merchant presence.
 *
 * Run: npx tsx scripts/simulate-scans.ts
 * Optional live HTTP: SCAN_HTTP=1 npx tsx scripts/simulate-scans.ts
 *   (expects `next start` or `next dev` on SCAN_BASE_URL, default :3000)
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { primaryCategoryOf } from "../src/lib/primaryCategory";
import { SHOWCASE_LOOKS } from "../src/lib/showcase";
import {
  isBannedSearchUrl,
  isDirectProductUrl,
} from "../src/services/productUrls";
import { sanitizeDetectedItem } from "../src/services/productProvider";
import { MOCK_SCENARIOS, hydrateItems } from "../src/services/mockCatalog";
import { MockVisualSearchService } from "../src/services/visualSearch";
import { passesWhitelistSanitizer } from "../src/utils/sanitizer";
import type {
  DetectedItem,
  DetectionResult,
  ExampleId,
  PrimaryCategory,
} from "../src/types";

type Check = { name: string; ok: boolean; detail?: string };

/** Expected primary categories per scenario (order-insensitive multiset). */
const EXPECTED_PRIMARIES: Record<string, PrimaryCategory[]> = {
  "pink-outfit": ["OUTERWEAR", "BOTTOMS", "FOOTWEAR"],
  "biker-look": ["OUTERWEAR", "TOPS", "BOTTOMS", "ACCESSORIES"],
  "long-coat": ["OUTERWEAR", "ACCESSORIES", "BOTTOMS", "FOOTWEAR"],
  "black-blazer": ["OUTERWEAR", "BEAUTY", "FOOTWEAR"],
  streetwear: [
    "OUTERWEAR",
    "TOPS",
    "BOTTOMS",
    "FOOTWEAR",
    "ACCESSORIES",
    "BEAUTY",
  ],
  "glam-makeup": ["BEAUTY", "BEAUTY", "BEAUTY", "BEAUTY", "ACCESSORIES"],
  tailoring: ["OUTERWEAR", "BOTTOMS", "FOOTWEAR", "ACCESSORIES"],
  "soft-minimal": ["TOPS", "ACCESSORIES", "ACCESSORIES", "BEAUTY"],
};

/** Showcase look → example image asset under public/examples. */
const SHOWCASE_ASSETS: Record<string, string> = {
  "pink-outfit": "look-pink-knit.jpg",
  "biker-look": "look-biker.jpg",
  "long-coat": "look-longcoat.jpg",
  "black-blazer": "look-blazer.jpg",
};

function assert(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

function multisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const value of a) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of b) {
    const next = (counts.get(value) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(value, next);
  }
  return Array.from(counts.values()).every((n) => n === 0);
}

function boxOk(item: DetectedItem): boolean {
  const box = item.boundingBox;
  if (!box) return false;
  const { x, y, width, height } = box;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return false;
  if (width <= 0.01 || height <= 0.01) return false;
  if (x < 0 || y < 0 || x + width > 1.02 || y + height > 1.02) return false;
  return true;
}

function scoreScenario(id: string, items: DetectedItem[]): Check[] {
  const checks: Check[] = [];
  const expected = EXPECTED_PRIMARIES[id];

  checks.push(
    assert(
      `${id}: has detections`,
      items.length > 0,
      `count=${items.length}`,
    ),
  );

  if (expected) {
    const actual = items.map(
      (item) =>
        item.primaryCategory !== "UNKNOWN"
          ? item.primaryCategory
          : primaryCategoryOf(`${item.itemType} ${item.label}`),
    );
    checks.push(
      assert(
        `${id}: primary category multiset`,
        multisetEqual(actual, expected),
        `got=[${actual.join(",")}] expected=[${expected.join(",")}]`,
      ),
    );
  }

  let birebir = 0;
  let pdpOk = 0;
  let pdpTotal = 0;
  let searchLeak = 0;

  for (const item of items) {
    const primary =
      item.primaryCategory !== "UNKNOWN"
        ? item.primaryCategory
        : primaryCategoryOf(`${item.itemType} ${item.label}`);

    checks.push(
      assert(
        `${id}: box ok [${item.id}]`,
        boxOk(item),
        JSON.stringify(item.boundingBox),
      ),
    );

    checks.push(
      assert(
        `${id}: primary locked [${item.id}]`,
        primary !== "UNKNOWN",
        primary,
      ),
    );

    const products = [
      item.exactMatch,
      ...item.alternatives,
    ].filter(Boolean) as NonNullable<DetectedItem["exactMatch"]>[];

    if (item.exactMatch) {
      birebir += /birebir/i.test(item.exactMatch.tag ?? "") ? 1 : 0;
      checks.push(
        assert(
          `${id}: exact whitelist [${item.id}]`,
          passesWhitelistSanitizer(
            primary,
            {
              title: item.exactMatch.title,
              productUrl: item.exactMatch.productUrl,
              brand: item.exactMatch.brand,
            },
            { colorHex: item.colorHex, enforceColor: true },
          ),
          item.exactMatch.title,
        ),
      );
      checks.push(
        assert(
          `${id}: exact has PDP [${item.id}]`,
          Boolean(item.exactMatch.productUrl) &&
            isDirectProductUrl(item.exactMatch.productUrl),
          item.exactMatch.productUrl || "(empty)",
        ),
      );
    } else {
      checks.push(
        assert(`${id}: exact present [${item.id}]`, false, "missing exactMatch"),
      );
    }

    for (const product of products) {
      pdpTotal += 1;
      const url = product.productUrl;
      if (!url || isBannedSearchUrl(url) || !isDirectProductUrl(url)) {
        searchLeak += 1;
        checks.push(
          assert(
            `${id}: CTA is PDP [${product.id}]`,
            false,
            url || "(empty)",
          ),
        );
      } else {
        pdpOk += 1;
        checks.push(
          assert(`${id}: CTA is PDP [${product.id}]`, true, url.slice(0, 64)),
        );
      }

      checks.push(
        assert(
          `${id}: alt/exact whitelist [${product.id}]`,
          passesWhitelistSanitizer(
            primary,
            {
              title: product.title,
              productUrl: product.productUrl,
              brand: product.brand,
            },
            { colorHex: item.colorHex, enforceColor: true },
          ),
          product.title,
        ),
      );
    }
  }

  checks.push(
    assert(
      `${id}: ≥1 birebir badge`,
      birebir >= 1,
      `birebir=${birebir}/${items.length}`,
    ),
  );
  checks.push(
    assert(
      `${id}: 100% PDP CTAs`,
      searchLeak === 0 && pdpOk === pdpTotal && pdpTotal > 0,
      `pdp=${pdpOk}/${pdpTotal} leaks=${searchLeak}`,
    ),
  );

  return checks;
}

async function simulateMockService(): Promise<{
  checks: Check[];
  results: Record<string, DetectionResult>;
}> {
  const service = new MockVisualSearchService(0);
  const checks: Check[] = [];
  const results: Record<string, DetectionResult> = {};

  const scenarioIds = Object.keys(MOCK_SCENARIOS).filter(
    (id) => id !== "generic",
  ) as ExampleId[];

  for (const id of scenarioIds) {
    const result = await service.analyze({
      imageBase64: Buffer.from(`simulate:${id}`).toString("base64"),
      mimeType: "image/jpeg",
      exampleId: id,
    });
    results[id] = result;

    checks.push(
      assert(`${id}: source=mock`, result.source === "mock", result.source),
    );
    checks.push(
      assert(
        `${id}: analyze item count matches hydrate`,
        result.items.length === hydrateItems(MOCK_SCENARIOS[id]).map(sanitizeDetectedItem).length,
        `analyze=${result.items.length}`,
      ),
    );

    checks.push(...scoreScenario(id, result.items));
  }

  // Showcase parity: landing hotspots must open the same exampleId scenario.
  for (const look of SHOWCASE_LOOKS) {
    const result = results[look.exampleId];
    checks.push(
      assert(
        `showcase ${look.id} → scenario ${look.exampleId} loaded`,
        Boolean(result),
      ),
    );
    if (!result) continue;

    checks.push(
      assert(
        `showcase ${look.id}: hotspot count ≤ detections`,
        look.items.length <= result.items.length ||
          look.items.length === result.items.length,
        `hotspots=${look.items.length} detections=${result.items.length}`,
      ),
    );

    for (const hotspot of look.items) {
      checks.push(
        assert(
          `showcase ${look.id}/${hotspot.id}: match URL is PDP`,
          Boolean(hotspot.match.url) && isDirectProductUrl(hotspot.match.url),
          hotspot.match.url || "(empty)",
        ),
      );
    }
  }

  return { checks, results };
}

async function simulateHttpApi(): Promise<Check[]> {
  const checks: Check[] = [];
  const base = process.env.SCAN_BASE_URL ?? "http://127.0.0.1:3000";

  for (const [exampleId, file] of Object.entries(SHOWCASE_ASSETS)) {
    const filePath = path.join(process.cwd(), "public/examples", file);
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath);
    } catch {
      checks.push(assert(`http ${exampleId}: asset readable`, false, filePath));
      continue;
    }

    const mime = file.endsWith(".svg") ? "image/svg+xml" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    let response: Response;
    try {
      response = await fetch(`${base}/api/detect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl, exampleId }),
      });
    } catch (error) {
      checks.push(
        assert(
          `http ${exampleId}: reach /api/detect`,
          false,
          error instanceof Error ? error.message : String(error),
        ),
      );
      continue;
    }

    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      result?: DetectionResult;
    };

    checks.push(
      assert(
        `http ${exampleId}: HTTP ${response.status}`,
        response.ok && body.ok === true,
        body.error ?? `status=${response.status}`,
      ),
    );

    if (body.result?.items) {
      checks.push(...scoreScenario(`http:${exampleId}`, body.result.items));
    }
  }

  return checks;
}

function printReport(title: string, checks: Check[]): number {
  console.log(`\n=== ${title} ===`);
  let failed = 0;
  for (const check of checks) {
    const mark = check.ok ? "PASS" : "FAIL";
    if (!check.ok) failed += 1;
    console.log(
      `${mark}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`,
    );
  }
  console.log(`${checks.length - failed}/${checks.length} passed`);
  return failed;
}

function printSummary(results: Record<string, DetectionResult>) {
  console.log("\n=== Scan summary (mock analyze) ===");
  console.log(
    "scenario".padEnd(14),
    "n".padStart(3),
    "primaries",
    "  birebir",
    "  PDP CTAs",
  );
  for (const [id, result] of Object.entries(results)) {
    const primaries = result.items
      .map((item) => item.primaryCategory)
      .join(",");
    const birebir = result.items.filter((item) =>
      /birebir/i.test(item.exactMatch?.tag ?? ""),
    ).length;
    const urls = result.items.flatMap((item) =>
      [item.exactMatch, ...item.alternatives]
        .filter(Boolean)
        .map((p) => p!.productUrl),
    );
    const pdp = urls.filter((u) => u && isDirectProductUrl(u)).length;
    console.log(
      id.padEnd(14),
      String(result.items.length).padStart(3),
      primaries,
      `  ${birebir}/${result.items.length}`,
      `  ${pdp}/${urls.length}`,
    );
  }
}

async function main() {
  const { checks, results } = await simulateMockService();
  printSummary(results);
  let failed = printReport("Mock VisualSearchService accuracy", checks);

  if (process.env.SCAN_HTTP === "1") {
    const httpChecks = await simulateHttpApi();
    failed += printReport("HTTP /api/detect accuracy", httpChecks);
  } else {
    console.log(
      "\n(HTTP layer skipped — set SCAN_HTTP=1 with a running Next server to include /api/detect)",
    );
  }

  console.log(
    failed === 0
      ? "\nAccuracy verdict: PASS — all simulated scans meet category/PDP/whitelist bars."
      : `\nAccuracy verdict: FAIL — ${failed} check(s) need attention.`,
  );

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
