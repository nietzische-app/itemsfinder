import { NextResponse } from "next/server";

import {
  createTrace,
  logScanTrace,
  scanDetailEnabled,
  type TraceCollector,
} from "@/lib/scanTrace";
import { inspectUpload, openImage } from "@/services/imageDecode";
import { measureChrome } from "@/services/screenshotChrome";
import { readCachedScan, scanCacheKey, writeCachedScan } from "@/services/scanCache";
import { checkRateLimit, rateLimitMessage } from "@/services/rateLimit";
import {
  MockVisualSearchService,
  getVisualSearchService,
} from "@/services/visualSearch";
import type { DetectRequestBody, DetectResponse, DetectionResult, ExampleId } from "@/types";

/** Vision calls are outbound HTTP, so this must not be statically evaluated. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel serverless budget for this route, in seconds.
 *
 * A scan is Vision, then optional VLM attributes (`VLM_DEADLINE_MS`, 10s by
 * default), then the optional Context.dev stage (`CONTEXT_DEV_DEADLINE_MS`,
 * 25s by default). 60s leaves ~25s of headroom above that sum; the live stage's
 * deadline must always stay below this number, or the function is killed
 * mid-flight and the client gets a platform error instead of the catalogue
 * fallback the deadline exists to trigger.
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

function fail(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json<DetectResponse>({ ok: false, error: message }, { status, headers });
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
  /*
   * Before the body is read, so an abusive client is refused without us buying the
   * bandwidth for its 10 MB payload first.
   *
   * A refusal is a refusal — not a silent fall back to the mock engine. Serving
   * demo data under the badge of a real scan would be lying to a user who did
   * nothing wrong except arrive on a busy day.
   */
  const limit = await checkRateLimit(request.headers);

  if (!limit.allowed) {
    return fail(
      rateLimitMessage(limit.reason),
      // A per-client refusal is the client's to retry; an exhausted budget is
      // ours, and 503 is the honest code for "this service, not you".
      limit.reason === "budget" ? 503 : 429,
      { "retry-after": String(limit.retryAfterSeconds) },
    );
  }

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
  const trace = createTrace();

  /*
   * Ekran görüntüsünden gelen arayüz şeritlerini kırp.
   *
   * Kullanıcılar kombinleri Instagram'dan ekran görüntüsü olarak getiriyor ve
   * durum çubuğu, sekme çubuğu, beğeni satırı kombinin parçası değil — ama boru
   * hattının her aşaması onları fotoğrafın parçası sayıyor. En pahalısı arka plan
   * modeli: paleti «tespitlerin ve kişinin dışı»ndan öğreniyor, ki bir ekran
   * görüntüsünde orası arayüzün kendisi.
   *
   * Tespitin **öncesinde**, çünkü kutu koordinatları kareye göre normalleniyor;
   * sonradan kırpmak her kutuyu kaydırırdı.
   *
   * Bulamazsa hiçbir şey yapmıyor ve bu sıradan durum: 57 gerçek fotoğrafın
   * 55'inde kırpma yok, ikisinde de kırpılan gerçekten tek renk bir bant.
   */
  const chrome = await measureChrome(buffer);
  let image = { base64: parsed.base64, mimeType: parsed.mimeType };

  if (chrome.box) {
    try {
      const cropped = await openImage(buffer).extract(chrome.box).png().toBuffer();
      image = { base64: cropped.toString("base64"), mimeType: "image/png" };
      /*
       * `trace.degrade` değil: o dizi «aşama geriledi» demek ve arayüzde amber bir
       * uyarı olarak çiziliyor. Şerit kırpmak bir gerileme değil iyileştirme;
       * oraya yazmak, çalışan bir taramayı sorunlu göstermek olurdu.
       */
      console.log(`[detect] ${chrome.reason} (${chrome.box.width}×${chrome.box.height})`);
    } catch (error) {
      // Kırpma bir iyileştirme; başarısız olması taramayı durdurmamalı.
      console.warn("[detect] arayüz şeridi kırpılamadı:", error);
    }
  }

  /*
   * Same photograph, same answer — and paid for once.
   *
   * The key is a hash of the decoded bytes. The photograph itself is never
   * stored; see `services/scanCache.ts` for why that distinction is the whole
   * KVKK argument.
   */
  const cacheKey = scanCacheKey(buffer, exampleId);
  const hit = await readCachedScan(cacheKey);

  if (hit) {
    trace.degrade("total", "önbellekten döndü — yeni çağrı yapılmadı");
    /*
     * Teşhis izi önbellekten dönen cevaba da takılıyor.
     *
     * Önbellek izi bilerek saklamıyor (başka bir isteğin süreleri bu isteği
     * anlatmaz), ama izi hiç takmamak paneli **tamamen** yok ediyordu: aynı
     * fotoğrafı ikinci kez tarayan biri «Tarama teşhisi» başlığını göremiyor ve
     * panelin bozuk olduğunu sanıyor. Buradaki iz bu isteğe ait ve doğru olanı
     * söylüyor — süreler gerçekten sıfıra yakın, çünkü gerçekten çağrı yapılmadı.
     */
    return NextResponse.json<DetectResponse>(
      { ok: true, result: withTrace(hit, trace, `${service.source}+cache`) },
      // Visible to whoever is debugging, and honest about where the answer came
      // from without dressing it up in the UI as something different.
      { headers: { "x-markas-cache": "hit" } },
    );
  }

  try {
    const result = await service.analyze({
      imageBase64: image.base64,
      mimeType: image.mimeType,
      exampleId,
      budgetConstrained: limit.degraded,
      // Abandon live lookups as soon as the client goes away; live product
      // resolution is the slow part and every call costs credits.
      signal: request.signal,
      trace,
    });

    await writeCachedScan(cacheKey, result, {
      // A scan that ran without the paid stages, or that fell back to the mock
      // engine, is a snapshot of a bad moment. Keeping it for a day would make a
      // temporary degradation permanent for this photograph.
      degraded: limit.degraded || service.source === "mock",
    });

    return NextResponse.json<DetectResponse>(
      { ok: true, result: withTrace(result, trace, service.source) },
      { headers: { "x-markas-cache": "miss" } },
    );
  } catch (error) {
    console.error("[detect] visual search failed:", error);
    trace.degrade("vision", `dedektör hata verdi: ${errorLabel(error)}`);

    // If the live detector is down or misconfigured we still want a usable
    // demo. The response carries `source`/`productSource`, which the UI shows
    // as a badge, so degraded mode is never passed off as live data.
    if (service.source !== "mock") {
      try {
        const fallback = await new MockVisualSearchService(0).analyze({
          imageBase64: image.base64,
          mimeType: image.mimeType,
          exampleId,
        });

        return NextResponse.json<DetectResponse>({
          ok: true,
          result: withTrace(fallback, trace, "mock-fallback"),
        });
      } catch (fallbackError) {
        console.error("[detect] mock fallback failed:", fallbackError);
        trace.degrade("total", "mock yedeği de başarısız");
      }
    }

    logScanTrace(trace.snapshot(), { id: "-", source: service.source });
    return fail("Görseli analiz edemedik. Lütfen tekrar dene.", 502);
  }
}

/** The class of failure, without leaking a stack trace or a URL into the log. */
function errorLabel(error: unknown): string {
  if (error instanceof Error) return error.name === "Error" ? error.message.slice(0, 80) : error.name;
  return "bilinmeyen";
}

/**
 * Logs the trace and attaches the part of it the client should see.
 *
 * Timings and degradation always travel: they are a handful of numbers and short
 * strings, and they are what turns "the scan was slow" or "why is this a catalogue
 * price" into an answerable question. The box-by-box detail is behind
 * `ENABLE_SCAN_DETAIL` because it is kilobytes and only means anything to someone
 * reading it.
 */
function withTrace(result: DetectionResult, trace: TraceCollector, source: string): DetectionResult {
  const snapshot = trace.snapshot();
  logScanTrace(snapshot, { id: result.id, source });

  return {
    ...result,
    trace: scanDetailEnabled()
      ? snapshot
      : { ...snapshot, dropped: [], rejected: [] },
  };
}
