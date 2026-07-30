import type { ExampleImage } from "@/types";

/**
 * Fixtures for the mock detection scenarios in `mockCatalog.ts`, whose bounding
 * boxes are hand-tuned to these exact images — changing an illustration means
 * re-checking the boxes for its `id`.
 *
 * These are no longer surfaced on the landing page: the illustration grid was
 * replaced by the photographic live-scan showcase (`src/lib/showcase.ts`). They
 * remain the scenario fixtures behind `exampleId`, which `/api/detect` still
 * accepts.
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
