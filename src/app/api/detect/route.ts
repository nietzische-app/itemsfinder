import { NextResponse } from "next/server";

import {
  MockVisualSearchService,
  getVisualSearchService,
} from "@/services/visualSearch";
import type { DetectRequestBody, DetectResponse, ExampleId } from "@/types";

/** Vision calls are outbound HTTP, so this must not be statically evaluated. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Formats we accept. SVG is included for the bundled example screenshots. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
]);

/** ~10 MB of decoded image; base64 inflates by roughly 4/3. */
const MAX_BASE64_LENGTH = Math.ceil((10 * 1024 * 1024 * 4) / 3);

const VALID_EXAMPLE_IDS: ExampleId[] = [
  "streetwear",
  "glam-makeup",
  "tailoring",
  "soft-minimal",
];

function fail(message: string, status: number) {
  return NextResponse.json<DetectResponse>({ ok: false, error: message }, { status });
}

/**
 * Splits a data URL into its MIME type and raw base64 payload.
 * Returns null for anything that is not a well-formed base64 image data URL.
 */
function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(value);
  if (!match) return null;

  return { mimeType: match[1]!.toLowerCase(), base64: match[2]! };
}

export async function POST(request: Request) {
  let body: DetectRequestBody;

  try {
    body = (await request.json()) as DetectRequestBody;
  } catch {
    return fail("Request body must be JSON.", 400);
  }

  if (typeof body?.image !== "string" || body.image.length === 0) {
    return fail("No image provided.", 400);
  }

  const parsed = parseDataUrl(body.image);
  if (!parsed) {
    return fail("Image must be a base64 data URL.", 400);
  }

  if (!ALLOWED_MIME_TYPES.has(parsed.mimeType)) {
    return fail("Unsupported image format. Use JPG, PNG or WebP.", 415);
  }

  if (parsed.base64.length > MAX_BASE64_LENGTH) {
    return fail("That image is too large. Keep screenshots under 10 MB.", 413);
  }

  // Only trust `exampleId` when it names a demo image we actually ship.
  const exampleId = VALID_EXAMPLE_IDS.includes(body.exampleId as ExampleId)
    ? (body.exampleId as ExampleId)
    : undefined;

  const service = getVisualSearchService();

  try {
    const result = await service.analyze({
      imageBase64: parsed.base64,
      mimeType: parsed.mimeType,
      exampleId,
      // Abandon live lookups as soon as the client goes away; live product
      // resolution is the slow part and every call costs credits.
      signal: request.signal,
    });

    return NextResponse.json<DetectResponse>({ ok: true, result });
  } catch (error) {
    console.error("[detect] visual search failed:", error);

    // If the live detector is down or misconfigured we still want a usable
    // demo. The response carries `source`/`productSource`, which the UI shows
    // as a badge, so degraded mode is never passed off as live data.
    if (service.source !== "mock") {
      try {
        const fallback = await new MockVisualSearchService(0).analyze({
          imageBase64: parsed.base64,
          mimeType: parsed.mimeType,
          exampleId,
        });

        return NextResponse.json<DetectResponse>({ ok: true, result: fallback });
      } catch (fallbackError) {
        console.error("[detect] mock fallback failed:", fallbackError);
      }
    }

    return fail("We couldn't analyse that image. Please try again.", 502);
  }
}
