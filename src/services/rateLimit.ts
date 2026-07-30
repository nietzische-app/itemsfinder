import "server-only";

import { getRateLimitStore, type RateLimitStore } from "@/services/rateLimitStore";

/**
 * Rate limiting and the daily budget ceiling for `/api/detect`.
 *
 * The endpoint is unauthenticated and every call spends money: a Cloud Vision
 * request, up to `VLM_MAX_ITEMS` model calls, a Context.dev search plus extracts,
 * and a handful of product-image fetches. A loop with `curl` could drain the whole
 * month's credits in an afternoon, and nothing would have said so.
 *
 * What this is **not**: authentication. Client IPs come from `x-forwarded-for`,
 * which the proxy in front sets and an attacker with a pool of addresses walks
 * around. It is a speed bump on casual abuse plus — the part that actually bounds
 * the loss — a global daily ceiling that does not care whose address it is.
 */

/* -------------------------------------------------------------------------- */
/*  Windows                                                                   */
/* -------------------------------------------------------------------------- */

const MINUTE_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * 60;

export interface RateLimitConfig {
  enabled: boolean;
  perMinute: number;
  perDay: number;
  /**
   * Scans allowed across all clients in a day. `0` disables the ceiling.
   *
   * Set it from what you are willing to spend, not from expected traffic: it is
   * the number that decides the worst case.
   */
  dailyBudget: number;
  /**
   * Fraction of the budget at which the paid enrichment stages switch off.
   *
   * Below this everything runs. Above it the scan still works — detection,
   * catalogue products, a real answer — but the model attribute pass and the live
   * product lookup stop, which is where most of the per-scan cost is. Degrading
   * before the ceiling means the last scans of the day are cheaper rather than the
   * ceiling arriving without warning.
   */
  degradeAt: number;
}

export type RateLimitOutcome =
  | { allowed: true; degraded: boolean; remaining: number }
  | { allowed: false; reason: "per-minute" | "per-day" | "budget"; retryAfterSeconds: number };

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readRateLimitConfig(): RateLimitConfig {
  return {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    perMinute: readInt(process.env.RATE_LIMIT_PER_MINUTE, 10),
    perDay: readInt(process.env.RATE_LIMIT_PER_DAY, 60),
    dailyBudget: readInt(process.env.SCAN_DAILY_BUDGET, 0),
    degradeAt: 0.8,
  };
}

/* -------------------------------------------------------------------------- */
/*  Client identity                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Best available client identifier.
 *
 * `x-forwarded-for` accumulates a list as a request crosses proxies; the *first*
 * entry is the original client and the rest are hops. Reading the last one instead
 * is a classic mistake that buckets an entire deployment behind one address.
 *
 * Everything here is client-influenced. It buckets honest traffic correctly, which
 * is what a rate limit is mostly for, and it is why the global ceiling exists
 * separately.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** UTC day stamp, so every instance agrees on when "today" started. */
function dayStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Check                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Approximated sliding window over two fixed windows.
 *
 * A plain fixed window lets a client spend its whole minute's allowance at 59.9s
 * and the next one at 60.1s — double the limit across a two-second span. Weighting
 * the previous window by how much of it is still in view smooths that out, at the
 * cost of being an estimate rather than an exact count. Two counters and one round
 * trip; an exact sliding window needs a sorted set per client and several.
 *
 * **It errs strict, and knowing which way matters.** The weight assumes the
 * previous window's requests were spread evenly through it. Real traffic is bursty,
 * so a client that spent its allowance in the first second of a window is still
 * counted as partly spending it a minute later: with a burst of four against a
 * limit of three, the block clears at about 70 seconds rather than 60. For an
 * endpoint that spends money on every call, a limiter that occasionally holds
 * someone an extra ten seconds is the right direction to be wrong in.
 *
 * Rejected requests are counted too. A client that respects `Retry-After` recovers
 * on schedule; one that hammers through the refusal keeps its own window topped up
 * and stays blocked, which is the behaviour worth having.
 */
function weightedCount(previous: number, current: number, elapsedFraction: number): number {
  return previous * (1 - elapsedFraction) + current;
}

