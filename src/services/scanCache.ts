import "server-only";

import { createHash } from "node:crypto";

import type { DetectionResult } from "@/types";
import { buildIdSource } from "@/lib/buildId";

/**
 * Result cache, keyed by the image itself.
 *
 * Scanning the same photograph twice costs twice: one Cloud Vision call, up to
 * four model calls, a live product search plus extracts, and several image
 * fetches. Nothing about that second scan is new work — and it does not even
 * produce the same answer, because the model stage is sampled. So a user who
 * reloads the page gets a different result for the same picture, which is a bug
 * dressed as a feature.
 *
 * Keyed on a hash of the decoded bytes rather than the base64 text, so a client
 * that re-encodes the same photograph still hits.
 *
 * ## What is stored, and what is not
 *
 * **The photograph is never stored.** What goes in is a hash of it and the result:
 * bounding boxes, garment labels, product matches. That distinction is the whole
 * KVKK argument and it has to stay true — a cache that "just also kept the image
 * for debugging" would turn a latency optimisation into a personal-data store.
 *
 * The hash is still a pseudonymous handle on a specific photograph: anyone holding
 * the same file can retrieve the result computed for it. That is inherent to
 * content-addressed caching and is the reason for a short TTL rather than an
 * indefinite one — this is a cost and consistency measure, not an archive.
 *
 * Degraded results are not cached at all. Serving yesterday's budget-exhausted
 * catalogue answer to today's user, from a day when the budget is fine, would make
 * a temporary degradation permanent for that photograph.
 */

