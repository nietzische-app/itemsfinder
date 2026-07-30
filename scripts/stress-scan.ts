/**
 * Offline stress harness for post-hardening edge-case calibration.
 *
 * Covers the four /analyze archetypes without live Vision credentials:
 *   1. Full-body street (pink-outfit)
 *   2. Close-up beauty (glam-makeup)
 *   3. Multi-tone apparel (soft-minimal / pattern colour guard)
 *   4. Sanitizer + NLP + merchant ranking + TRY formatting
 *
 * Run: npx tsx scripts/stress-scan.ts
 */

import {
  buildExactMatchQuery,
  extractMaterialsAndPatterns,
  normalizeFashionQuery,
} from "../src/lib/searchQueryBuilder";
import {
  colorBucketFromHex,
  colorsConflict,
} from "../src/lib/searchQueryColors";
import { primaryCategoryOf } from "../src/lib/primaryCategory";
import { passesWhitelistSanitizer } from "../src/utils/sanitizer";
import { formatPrice } from "../src/utils/affiliate";
import {
  compareLiveMerchants,
  merchantPriority,
  retailerRank,
} from "../src/services/retailers";
import {
  EXACT_MATCH_THRESHOLD,
  pickExactAndRest,
  scoreCandidate,
} from "../src/services/reRanker";
import { canonicalizeBrand, parseLogoAnnotations } from "../src/lib/brandLogos";
import { MOCK_SCENARIOS, hydrateItems } from "../src/services/mockCatalog";

type Check = { name: string; ok: boolean; detail?: string };

function assert(name: string, ok: boolean, detail?: string): Check {
  return { name, ok, detail };
}

function archetypePinkOutfit(): Check[] {
  const checks: Check[] = [];
  const items = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);

  const categories = new Set(
    items.map((item) => item.primaryCategory || primaryCategoryOf(item.itemType)),
  );

  checks.push(
    assert(
      "pink-outfit: multi-item isolation (≥2 detections)",
      items.length >= 2,
      `count=${items.length}`,
    ),
  );

  const hasOuter =
    categories.has("OUTERWEAR") ||
    items.some((i) => /ceket|hırka|hirka|cardigan/i.test(`${i.itemType} ${i.label}`));
  const hasBottom =
    categories.has("BOTTOMS") ||
    items.some((i) => /şort|sort|short/i.test(`${i.itemType} ${i.label}`));
  const hasFoot =
    categories.has("FOOTWEAR") ||
    items.some((i) => /sneaker|ayakkab|bot/i.test(`${i.itemType} ${i.label}`));

  checks.push(assert("pink-outfit: outerwear present", hasOuter));
  checks.push(assert("pink-outfit: bottoms present", hasBottom));
  checks.push(assert("pink-outfit: footwear present", hasFoot));

  for (const item of items) {
    const primary =
      item.primaryCategory !== "UNKNOWN"
        ? item.primaryCategory
        : primaryCategoryOf(`${item.itemType} ${item.label}`);

    if (item.exactMatch) {
      checks.push(
        assert(
          `pink-outfit whitelist exact [${item.id}]`,
          passesWhitelistSanitizer(
            primary,
            {
              title: item.exactMatch.title,
              productUrl: item.exactMatch.productUrl,
              brand: item.exactMatch.brand,
            },
            { enforceColor: false },
          ),
          item.exactMatch.title,
        ),
      );
      checks.push(
        assert(
          `pink-outfit badge exact [${item.id}]`,
          /birebir/i.test(item.exactMatch.tag ?? ""),
          item.exactMatch.tag,
        ),
      );
    }

    for (const alt of item.alternatives) {
      checks.push(
        assert(
          `pink-outfit whitelist alt [${alt.id}]`,
          passesWhitelistSanitizer(
            primary,
            {
              title: alt.title,
              productUrl: alt.productUrl,
              brand: alt.brand,
            },
            { enforceColor: false },
          ),
          alt.title,
        ),
      );
    }
  }

  checks.push(
    assert(
      "sanitizer drops bedsheet under FOOTWEAR",
      !passesWhitelistSanitizer("FOOTWEAR", {
        title: "Çift Kişilik Pamuklu Nevresim Seti",
        productUrl: "https://www.trendyol.com/nevresim-x-p-1",
      }),
    ),
  );

  return checks;
}

