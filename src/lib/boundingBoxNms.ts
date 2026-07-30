import type { BoundingBox } from "@/types";

/**
 * Non-maximum suppression for Vision detections.
 *
 * Cloud Vision often returns several overlapping boxes for the same garment
 * ("Top", "Outerwear", "Clothing") which turns a 3-piece outfit into a cluttered
 * field of hotspots. This module collapses those into one primary detection.
 */

/** Intersection-over-union of two normalised boxes. */
export function boxIou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const intersection = iw * ih;
  if (intersection <= 0) return 0;

  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Euclidean distance between box centres, in normalised image units. */
export function boxCenterDistance(a: BoundingBox, b: BoundingBox): number {
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  const dx = acx - bcx;
  const dy = acy - bcy;
  return Math.hypot(dx, dy);
}

export interface NmsOptions {
  /** Drop boxes that overlap a kept box by more than this IoU. */
  iouThreshold?: number;
  /**
   * Also drop boxes whose centre falls within this normalised radius of a kept
   * box — catches near-duplicates that barely overlap (e.g. nested "Top" inside
   * "Outerwear").
   */
  centerRadius?: number;
  /** Hard ceiling after suppression. */
  maxItems?: number;
}

export interface ScoredBox {
  boundingBox: BoundingBox;
  score: number;
}

/**
 * Greedy NMS: keep highest-scoring boxes, suppress anything that overlaps or
 * sits too close to one already kept. Input order does not matter.
 */
export function nonMaxSuppression<T extends ScoredBox>(
  items: T[],
  options: NmsOptions = {},
): T[] {
  const iouThreshold = options.iouThreshold ?? 0.4;
  const centerRadius = options.centerRadius ?? 0.08;
  const maxItems = options.maxItems ?? 4;

  const ranked = [...items].sort((a, b) => b.score - a.score);
  const kept: T[] = [];

  for (const candidate of ranked) {
    if (kept.length >= maxItems) break;

    const conflicts = kept.some((winner) => {
      const iou = boxIou(winner.boundingBox, candidate.boundingBox);
      if (iou >= iouThreshold) return true;
      return boxCenterDistance(winner.boundingBox, candidate.boundingBox) <= centerRadius;
    });

    if (!conflicts) kept.push(candidate);
  }

  return kept;
}
