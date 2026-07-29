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
    category: "Streetwear",
    title: "Modern Nomad",
    description: "Leather jacket, crop top, straight jeans, platform sneakers",
    src: "/examples/streetwear.svg",
  },
  {
    id: "glam-makeup",
    category: "Beauty",
    title: "Coral Glow",
    description: "Red matte lip, bronze smokey eye, winged liner, gold hoops",
    src: "/examples/glam-makeup.svg",
    tall: true,
  },
  {
    id: "tailoring",
    category: "Tailoring",
    title: "Midnight Executive",
    description: "Wool blazer, pleated trousers, chelsea boots, leather tote",
    src: "/examples/tailoring.svg",
  },
  {
    id: "soft-minimal",
    category: "Textures",
    title: "Soft Minimalist",
    description: "Cable knit, silk scarf, pearl drops, rosewood lip",
    src: "/examples/soft-minimal.svg",
    tall: true,
  },
];
