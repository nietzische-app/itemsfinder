import { iou } from "@/lib/detectionFilter";
import type { BoundingBox } from "@/types";

/**
 * Matching detections to ground-truth boxes, so box accuracy can be measured.
 *
 * This is the question nothing in the pipeline has ever answered: **is the box
 * actually on the garment?** Every stage downstream assumes it is — the colour is
 * measured inside it, the crop handed to the model is cut from it, the visual
 * descriptor compares it against a product photo. If the box is off the garment,
 * all of those are measuring the wrong pixels precisely.
 *
 * Matching has to be **one-to-one**. The eval's earlier version asked each truth
 * item for its best-overlapping detection independently, which lets a single
 * sprawling "Clothing" box claim to have found the jacket, the top *and* the
 * trousers. That reports a perfect recall for a detector that found one thing.
 */

export interface BoxMatch {
  truthIndex: number;
  detectionIndex: number;
  iou: number;
}

export interface MatchResult {
  matches: BoxMatch[];
  /** Ground-truth items no detection claimed — things the detector missed. */
  missedTruth: number[];
  /** Detections matching nothing — hotspots pointing at what the labeller ignored. */
  spuriousDetections: number[];
}

/**
 * Greedy one-to-one assignment, highest overlap first.
 *
 * Greedy rather than optimal (Hungarian): with at most a handful of boxes per
 * photo the two agree in practice, and greedy is inspectable — when a number looks
 * wrong you can follow which pair was taken first. If a future eval set has dense
 * overlapping annotations this is the thing to revisit.
 *
 * `threshold` is the overlap below which a pair is not a match at all. 0.5 is the
 * detection convention; the caller can lower it to ask a softer question ("did it
 * point roughly here?").
 */
export function matchBoxes(
  truth: BoundingBox[],
  detections: BoundingBox[],
  threshold = 0.5,
): MatchResult {
  const pairs: BoxMatch[] = [];

  for (let t = 0; t < truth.length; t += 1) {
    for (let d = 0; d < detections.length; d += 1) {
      const overlap = iou(truth[t]!, detections[d]!);
      if (overlap >= threshold) pairs.push({ truthIndex: t, detectionIndex: d, iou: overlap });
    }
  }

  pairs.sort((a, b) => b.iou - a.iou);

  const takenTruth = new Set<number>();
  const takenDetection = new Set<number>();
  const matches: BoxMatch[] = [];

  for (const pair of pairs) {
    if (takenTruth.has(pair.truthIndex) || takenDetection.has(pair.detectionIndex)) continue;
    takenTruth.add(pair.truthIndex);
    takenDetection.add(pair.detectionIndex);
    matches.push(pair);
  }

  return {
    matches,
    missedTruth: truth.map((_, index) => index).filter((index) => !takenTruth.has(index)),
    spuriousDetections: detections
      .map((_, index) => index)
      .filter((index) => !takenDetection.has(index)),
  };
}

/**
 * Best overlap available for each truth box, ignoring assignment.
 *
 * Separate from `matchBoxes` because it answers a different question: not "how many
 * did it find" but "when it did point at this garment, how well was it framed".
 * Reported as a distribution rather than a mean — one box at 0.05 and one at 0.95
 * averages to the same as two at 0.5, and those are not the same detector.
 */
export function bestOverlaps(truth: BoundingBox[], detections: BoundingBox[]): number[] {
  return truth.map((box) =>
    detections.reduce((best, detection) => Math.max(best, iou(box, detection)), 0),
  );
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

/** Fraction of `values` at or above `floor`. */
export function fractionAtLeast(values: number[], floor: number): number {
  if (values.length === 0) return 0;
  return values.filter((value) => value >= floor).length / values.length;
}
