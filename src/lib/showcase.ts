import type { BoundingBox, ExampleId } from "@/types";

/**
 * Geometry and asset metadata for the landing-page "Live Scan" showcase: four
 * real looks with hand-measured detection boxes.
 *
 * This file holds **no product or label data**. Item ids here are the catalogue
 * ids in `mockCatalog.ts`, and `showcasePreview.ts` joins the two, so the hero
 * preview and `/analyze` render the same detections and the same products from
 * one source. It used to carry its own copy of titles, prices and merchants;
 * that is exactly how a preview drifts from what the scan actually returns.
 *
 * The catalogue reads its boxes back out of here via `showcaseBox`, so geometry
 * also has a single definition.
 */

export interface ShowcaseItem {
  /** Matches the catalogue item's `id`, which is how the two are joined. */
  id: string;
  /**
   * Normalised (0..1) region, top-left origin, relative to the whole image.
   *
   * Measured off each photo at a known 600px width, so these are accurate to
   * roughly ±0.01 rather than eyeballed. Re-measure if a photo is replaced or
   * re-cropped — the numbers are meaningless against a different framing.
   *
   * This is the *only* per-item data that lives here. Labels, attributes,
   * confidence and products all come from `mockCatalog.ts`, so the landing
   * preview and `/analyze` cannot disagree about what was detected.
   */
  box: BoundingBox;
}

export interface ShowcaseLook {
  /** Slug used for the asset name and the switcher. */
  id: string;
  /** Scenario this look opens on `/analyze`. */
  exampleId: ExampleId;
  /** Short name for the switcher chip. */
  label: string;
  src: string;
  /**
   * Intrinsic pixel size of the shipped asset. The frame's aspect ratio is set
   * from these exact numbers rather than a rounded "2 / 3": any mismatch makes
   * `object-cover` crop, and a crop slides every hotspot off its garment.
   */
  width: number;
  height: number;
  alt: string;
  /** Photographer — Unsplash does not require attribution, but crediting is right. */
  credit: string;
  items: ShowcaseItem[];
}

export const SHOWCASE_LOOKS: ShowcaseLook[] = [
  {
    id: "pink-knit",
    exampleId: "pink-outfit",
    label: "Pembe Triko",
    src: "/examples/look-pink-knit.jpg",
    width: 1100,
    height: 1649,
    alt: "Pembe fermuarlı triko ceket, siyah deri şort ve siyah beyaz bilekli sneaker giyen model",
    credit: "Vivek / Unsplash",
    items: [
      {
        id: "po-cardigan",
        box: { x: 0.377, y: 0.292, width: 0.235, height: 0.269 },
      },
      {
        id: "po-shorts",
        box: { x: 0.353, y: 0.506, width: 0.247, height: 0.08 },
      },
      {
        id: "po-sneakers",
        box: { x: 0.393, y: 0.791, width: 0.227, height: 0.14 },
      },
    ],
  },
  {
    id: "biker",
    exampleId: "biker-look",
    label: "Deri Ceket",
    src: "/examples/look-biker.jpg",
    width: 1100,
    height: 1656,
    alt: "Siyah deri biker ceket, siyah askılı body ve yüksek bel jean giyen model",
    credit: "Maks Styazhkin / Unsplash",
    items: [
      {
        id: "bk-jacket",
        box: { x: 0.342, y: 0.352, width: 0.233, height: 0.423 },
      },
      {
        id: "bk-body",
        box: { x: 0.567, y: 0.365, width: 0.196, height: 0.275 },
      },
      {
        id: "bk-jeans",
        box: { x: 0.437, y: 0.626, width: 0.346, height: 0.364 },
      },
      {
        id: "bk-sunglasses",
        box: { x: 0.328, y: 0.825, width: 0.077, height: 0.044 },
      },
    ],
  },
  {
    id: "longcoat",
    exampleId: "long-coat",
    label: "Uzun Kaban",
    src: "/examples/look-longcoat.jpg",
    width: 1100,
    height: 1375,
    alt: "Uzun siyah kaban, yırtık boyfriend jean, desenli bere ve topuklu sandalet giyen model",
    credit: "Behrooz / Unsplash",
    items: [
      {
        id: "lc-coat",
        box: { x: 0.408, y: 0.237, width: 0.259, height: 0.339 },
      },
      {
        id: "lc-beanie",
        box: { x: 0.422, y: 0.104, width: 0.128, height: 0.076 },
      },
      {
        id: "lc-jeans",
        box: { x: 0.342, y: 0.424, width: 0.338, height: 0.347 },
      },
      {
        id: "lc-sandals",
        box: { x: 0.325, y: 0.789, width: 0.333, height: 0.107 },
      },
    ],
  },
  {
    id: "blazer",
    exampleId: "black-blazer",
    label: "Oversize Blazer",
    src: "/examples/look-blazer.jpg",
    width: 1100,
    height: 1375,
    alt: "Oversize siyah blazer, kırmızı mat ruj ve ince bantlı topuklu sandalet ile model",
    credit: "Zaven Baghdasaryan / Unsplash",
    items: [
      {
        id: "bb-blazer",
        box: { x: 0.353, y: 0.247, width: 0.297, height: 0.32 },
      },
      {
        id: "bb-lip",
        box: { x: 0.487, y: 0.235, width: 0.038, height: 0.016 },
      },
      {
        id: "bb-heels",
        box: { x: 0.4, y: 0.704, width: 0.125, height: 0.216 },
      },
    ],
  },
];

/** Fallback plate, so a missing asset never renders as a broken hero image. */
export const SHOWCASE_FALLBACK = {
  src: "/examples/showcase-fallback.svg",
  alt: "Örnek tarama görseli yüklenemedi",
};

/** How long each item holds focus in the auto-play cycle, in ms. */
export const SHOWCASE_INTERVAL_MS = 3000;

/**
 * Box lookup for `mockCatalog.ts`, so the hero preview and the `/analyze`
 * overlay are driven by one definition. Throws rather than falling back: a
 * silently misplaced hotspot is harder to notice than a failed build.
 */
export function showcaseBox(exampleId: ExampleId, itemId: string): BoundingBox {
  const look = SHOWCASE_LOOKS.find((entry) => entry.exampleId === exampleId);
  if (!look) throw new Error(`Unknown showcase look: ${exampleId}`);

  const item = look.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error(`Unknown showcase item: ${exampleId}/${itemId}`);

  return item.box;
}
