/**
 * Colour bucketing for the eval.
 *
 * The implementation moved into `src/lib/colorFamily.ts` when the live product
 * stage needed the same answer: it has to know whether a listing's colour word
 * contradicts what was measured, and two copies of a rule the eval has already
 * corrected twice would drift apart. The eval keeps this name because it reads as
 * what it is here — the bucket a score is compared against.
 */
export { colorFamilyOf as colorBucketOf } from "@/lib/colorFamily";
export type { ColorFamily as ColorBucket } from "@/lib/colorFamily";
