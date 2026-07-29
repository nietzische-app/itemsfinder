import type { ExampleImage } from "@/types";

/**
 * Demo screenshots shipped with the app. The mock detection scenarios in
 * `mockCatalog.ts` have bounding boxes hand-tuned to these exact images, so
 * changing an illustration means re-checking the boxes for its `id`.
 */
export const EXAMPLE_IMAGES: ExampleImage[] = [
  {
    id: "streetwear",
    label: "Streetwear outfit",
    description: "Leather jacket, crop top, straight jeans, platform sneakers",
    src: "/examples/streetwear.svg",
  },
  {
    id: "glam-makeup",
    label: "Glam makeup look",
    description: "Red matte lip, bronze smokey eye, winged liner, glow",
    src: "/examples/glam-makeup.svg",
  },
];
