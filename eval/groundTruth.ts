import { SHOWCASE_LOOKS } from "@/lib/showcase";
import { MOCK_SCENARIOS } from "@/services/mockCatalog";
import type { BoundingBox, ExampleId } from "@/types";
import type { ItemFamily } from "@/lib/itemFamily";

/**
 * Hand-labelled cases for the detection eval.
 *
 * **Scope, honestly:** four photographs, fourteen items. That is a smoke test,
 * not a benchmark. Its value is not the absolute score but the direction the
 * score moves when the pipeline changes — the previous rounds of "improvements"
 * were assessed by looking at one screenshot, which is how a global dominant
 * colour survived long enough to label black shorts "pudra".
 *
 * Boxes come from `SHOWCASE_LOOKS` and labels from `MOCK_SCENARIOS`, both of
 * which are themselves hand-measured ground truth. The genuinely new labels here
 * are the expected **colour bucket** and the Turkish **query token** a shopper
 * would have to see in the generated search string for it to find the item.
 *
 * To add a case: drop the photo in `public/examples/`, add a `SHOWCASE_LOOKS`
 * entry with measured boxes and a matching scenario, then add the per-item
 * expectations below. `npm run eval` picks it up automatically.
 */

/** Coarse colour families — tolerant on purpose, hue names are not the point. */
export type ColorBucket =
  | "pembe"
  | "kirmizi"
  | "koyu"
  | "beyaz"
  | "mavi"
  | "yesil"
  | "kahve"
  | "bej"
  | "gri"
  | "sari"
  | "mor";

export interface ItemExpectation {
  /** Catalogue item id, which is also the showcase item id. */
  id: string;
  /** Colour family a human reading the photo would name. */
  color: ColorBucket;
  /**
   * Turkish token the generated search query must contain for the query to have
   * a chance of finding this garment on a Turkish storefront.
   */
  queryToken: string;
  /**
   * The coarse English class Cloud Vision returns for this item.
   *
   * This exists because the query metric was flattering itself: it is fed the
   * hand-written Turkish label from the catalogue, so it scored 100% while the
   * *actual* default path — no VLM key, so nothing but Vision's English class and
   * a measured colour — was producing "Siyah Shorts" and, for three of Vision's
   * commonest classes, nothing but "Siyah".
   */
  visionClass: string;
  /**
   * Turkish token reachable from `visionClass` **alone**.
   *
   * Deliberately weaker than `queryToken`: Vision says "Footwear", not "sneaker",
   * and no vocabulary table can recover a detail the detector never saw. Holding
   * the coarse path to the specific answer would be scoring it against a question
   * it was never asked.
   */
  visionToken: string;
}

export interface EvalCase {
  exampleId: ExampleId;
  /** Path under `public/`. */
  image: string;
  items: ItemExpectation[];
}

/** Per-item expectations, keyed by scenario. */
const EXPECTATIONS: Record<string, ItemExpectation[]> = {
  "pink-outfit": [
    { id: "po-cardigan", color: "pembe", queryToken: "ceket", visionClass: "Outerwear", visionToken: "ceket" },
    { id: "po-shorts", color: "koyu", queryToken: "şort", visionClass: "Shorts", visionToken: "şort" },
    { id: "po-sneakers", color: "koyu", queryToken: "sneaker", visionClass: "Footwear", visionToken: "ayakkabı" },
  ],
  "biker-look": [
    { id: "bk-jacket", color: "koyu", queryToken: "ceket", visionClass: "Jacket", visionToken: "ceket" },
    { id: "bk-body", color: "koyu", queryToken: "body", visionClass: "Top", visionToken: "bluz" },
    { id: "bk-jeans", color: "mavi", queryToken: "jean", visionClass: "Jeans", visionToken: "jean" },
    { id: "bk-sunglasses", color: "gri", queryToken: "gözlük", visionClass: "Sunglasses", visionToken: "gözlüğü" },
  ],
  "long-coat": [
    { id: "lc-coat", color: "koyu", queryToken: "kaban", visionClass: "Coat", visionToken: "kaban" },
    { id: "lc-beanie", color: "beyaz", queryToken: "şapka", visionClass: "Hat", visionToken: "şapka" },
    { id: "lc-jeans", color: "mavi", queryToken: "jean", visionClass: "Jeans", visionToken: "jean" },
    { id: "lc-sandals", color: "koyu", queryToken: "sandalet", visionClass: "Sandal", visionToken: "sandalet" },
  ],
  "black-blazer": [
    { id: "bb-blazer", color: "koyu", queryToken: "blazer", visionClass: "Outerwear", visionToken: "ceket" },
    { id: "bb-lip", color: "kirmizi", queryToken: "ruj", visionClass: "Lipstick", visionToken: "ruj" },
    { id: "bb-heels", color: "koyu", queryToken: "sandalet", visionClass: "High heels", visionToken: "topuklu" },
  ],
};

export interface GroundTruthItem extends ItemExpectation {
  label: string;
  itemType: string;
  family: ItemFamily;
  box: BoundingBox;
}

export interface GroundTruthCase {
  exampleId: ExampleId;
  image: string;
  items: GroundTruthItem[];
}

/**
 * Joins the expectations to the measured boxes and authored labels.
 *
 * `familyOf` is applied by the caller rather than baked in, so the eval measures
 * the classifier rather than trusting a cached answer.
 */
export function groundTruth(familyOf: (text: string) => ItemFamily): GroundTruthCase[] {
  return SHOWCASE_LOOKS.map((look) => {
    const scenario = MOCK_SCENARIOS[look.exampleId];
    const expectations = EXPECTATIONS[look.exampleId] ?? [];

    const items = expectations.map((expected) => {
      const detected = scenario?.find((item) => item.id === expected.id);
      const geometry = look.items.find((item) => item.id === expected.id);

      if (!detected || !geometry) {
        throw new Error(
          `groundTruth: ${look.exampleId} is missing "${expected.id}" in ${
            detected ? "showcase" : "catalogue"
          }`,
        );
      }

      return {
        ...expected,
        label: detected.label,
        itemType: detected.itemType,
        family: familyOf(`${detected.itemType} ${detected.label}`),
        box: geometry.box,
      };
    });

    return { exampleId: look.exampleId, image: look.src, items };
  });
}
