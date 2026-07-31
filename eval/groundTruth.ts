import { SHOWCASE_LOOKS } from "@/lib/showcase";
import { MOCK_SCENARIOS } from "@/services/mockCatalog";
import { PHOTO_CASES } from "./photoCases";
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

/**
 * Coarse colour families — tolerant on purpose, hue names are not the point.
 *
 * Re-exported from the app rather than declared here: the live product stage needs
 * the same taxonomy to tell whether a listing's colour word contradicts what was
 * measured, and a second copy would drift.
 */
export type { ColorBucket } from "./colorBucket";
import type { ColorBucket } from "./colorBucket";

export interface ItemExpectation {
  /** Catalogue item id, which is also the showcase item id. */
  id: string;
  /**
   * Colour family a human reading the photo would name, or `null` when the garment
   * is a print with no ground colour anyone would type. See `photoCases.ts` for
   * where the line sits — `null` is for prints, not for garments that are merely
   * hard to measure.
   */
  color: ColorBucket | null;
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
  /**
   * Material visible in the photograph, or `null` when it honestly is not.
   *
   * `null` means **ungraded**, not "must abstain": a black bodysuit could be
   * jersey, viscose or polyester and no one can tell from the photo, so any answer
   * there is unfalsifiable and counting it either way would be inventing a result.
   * Only the five garments whose cloth is unmistakable carry a value.
   *
   * This is graded at all because a wrong material is not a cosmetic error — it
   * carries `MATERIAL_CONFLICT` in `scoreTitleAgreement`, so a hallucinated "deri"
   * actively pushes correct linen products out of the results.
   */
  material: string | null;
  /**
   * Pattern visible in the photograph, or `null` where the concept does not apply
   * (a lipstick, a pair of sunglasses).
   *
   * `"düz"` is a positive claim — "this garment is plain" — and the reason nearly
   * every item carries it: the failure worth catching is not a model that declines
   * to name a pattern, it is a model that invents "çizgili" on a plain black
   * blazer. An empty answer scores as an abstention, which costs nothing
   * downstream; a contradicting answer scores as a hallucination, which costs a
   * correct product.
   */
  pattern: string | null;
}

export interface EvalCase {
  exampleId: string;
  /** Path under `public/`. */
  image: string;
  items: ItemExpectation[];
}

/**
 * The four items whose bounding box is mostly *not* the garment.
 *
 * A small beanie against a studio wall, thin sandal straps over a grey floor, a
 * heel against a white backdrop, ripped jeans showing more leg than denim. These
 * are the reason the attribute stage exists at all — a measured dominant colour
 * reads the background on every one of them, and three different thresholds were
 * measured against this set and rejected (`regionColor.ts`).
 *
 * Named here rather than described in prose so the eval can report, item by item,
 * whether looking at the crop actually recovered them. If it recovers fewer than
 * three, the stage is not doing the job it was added for and that has to be a
 * visible failure rather than a paragraph someone might read.
 */
export const HARD_COLOR_ITEMS = ["lc-beanie", "lc-jeans", "lc-sandals", "bb-heels"] as const;

/** Per-item expectations, keyed by scenario. */
const EXPECTATIONS: Record<string, ItemExpectation[]> = {
  "pink-outfit": [
    { id: "po-cardigan", color: "pembe", queryToken: "ceket", visionClass: "Outerwear", visionToken: "ceket", material: "triko", pattern: "düz" },
    { id: "po-shorts", color: "koyu", queryToken: "şort", visionClass: "Shorts", visionToken: "şort", material: "deri", pattern: "düz" },
    // Sneaker uppers are part leather, part textile, part synthetic; "black and
    // white panels" is a colourway, not a pattern. Both ungraded.
    { id: "po-sneakers", color: "koyu", queryToken: "sneaker", visionClass: "Footwear", visionToken: "ayakkabı", material: null, pattern: null },
  ],
  "biker-look": [
    { id: "bk-jacket", color: "koyu", queryToken: "ceket", visionClass: "Jacket", visionToken: "ceket", material: "deri", pattern: "düz" },
    { id: "bk-body", color: "koyu", queryToken: "body", visionClass: "Top", visionToken: "bluz", material: null, pattern: "düz" },
    { id: "bk-jeans", color: "mavi", queryToken: "jean", visionClass: "Jeans", visionToken: "jean", material: "denim", pattern: "düz" },
    { id: "bk-sunglasses", color: "gri", queryToken: "gözlük", visionClass: "Sunglasses", visionToken: "gözlüğü", material: null, pattern: null },
  ],
  "long-coat": [
    { id: "lc-coat", color: "koyu", queryToken: "kaban", visionClass: "Coat", visionToken: "kaban", material: null, pattern: "düz" },
    // The one genuine pattern in the set — a black-on-white leopard print scarf.
    // Everything else is plain, so without this the pattern metric would only ever
    // be measuring the absence of hallucination.
    { id: "lc-beanie", color: "beyaz", queryToken: "şapka", visionClass: "Hat", visionToken: "şapka", material: null, pattern: "leopar" },
    { id: "lc-jeans", color: "mavi", queryToken: "jean", visionClass: "Jeans", visionToken: "jean", material: "denim", pattern: "düz" },
    { id: "lc-sandals", color: "koyu", queryToken: "sandalet", visionClass: "Sandal", visionToken: "sandalet", material: null, pattern: null },
  ],
  "black-blazer": [
    { id: "bb-blazer", color: "koyu", queryToken: "blazer", visionClass: "Outerwear", visionToken: "ceket", material: null, pattern: "düz" },
    { id: "bb-lip", color: "kirmizi", queryToken: "ruj", visionClass: "Lipstick", visionToken: "ruj", material: null, pattern: null },
    { id: "bb-heels", color: "koyu", queryToken: "sandalet", visionClass: "High heels", visionToken: "topuklu", material: null, pattern: null },
  ],
};

export interface GroundTruthItem extends ItemExpectation {
  label: string;
  itemType: string;
  family: ItemFamily;
  box: BoundingBox;
}

export interface GroundTruthCase {
  /**
   * Case id. A string rather than `ExampleId` since the set grew past the demo
   * looks — `PHOTO_CASES` are eval fixtures, not shipped examples, and they have
   * no business in the union that types the app's demo buttons.
   */
  exampleId: string;
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
  const showcase: GroundTruthCase[] = SHOWCASE_LOOKS.map((look) => {
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

  /*
   * The hand-labelled photographs, which carry their own labels and boxes and need
   * nothing from the demo catalogue. Appended rather than merged so the two sources
   * stay legible: the four showcase looks are also product demos, these are only
   * ever measurement.
   */
  const photos: GroundTruthCase[] = PHOTO_CASES.map((photoCase) => ({
    exampleId: photoCase.id,
    image: photoCase.image,
    items: photoCase.items.map((item) => ({
      ...item,
      family: familyOf(`${item.itemType} ${item.label}`),
    })),
  }));

  return [...showcase, ...photos];
}
