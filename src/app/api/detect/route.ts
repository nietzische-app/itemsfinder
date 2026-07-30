import { NextResponse } from "next/server";

import { inspectUpload } from "@/services/imageDecode";
import {
  MockVisualSearchService,
  getVisualSearchService,
} from "@/services/visualSearch";
import type { DetectRequestBody, DetectResponse, ExampleId } from "@/types";

/** Vision calls are outbound HTTP, so this must not be statically evaluated. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel serverless budget for this route, in seconds.
 *
 * A scan is Vision (a couple of seconds) followed by the optional Context.dev
 * stage, which is bounded by `CONTEXT_DEV_DEADLINE_MS` (45s by default). 60s
 * leaves headroom above that; the live stage's deadline must always stay below
 * this number, or the function is killed mid-flight and the client gets a
 * platform error instead of the catalogue fallback the deadline exists to
 * trigger.
 *
 * 60s is the ceiling on Vercel's Hobby plan. Paid plans allow more, so if
 * `CONTEXT_DEV_DEADLINE_MS` is raised, raise this with it.
 */
export const maxDuration = 60;

/**
 * ~10 MB of encoded image; base64 inflates by roughly 4/3.
 *
 * This bounds the *transfer*, and nothing else. It does not bound pixels: a
 * 9000×9000 PNG is 248 KB. `inspectUpload` is what stops that one.
 */
const MAX_BASE64_LENGTH = Math.ceil((10 * 1024 * 1024 * 4) / 3);

const VALID_EXAMPLE_IDS: ExampleId[] = [
  "pink-outfit",
  "biker-look",
  "long-coat",
  "black-blazer",
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
    return fail("İstek gövdesi JSON olmalı.", 400);
  }

  if (typeof body?.image !== "string" || body.image.length === 0) {
    return fail("Görsel gönderilmedi.", 400);
  }

  const parsed = parseDataUrl(body.image);
  if (!parsed) {
    return fail("Görsel base64 data URL olmalı.", 400);
  }

  if (parsed.base64.length > MAX_BASE64_LENGTH) {
    return fail("Görsel çok büyük. 10 MB altında tut.", 413);
  }

  /*
   * Everything above this point trusted the request's own description of itself.
   * `inspectUpload` reads the bytes: what format they actually are, whether that
   * matches what was claimed, and how many pixels they decode to. The last of
   * those is the one that mattered — the size check above passes an 81-megapixel
   * PNG at 248 KB, and the pipeline decodes each upload several times over.
   */
  const buffer = Buffer.from(parsed.base64, "base64");
  const inspected = await inspectUpload(buffer, parsed.mimeType);

  if (!inspected.ok) {
    // Logged with the reason, answered without it: the caller does not need to be
    // told which check caught them.
    console.warn(`[detect] upload rejected (${inspected.reason}): ${inspected.detail}`);

    if (inspected.reason === "too-many-pixels") {
      return fail("Görselin çözünürlüğü çok yüksek. 50 megapikselin altında olmalı.", 413);
    }
    return fail("Desteklenmeyen görsel formatı. JPG, PNG veya WEBP kullan.", 415);
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

    return fail("Görseli analiz edemedik. Lütfen tekrar dene.", 502);
  }
}
