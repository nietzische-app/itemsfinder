import "server-only";

/**
 * Fetching a product image so it can be measured.
 *
 * These URLs come out of model-driven extraction of a retailer page, which means
 * they are attacker-adjacent input: whatever was on the page. So the fetch is
 * deliberately narrow — https only, one hop, a byte ceiling enforced *while*
 * reading rather than trusted from a header, an image content type, and a short
 * timeout. Anything else resolves to null and the row simply carries no visual
 * evidence.
 */

/** Product images are small; anything larger is not a product image. */
const MAX_BYTES = 3 * 1024 * 1024;

const TIMEOUT_MS = 4_000;

export interface RemoteImageOptions {
  signal?: AbortSignal;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Downloads an image, or null if it is unusable for any reason. */
export async function fetchRemoteImage(
  url: string,
  options: RemoteImageOptions = {},
): Promise<Buffer | null> {
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Plain http would let a downgrade rewrite the bytes we are about to measure,
  // and a data: URL is the catalogue's own SVG placeholder — nothing to fetch.
  if (parsed.protocol !== "https:") return null;

  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  const signal = options.signal ? anySignal([options.signal, timeout]) : timeout;

  try {
    const response = await fetch(parsed, {
      // A retailer CDN has no business seeing which scan triggered the request.
      referrerPolicy: "no-referrer",
      redirect: "follow",
      signal,
    });

    if (!response.ok || !response.body) return null;

    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;

    // Content-Length is a claim, not a guarantee. It is used to reject early, and
    // the read below is what actually enforces the ceiling.
    const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }

    return total > 0 ? Buffer.concat(chunks) : null;
  } catch {
    return null;
  }
}

/**
 * First-to-abort of several signals. `AbortSignal.any` does this in one line but is
 * newer than the runtimes this has to work on.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}
