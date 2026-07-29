import type { ExampleImage } from "@/types";

/**
 * Curated demo looks shipped with the app. The mock detection scenarios in
 * `mockCatalog.ts` have bounding boxes hand-tuned to these exact images, so
 * changing an illustration means re-checking the boxes for its `id`.
 *
 * `tall` staggers the masonry grid — the design system calls for an organic,
 * Pinterest-style flow rather than a uniform row.
 */
export const EXAMPLE_IMAGES: ExampleImage[] = [
  {
    id: "streetwear",
    category: "Sokak Stili",
    title: "Şehirli Göçebe",
    description: "Deri ceket, crop üst, düz paça jean, platform sneaker",
    src: "/examples/streetwear.svg",
  },
  {
    id: "glam-makeup",
    category: "Güzellik",
    title: "Mercan Işıltı",
    description: "Kırmızı mat ruj, bronz smokey göz, kanatlı eyeliner, halka küpe",
    src: "/examples/glam-makeup.svg",
    tall: true,
  },
  {
    id: "tailoring",
    category: "Terzi Kesim",
    title: "Gece Zarafeti",
    description: "Yün blazer, pileli pantolon, chelsea bot, deri çanta",
    src: "/examples/tailoring.svg",
  },
  {
    id: "soft-minimal",
    category: "Dokular",
    title: "Yumuşak Minimalizm",
    description: "Saç örgü kazak, ipek fular, inci küpe, gül ağacı ruj",
    src: "/examples/soft-minimal.svg",
    tall: true,
  },
];