function archetypeBeauty(): Check[] {
  const checks: Check[] = [];
  const items = hydrateItems(MOCK_SCENARIOS["glam-makeup"]);

  checks.push(
    assert("glam-makeup: detections present", items.length >= 1, `count=${items.length}`),
  );

  for (const item of items) {
    const primary =
      item.primaryCategory !== "UNKNOWN"
        ? item.primaryCategory
        : primaryCategoryOf(`${item.itemType} ${item.label}`);

    const isAccessory = /küpe|kupe|earring|hoop|kolye|necklace/i.test(
      `${item.itemType} ${item.label}`,
    );
    const expectedPrimary = isAccessory ? "ACCESSORIES" : "BEAUTY";

    checks.push(
      assert(
        `glam-makeup category ${expectedPrimary} [${item.id}]`,
        primary === expectedPrimary,
        primary,
      ),
    );

    if (item.exactMatch) {
      checks.push(
        assert(
          `glam-makeup PDP whitelist [${item.id}]`,
          passesWhitelistSanitizer(
            primary,
            {
              title: item.exactMatch.title,
              productUrl: item.exactMatch.productUrl,
              brand: item.exactMatch.brand,
            },
            { enforceColor: false },
          ),
          item.exactMatch.title,
        ),
      );
    }
  }

  const nlp = normalizeFashionQuery("Matt Liquid Lipstick");
  checks.push(
    assert("NLP: Matt Liquid Lipstick → Mat Likit Ruj", nlp === "Mat Likit Ruj", nlp),
  );

  const query = buildExactMatchQuery({
    primaryCategory: "BEAUTY",
    webEntity: "Matt Liquid Lipstick",
    colorName: "Kırmızı",
  });
  checks.push(
    assert("beauty query includes Ruj + colour", /ruj/i.test(query) && /kırmızı/i.test(query), query),
  );

  checks.push(
    assert(
      "beauty sanitizer rejects footwear PDP",
      !passesWhitelistSanitizer("BEAUTY", {
        title: "Siyah Deri Topuklu Sandalet",
        productUrl: "https://www.zara.com/tr/tr/sandalet-p-1.html",
      }),
    ),
  );

  return checks;
}

function archetypeMultiTone(): Check[] {
  const checks: Check[] = [];

  checks.push(
    assert(
      "multi-tone: bej+siyah kept for Krem/Bej expected",
      !colorsConflict("Krem/Bej", "Bej Siyah Desenli Ceket"),
    ),
  );
  checks.push(
    assert(
      "multi-tone: bej+siyah kept for Siyah expected",
      !colorsConflict("Siyah", "Bej ve Siyah Desenli Bluz"),
    ),
  );
  checks.push(
    assert(
      "multi-tone: loud conflict still rejected",
      colorsConflict("Siyah", "Neon Yeşil Pantolon"),
    ),
  );

  const soft = hydrateItems(MOCK_SCENARIOS["soft-minimal"]);
  checks.push(
    assert("soft-minimal scenario hydrates", soft.length >= 1, `count=${soft.length}`),
  );

  const bucket = colorBucketFromHex("#dfcdb1");
  checks.push(
    assert("beige hex maps to Krem/Bej", bucket === "Krem/Bej", String(bucket)),
  );

  return checks;
}

function archetypeRankingAndPrice(): Check[] {
  const checks: Check[] = [];

  const order = [
    "www.trendyol.com",
    "www.zara.com",
    "www.lcwaikiki.com",
    "www.defacto.com.tr",
    "www.hm.com",
    "www.sephora.com.tr",
    "www.amazon.com.tr",
  ];

  for (let i = 1; i < order.length; i += 1) {
    const prev = merchantPriority(order[i - 1]!);
    const next = merchantPriority(order[i]!);
    checks.push(
      assert(
        `priority ${order[i - 1]} < ${order[i]}`,
        prev < next,
        `${prev} vs ${next}`,
      ),
    );
  }

  checks.push(
    assert(
      "Trendyol PDP ranks above generic fashion PDP",
      retailerRank("trendyol.com", true) < retailerRank("nike.com", true),
    ),
  );

  const sorted = [
    { merchantDomain: "nike.com", price: 100 },
    { merchantDomain: "trendyol.com", price: 200 },
    { merchantDomain: "zara.com", price: 150 },
  ].sort(compareLiveMerchants);

  checks.push(
    assert(
      "compareLiveMerchants prefers Trendyol first",
      sorted[0]?.merchantDomain === "trendyol.com",
      sorted.map((c) => c.merchantDomain).join(","),
    ),
  );

  checks.push(
    assert(
      "TRY formats with ₺",
      formatPrice(3599.9, "TRY") === "₺3.599,90",
      formatPrice(3599.9, "TRY"),
    ),
  );
  checks.push(
    assert(
      "TL alias formats with ₺",
      formatPrice(549, "TL").startsWith("₺"),
      formatPrice(549, "TL"),
    ),
  );

  return checks;
}

function archetypeLowContrastRoiHints(): Check[] {
  // ROI pad calibration is covered by imageRoi constants; validate NLP/query
  // still produces shoppable Turkish phrases for shadowed footwear labels.
  const query = buildExactMatchQuery({
    primaryCategory: "FOOTWEAR",
    webEntity: "High Top Sneakers",
    colorName: "Siyah",
    itemType: "Footwear",
  });

  return [
    assert(
      "low-contrast footwear query stays Turkish + colour-locked",
      /sneaker/i.test(query) && /siyah/i.test(query) && !/footwear/i.test(query),
      query,
    ),
  ];
}