export interface RateLimitDeps {
  store?: RateLimitStore;
  config?: RateLimitConfig;
  now?: number;
}

/**
 * Decides whether this request may run, and whether it must run cheaply.
 *
 * Fails **open**. If the counter store is unreachable the scan is allowed: a Redis
 * outage taking the product down would be a worse failure than an hour of
 * unthrottled traffic, and the daily ceiling is the thing that actually bounds the
 * bill. It is logged so the outage is visible rather than inferred from a bill.
 */
export async function checkRateLimit(
  headers: Headers,
  deps: RateLimitDeps = {},
): Promise<RateLimitOutcome> {
  const config = deps.config ?? readRateLimitConfig();
  if (!config.enabled) return { allowed: true, degraded: false, remaining: Infinity };

  const store = deps.store ?? getRateLimitStore();
  const now = deps.now ?? Date.now();
  const client = clientKey(headers);
  const day = dayStamp(now);

  try {
    // --- global ceiling, before anything per-client ------------------------
    if (config.dailyBudget > 0) {
      const used = await store.increment(`scan:budget:${day}`, DAY_SECONDS);

      if (used > config.dailyBudget) {
        console.error(
          `[ratelimit] daily budget exhausted: ${used}/${config.dailyBudget} scans on ${day}`,
        );
        return { allowed: false, reason: "budget", retryAfterSeconds: secondsUntilUtcMidnight(now) };
      }

      if (used > config.dailyBudget * config.degradeAt) {
        console.warn(
          `[ratelimit] ${used}/${config.dailyBudget} of today's budget used; ` +
            "running this scan without the paid enrichment stages",
        );
        const perClient = await checkClient(store, client, now, config);
        return perClient.allowed ? { ...perClient, degraded: true } : perClient;
      }
    }

    return await checkClient(store, client, now, config);
  } catch (error) {
    console.error("[ratelimit] counter store unreachable, allowing the request:", error);
    return { allowed: true, degraded: false, remaining: 0 };
  }
}

async function checkClient(
  store: RateLimitStore,
  client: string,
  now: number,
  config: RateLimitConfig,
): Promise<RateLimitOutcome> {
  // --- per day --------------------------------------------------------------
  if (config.perDay > 0) {
    const used = await store.increment(`scan:day:${dayStamp(now)}:${client}`, DAY_SECONDS);
    if (used > config.perDay) {
      return {
        allowed: false,
        reason: "per-day",
        retryAfterSeconds: secondsUntilUtcMidnight(now),
      };
    }
  }

  // --- per minute -----------------------------------------------------------
  if (config.perMinute > 0) {
    const windowIndex = Math.floor(now / (MINUTE_SECONDS * 1000));
    const elapsed = (now % (MINUTE_SECONDS * 1000)) / (MINUTE_SECONDS * 1000);

    // The previous window is read before the current one is incremented, so this
    // request counts once.
    const previous = await store.read(`scan:min:${windowIndex - 1}:${client}`);
    const current = await store.increment(
      `scan:min:${windowIndex}:${client}`,
      MINUTE_SECONDS * 2,
    );

    const estimate = weightedCount(previous, current, elapsed);
    if (estimate > config.perMinute) {
      return {
        allowed: false,
        reason: "per-minute",
        retryAfterSeconds: Math.max(1, Math.ceil((1 - elapsed) * MINUTE_SECONDS)),
      };
    }

    return {
      allowed: true,
      degraded: false,
      remaining: Math.max(0, Math.floor(config.perMinute - estimate)),
    };
  }

  return { allowed: true, degraded: false, remaining: Infinity };
}

function secondsUntilUtcMidnight(now: number): number {
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((midnight.getTime() - now) / 1000));
}

/** Turkish message for a refusal, honest about which limit was hit. */
export function rateLimitMessage(reason: "per-minute" | "per-day" | "budget"): string {
  switch (reason) {
    case "per-minute":
      return "Çok hızlı tarama yapıyorsun. Bir dakika bekleyip tekrar dene.";
    case "per-day":
      return "Bugünkü tarama hakkın doldu. Yarın tekrar deneyebilirsin.";
    case "budget":
      return "Günlük tarama kapasitesi doldu. Yarın tekrar dene.";
  }
}
