import {
  bodyPosition,
  boxArea,
  dedupeDetections,
  familyFitsBody,
  type DedupeOptions,
  type DetectionCandidate,
} from "@/lib/detectionFilter";
import { familyOf } from "@/lib/itemFamily";
import { categorizeLabel } from "@/services/visualSearch";
import type { BoundingBox } from "@/types";

/**
 * Replays a recorded Cloud Vision response through the detection cleanup.
 *
 * Extracted so the eval and the parameter sweep run **the same pipeline**. A sweep
 * that optimises a slightly different filter than the one that ships is worse than
 * no sweep — it produces confident numbers for code nobody runs.
 *
 * It mirrors `GoogleVisionSearchService.analyze` up to the point where products get
 * involved: harvest the person box, drop what is not shoppable, drop what the body
 * geometry rules out, then deduplicate.
 */

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionObject {
  name?: string;
  score?: number;
  boundingPoly?: { normalizedVertices?: VisionVertex[] };
}

export interface VisionFixture {
  responses?: Array<{ localizedObjectAnnotations?: VisionObject[] }>;
}

const PERSON = /person|human|woman|man|girl|boy/i;

function toBox(vertices: VisionVertex[] = []): BoundingBox | null {
  if (vertices.length === 0) return null;

  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);

  const x = Math.max(0, Math.min(...xs));
  const y = Math.max(0, Math.min(...ys));
  const width = Math.min(1, Math.max(...xs)) - x;
  const height = Math.min(1, Math.max(...ys)) - y;

  return width > 0.01 && height > 0.01 ? { x, y, width, height } : null;
}

export interface Replay {
  /** Every shoppable candidate, before deduplication. */
  candidates: DetectionCandidate[];
  /** What the pipeline would turn into hotspots. */
  detections: DetectionCandidate[];
  /** The person box, or null when Vision found nobody. */
  person: BoundingBox | null;
  /** Raw object count in the fixture, for the "N raw -> M hotspots" line. */
  rawCount: number;
  /** Candidates dropped by the body-geometry rule, for diagnosis. */
  droppedByBody: number;
}

export function replayVisionFixture(
  fixture: VisionFixture,
  dedupeOptions: DedupeOptions = {},
): Replay {
  const objects = fixture?.responses?.[0]?.localizedObjectAnnotations ?? [];

  const person =
    objects
      .filter((object) => PERSON.test(object.name ?? ""))
      .map((object) => toBox(object.boundingPoly?.normalizedVertices))
      .filter((box): box is BoundingBox => box !== null)
      .sort((a, b) => boxArea(b) - boxArea(a))[0] ?? null;

  const shoppable: DetectionCandidate[] = [];
  let droppedByBody = 0;

  for (const object of objects) {
    const name = object.name?.trim();
    if (!name || PERSON.test(name)) continue;
    // Furniture, plants and the rest are not products; the app drops them here too.
    if (!categorizeLabel(name)) continue;

    const box = toBox(object.boundingPoly?.normalizedVertices);
    if (!box) continue;

    const family = familyOf(name);

    if (!familyFitsBody(family, bodyPosition(box, person))) {
      droppedByBody += 1;
      continue;
    }

    shoppable.push({ name, score: object.score ?? 0, box, family });
  }

  return {
    candidates: shoppable,
    detections: dedupeDetections(shoppable, dedupeOptions),
    person,
    rawCount: objects.length,
    droppedByBody,
  };
}
