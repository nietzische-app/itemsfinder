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
    { id: "po-cardigan", color: "pembe", queryToken: "ceket" },
    { id: "po-shorts", color: "koyu", queryToken: "şort" },
    { id: "po-sneakers", color: "koyu", queryToken: "sneaker" },
  ],
  "biker-look": [
    { id: "bk-jacket", color: "koyu", queryToken: "ceket" },
    { id: "bk-body", color: "koyu", queryToken: "body" },
    { id: "bk-jeans", color: "mavi", queryToken: "jean" },
    { id: "bk-sunglasses", color: "gri", queryToken: "gözlük" },
  ],
  "long-coat": [
    { id: "lc-coat", color: "koyu", queryToken: "kaban" },
    { id: "lc-beanie", color: "beyaz", queryToken: "şapka" },
    { id: "lc-jeans", color: "mavi", queryToken: "jean" },
    { id: "lc-sandals", color: "koyu", queryToken: "sandalet" },
  ],
  "black-blazer": [
    { id: "bb-blazer", color: "koyu", queryToken: "blazer" },
    { id: "bb-lip", color: "kirmizi", queryToken: "ruj" },
    { id: "bb-heels", color: "koyu", queryToken: "sandalet" },
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