function archetypePrecisionLogoTextureRerank(): Check[] {
  const checks: Check[] = [];

  checks.push(
    assert("logo canonicalize Nike", canonicalizeBrand("Nike, Inc.") === "Nike"),
  );
  checks.push(
    assert("logo canonicalize Zara", canonicalizeBrand("ZARA") === "Zara"),
  );
  checks.push(
    assert(
      "logo parse picks best known brand",
      parseLogoAnnotations([
        { description: "Unknown Corp", score: 0.99 },
        { description: "Adidas", score: 0.82 },
        { description: "Nike", score: 0.91 },
      ])[0]?.brand === "Nike",
    ),
  );

  const nikeQuery = buildExactMatchQuery({
    primaryCategory: "FOOTWEAR",
    brandLogo: "Nike",
    colorName: "Siyah",
    webEntity: "High Top Sneakers",
    materials: ["Deri"],
  });
  checks.push(
    assert(
      "logo prepends Nike into query",
      /^Nike\b/i.test(nikeQuery) && /siyah/i.test(nikeQuery) && /deri/i.test(nikeQuery),
      nikeQuery,
    ),
  );

  const textures = extractMaterialsAndPatterns(
    "ribbed knit leather cardigan with plaid check print",
  );
  checks.push(
    assert(
      "texture extract includes Triko/Fitilli/Deri",
      textures.materials.includes("Triko") &&
        textures.materials.includes("Fitilli") &&
        textures.materials.includes("Deri"),
      textures.materials.join(","),
    ),
  );
  checks.push(
    assert(
      "pattern extract includes Ekose",
      textures.patterns.includes("Ekose"),
      textures.patterns.join(","),
    ),
  );

  const materialQuery = buildExactMatchQuery({
    primaryCategory: "OUTERWEAR",
    colorName: "Siyah",
    webEntity: "Zip Knit Cardigan",
    materials: ["Triko"],
    patterns: ["Ekose"],
  });
  checks.push(
    assert(
      "mandatory Triko+Ekose in query",
      /triko/i.test(materialQuery) && /ekose/i.test(materialQuery),
      materialQuery,
    ),
  );

  const target = {
    primaryCategory: "FOOTWEAR" as const,
    colorName: "Siyah",
    webEntity: "Nike High Top Sneaker",
    webEntityScore: 0.92,
    brandLogo: "Nike",
    materials: ["Deri"],
    patterns: [] as string[],
  };

  const ranked = pickExactAndRest(target, [
    {
      title: "Nike Siyah Deri Yüksek Taban Sneaker",
      brand: "Nike",
      productUrl: "https://www.trendyol.com/nike-siyah-deri-sneaker-p-1",
      priorSimilarity: 0.93,
    },
    {
      title: "Beyaz Keten Espadril",
      brand: "Other",
      productUrl: "https://www.trendyol.com/espadril-p-2",
      priorSimilarity: 0.4,
    },
    {
      title: "Siyah Deri Bot",
      brand: "Zara",
      productUrl: "https://www.zara.com/tr/tr/bot-p-3.html",
      priorSimilarity: 0.7,
    },
  ]);

  checks.push(
    assert(
      "re-rank exact clears 85% threshold",
      Boolean(ranked.exact && ranked.exact.score >= EXACT_MATCH_THRESHOLD),
      String(ranked.exact?.score),
    ),
  );
  checks.push(
    assert(
      "re-rank exact is Nike sneaker",
      /nike/i.test(ranked.exact?.candidate.title ?? ""),
      ranked.exact?.candidate.title,
    ),
  );
  checks.push(
    assert(
      "re-rank places exact first",
      ranked.ranked[0]?.isExact === true,
    ),
  );

  const weak = scoreCandidate(
    { primaryCategory: "FOOTWEAR", colorName: "Siyah" },
    {
      title: "Çift Kişilik Nevresim",
      productUrl: "https://www.trendyol.com/nevresim-p-9",
    },
  );
  checks.push(
    assert(
      "cross-category scores below exact threshold",
      weak.score < EXACT_MATCH_THRESHOLD && weak.breakdown.category < 0.5,
      String(weak.score),
    ),
  );

  // Street + beauty hydrations still produce birebir tags after precision wiring.
  const street = hydrateItems(MOCK_SCENARIOS["pink-outfit"]);
  const beauty = hydrateItems(MOCK_SCENARIOS["glam-makeup"]);
  checks.push(
    assert(
      "street style still has birebir cards",
      street.some((item) => item.exactMatch && /birebir/i.test(item.exactMatch.tag ?? "")),
    ),
  );
  checks.push(
    assert(
      "beauty still has birebir cards",
      beauty.some((item) => item.exactMatch && /birebir/i.test(item.exactMatch.tag ?? "")),
    ),
  );

  return checks;
}

async function main() {
  const suites = [
    ...archetypePinkOutfit(),
    ...archetypeBeauty(),
    ...archetypeMultiTone(),
    ...archetypeRankingAndPrice(),
    ...archetypeLowContrastRoiHints(),
    ...archetypePrecisionLogoTextureRerank(),
  ];

  let failed = 0;
  for (const check of suites) {
    const mark = check.ok ? "PASS" : "FAIL";
    if (!check.ok) failed += 1;
    console.log(`${mark}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }

  console.log(`\n${suites.length - failed}/${suites.length} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
