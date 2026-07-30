import "server-only";

/**
 * Counter storage for the rate limiter.
 *
 * Behind an interface because the provider decision and the limiter are separate
 * problems: the window arithmetic, the tiers and the route wiring are the same
 * whether the counters live in a Map or in Redis, and a deployment that has not
 * picked a provider yet should still be able to run and be tested.
 *
 * Two operations, because that is all an approximated sliding window needs:
 * increment-with-TTL and read. Anything richer would tie the limiter to one
 * store's feature set.
 */
export interface RateLimitStore {
  readonly kind: "memory" | "redis";
  /**
   * Increments `key` and returns its new value, setting `ttlSeconds` when the key
   * is created. Must not extend the TTL of an existing key — a window that keeps
   * sliding its own expiry never expires.
   */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Current value, or 0. Must not create the key. */
  read(key: string): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/*  In-memory                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Process-local counters.
 *
 * **Correct in development, useless in production.** A serverless deployment runs
 * many instances and they share nothing, so a limit of six per minute becomes six
 * per minute *per instance* — which is not a limit, it is a suggestion. The
 * factory below refuses to select this silently when it looks like production.
 *
 * It exists so the limiter can be developed, tested and reasoned about before a
 * Redis is provisioned, and so `npm run dev` behaves like production rather than
 * having the limiter switched off.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly kind = "memory" as const;

  private readonly counters = new Map<string, { value: number; expiresAt: number }>();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    this.sweep();

    const now = Date.now();
    const existing = this.counters.get(key);

    if (existing && existing.expiresAt > now) {
      existing.value += 1;
      return existing.value;
    }

    this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
    return 1;
  }

  async read(key: string): Promise<number> {
    const entry = this.counters.get(key);
    return entry && entry.expiresAt > Date.now() ? entry.value : 0;
  }

  /**
   * Drops expired keys.
   *
   * Without this the Map is an unbounded leak keyed on client IP, which is a
   * denial-of-service of its own — the thing being defended against would fill
   * memory with the evidence.
   */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.counters.entries())) {
      if (entry.expiresAt <= now) this.counters.delete(key);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Upstash Redis over REST                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Counters in Upstash Redis, over its REST API.
 *
 * REST rather than a Redis client because a serverless function has nowhere to
 * keep a connection pool; every invocation would open and drop a socket.
 *
 * "Vercel KV" and "Upstash Redis" are the same service — Vercel KV was Upstash
 * with Vercel's branding, and Vercel now provisions Upstash through its
 * marketplace. Either one sets the two variables this reads.
 */
export class UpstashRateLimitStore implements RateLimitStore {
  readonly kind = "redis" as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 2_000,
  ) {}

  /**
   * INCR then EXPIRE ... NX, in one pipelined round trip.
   *
   * `NX` is what keeps the TTL from being pushed forward on every request: the
   * expiry is set when the window opens and not touched again, so the window
   * actually closes.
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const results = await this.pipeline([
      ["INCR", key],
      ["EXPIRE", key, String(ttlSeconds), "NX"],
    ]);

    const value = Number(results?.[0]);
    return Number.isFinite(value) ? value : 0;
  }

  async read(key: string): Promise<number> {
    const results = await this.pipeline([["GET", key]]);
    const value = Number(results?.[0] ?? 0);
    return Number.isFinite(value) ? value : 0;
  }

  private async pipeline(commands: string[][]): Promise<unknown[] | null> {
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Upstash responded ${response.status}`);
    }

    const payload = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(payload)) throw new Error("Upstash returned a non-array pipeline result");

    const failed = payload.find((entry) => entry?.error);
    if (failed) throw new Error(`Upstash command failed: ${failed.error}`);

    return payload.map((entry) => entry?.result ?? null);
  }
}

/* -------------------------------------------------------------------------- */
/*  Selection                                                                 */
/* -------------------------------------------------------------------------- */

let cached: RateLimitStore | null = null;

/**
 * The store for this deployment.
 *
 * Memoised: the limiter runs on every request and rebuilding the memory store
 * would reset the counters it exists to keep.
 */
export function getRateLimitStore(): RateLimitStore {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (url && token) {
    cached = new UpstashRateLimitStore(url, token);
    return cached;
  }

  /*
   * Said once, loudly. A process-local counter in a serverless deployment is not
   * a rate limit, and the failure mode is silent — everything works, nothing is
   * bounded, and the first sign is the bill.
   */
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[ratelimit] No UPSTASH_REDIS_REST_URL/TOKEN, so counters are process-local. " +
        "Serverless instances share nothing, which makes the per-IP limits " +
        "per-instance limits. Provision a Redis before taking real traffic.",
    );
  }

  cached = new MemoryRateLimitStore();
  return cached;
}

/** Test seam: drops the memoised store so a suite can swap the environment. */
export function resetRateLimitStore(): void {
  cached = null;
}