/** Seconds a cached result stays valid. A day: long enough to matter, short enough not to be an archive. */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export interface ScanCacheStore {
  readonly kind: "memory" | "redis" | "none";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/*  Stores                                                                    */
/* -------------------------------------------------------------------------- */

/** Does nothing, successfully. Selected when no cache is configured. */
export class NullScanCacheStore implements ScanCacheStore {
  readonly kind = "none" as const;
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<void> {}
}

/**
 * Process-local cache.
 *
 * On serverless this only helps within one warm instance, which is a real but
 * modest win — a user's own reload usually lands on the same instance. Bounded so
 * a long-lived instance cannot grow without limit; a result is a few kilobytes and
 * a few hundred of them is the point at which this stops being free.
 */
export class MemoryScanCacheStore implements ScanCacheStore {
  readonly kind = "memory" as const;

  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly maxEntries = 200) {}

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.entries.size >= this.maxEntries) {
      // Oldest insertion first. Not an LRU — a true LRU needs a read to reorder,
      // and for a bound this coarse the difference is not worth the bookkeeping.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

/** Upstash REST, the same provider the rate limiter uses. */
export class UpstashScanCacheStore implements ScanCacheStore {
  readonly kind = "redis" as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 2_000,
  ) {}

  async get(key: string): Promise<string | null> {
    const result = await this.command(["GET", key]);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(["SET", key, value, "EX", String(ttlSeconds)]);
  }

  private async command(command: string[]): Promise<unknown> {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([command]),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) throw new Error(`Upstash responded ${response.status}`);

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (payload?.[0]?.error) throw new Error(payload[0].error);
    return payload?.[0]?.result ?? null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Selection                                                                 */
/* -------------------------------------------------------------------------- */

let cached: ScanCacheStore | null = null;

export function getScanCacheStore(): ScanCacheStore {
  if (cached) return cached;

  if (process.env.ENABLE_SCAN_CACHE === "false") {
    cached = new NullScanCacheStore();
    return cached;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  cached = url && token ? new UpstashScanCacheStore(url, token) : new MemoryScanCacheStore();
  return cached;
}

/** Test seam. */
export function __setScanCacheStore(store: ScanCacheStore | null): void {
  cached = store;
}

export function scanCacheTtlSeconds(): number {
  const raw = Number.parseInt(process.env.SCAN_CACHE_TTL_SECONDS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_SECONDS;
}

/* -------------------------------------------------------------------------- */
/*  Key and access                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Boru hattının sürümü — anahtarın parçası.
 *
 * ## Neden
 *
 * Bu dosyanın kuralı aşağıda yazılı: **sonucu değiştiren her girdi anahtarın
 * parçası olmalı.** Boru hattının kendisi de öyle bir girdi, ve anahtarda
 * olmayan tek girdi oydu.
 *
 * Bugüne kadar görünmüyordu çünkü önbellek süreç-yereldi: her dağıtım yeni
 * instance demekti, yani kendiliğinden temizleniyordu. Upstash canlıya geçince
 * önbellek dağıtımdan uzun yaşamaya başladı ve şu ortaya çıktı — betimleme
 * aşaması eklendikten sonra bile aynı fotoğraf, aşama yokken hesaplanmış eski
 * cevabını vermeye devam etti. İki ayrı ölçüm bu yüzden boşa gitti; log'da
 * görünen tek şey `total: 48ms` ve «önbellekten döndü» idi.
 *
 * ## Bedeli
 *
 * Her dağıtımdan sonra ilk taramalar yeniden hesaplanıyor. Bu, önbelleğin ne
 * için var olduğuna göre doğru taraf: amaç **aynı işi iki kez yapmamak**, eski
 * bir boru hattının cevabını saklamak değil. Değişmeyen bir dağıtımda hiçbir şey
 * değişmiyor — sürüm sabit kaldıkça anahtar da sabit.
 *
 * Sıra: Vercel dağıtım kimliği, yoksa commit, yoksa elle verilen sürüm, yoksa
 * sabit. Sonuncusu yerel geliştirmeyi kapsıyor — orada her `next dev`
 * yeniden başlatmasında önbelleği düşürmenin bir faydası olmazdı.
 */
function pipelineVersion(): string {
  // Kimlik `lib/buildId` tek yerinden okunuyor: log bir dağıtımı gösterirken
  // önbelleğin başkasına göre anahtarlanması, ancak üretimde görülebilecek bir
  // ayrışma olurdu.
  const source = buildIdSource();

  if (!source) return "v1";

  // Kısaltılıyor: anahtarın okunabilir kalması teşhiste işe yarıyor, ve
  // çarpışma riski burada bir sürüm etiketi için anlamsız derecede küçük.
  return createHash("sha256").update(source).digest("hex").slice(0, 8);
}

/**
 * Cache key for one scan.
 *
 * The example id is part of it because the same bytes uploaded as a demo and as a
 * user file take different paths through the mock engine, and a shared entry would
 * hand one the other's answer.
 */
export function scanCacheKey(
  imageBytes: Buffer,
  exampleId?: string,
  /**
   * Kimin için arandığı da anahtara giriyor.
   *
   * Girmeseydi seçimi değiştiren kullanıcı, önceki seçimle hesaplanmış sonucu
   * geri alırdı — ve bu, çalışmayan bir seçici gibi görünürdü. Sonucu değiştiren
   * her girdi anahtarın parçası olmalı.
   */
  shopperGender?: string,
): string {
  const digest = createHash("sha256").update(imageBytes).digest("hex").slice(0, 32);
  return `scan:${pipelineVersion()}:${digest}:${exampleId ?? "-"}:${shopperGender ?? "-"}`;
}

/**
 * Reads a cached result, or null.
 *
 * Never throws: a cache that is down has to cost latency, not correctness. A read
 * failure means "no hit", and the scan runs as if the cache were not there.
 */
export async function readCachedScan(key: string): Promise<DetectionResult | null> {
  try {
    const raw = await getScanCacheStore().get(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DetectionResult;
    // A stored shape from an older deploy must not be handed to a client that has
    // since changed. One cheap structural check beats a version bump nobody
    // remembers to make.
    return Array.isArray(parsed?.items) ? parsed : null;
  } catch (error) {
    console.warn("[cache] read failed, scanning fresh:", error);
    return null;
  }
}

/**
 * Stores a result, unless it is one that should not be repeated.
 *
 * Degraded answers are skipped: a scan that fell back to the catalogue because the
 * budget was nearly spent, or because Vision was down, is a snapshot of a bad
 * moment. Caching it would keep serving that moment for a day.
 */
export async function writeCachedScan(
  key: string,
  result: DetectionResult,
  options: { degraded?: boolean } = {},
): Promise<void> {
  if (options.degraded) return;

  try {
    // The trace is per-request — timings and degradation notes from the scan that
    // happened to miss. Replaying them on a hit would report a Vision call that
    // did not occur.
    const { trace: _trace, ...storable } = result;
    await getScanCacheStore().set(key, JSON.stringify(storable), scanCacheTtlSeconds());
  } catch (error) {
    console.warn("[cache] write failed:", error);
  }
}
