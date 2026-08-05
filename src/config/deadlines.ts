/**
 * Hardcoded stage budgets for `/api/detect` (Vercel `maxDuration = 60`).
 *
 * Stages run sequentially: Vision → VLM attributes → Context.dev products.
 * These values are fixed in code so a stale Vercel env (e.g. old
 * `CONTEXT_DEV_DEADLINE_MS=45000`) cannot push the sum past the platform kill
 * and turn a graceful catalogue fallback into a 504.
 *
 *   10s VLM + 20s products = 30s → ~30s left for Vision + network + response.
 */
export const VLM_DEADLINE_MS = 10_000;
export const CONTEXT_DEV_DEADLINE_MS = 20_000;
