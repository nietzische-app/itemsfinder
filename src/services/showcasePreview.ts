import { SHOWCASE_LOOKS } from "@/lib/showcase";
import { MOCK_SCENARIOS, hydrateProduct } from "@/services/mockCatalog";
import type { BoundingBox, ExampleId, Merchant } from "@/types";

/**
 * Builds the landing-page showcase from the demo catalogue.
 *
 * This is the join that makes the hero preview and `/analyze` agree: the boxes
 * come from `showcase.ts`, everything else — labels, attributes, confidence,
 * products, prices, links — comes from the same `MOCK_SCENARIOS` entry that
 * `/api/detect` returns for that `exampleId`. Clicking a hotspot on the landing
 * page and uploading the same photo produce identical rows because there is only
 * one place the rows exist.
 *
 * It runs on the server. The landing page is a server component that calls this
 * and passes the result down as props, which keeps the ~2400-line catalogue out
 * of the client bundle while still being its only source of truth.
 */

export interface ShowcasePreviewMatch {
  title: string;
  merchant: Merchant;
  price: number;
  currency: string;
  /**
   * Verified product detail page, or "" when none has been supplied. Never a
   * storefront search — see `src/lib/productUrl.ts`.
   */
  url: string;
  similarity: number;
  /** How many cheaper look-alikes the scan found for this item. */
  alternativeCount: number;
}

export interface ShowcasePreviewItem {
  id: string;
  label: string;
  itemType: string;
  attributes: string;
  colorHex: string;
  confidence: number;
  box: BoundingBox;
  /** Null when the catalogue has no exact match for this detection. */
  match: ShowcasePreviewMatch | null;
}

export interface ShowcasePreviewLook {
  id: string;
  exampleId: ExampleId;
  label: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  credit: string;
  items: ShowcasePreviewItem[];
}

/**
 * Joins looks to catalogue scenarios. Throws on a missing item rather than
 * silently rendering a shorter list: a hotspot that exists in the preview but
 * not in the scan (or the reverse) is the drift this function exists to prevent.
 */
export function buildShowcasePreview(): ShowcasePreviewLook[] {
  return SHOWCASE_LOOKS.map((look) => {
    const scenario = MOCK_SCENARIOS[look.exampleId];
    if (!scenario) {
      throw new Error(`showcasePreview: no scenario for ${look.exampleId}`);
    }

    const items = look.items.map((entry) => {
      const detected = scenario.find((item) => item.id === entry.id);
      if (!detected) {
        throw new Error(
          `showcasePreview: ${look.exampleId} has no catalogue item "${entry.id}"`,
        );
      }

      const exact = detected.exactMatch ? hydrateProduct(detected.exactMatch) : null;

      return {
        id: detected.id,
        label: detected.label,
        itemType: detected.itemType,
        attributes: detected.attributes,
        colorHex: detected.colorHex,
        confidence: detected.confidence,
        box: entry.box,
        match: exact
          ? {
              title: exact.title,
              merchant: exact.merchant,
              price: exact.price,
              currency: exact.currency,
              url: exact.productUrl,
              similarity: exact.similarity,
              alternativeCount: detected.alternatives.length,
            }
          : null,
      };
    });

    return {
      id: look.id,
      exampleId: look.exampleId,
      label: look.label,
      src: look.src,
      width: look.width,
      height: look.height,
      alt: look.alt,
      credit: look.credit,
      items,
    };
  });
}
