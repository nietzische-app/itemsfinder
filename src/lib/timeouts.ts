/**
 * Hard execution budgets for the scanning engine.
 *
 * External providers that exceed these ceilings are aborted; callers fall back
 * to catalogue / cached PDPs so the UI never freezes or surfaces a hard error.
 */

/** Vision OBJECT_LOCALIZATION + per-ROI WEB_DETECTION / IMAGE_PROPERTIES. */
export const VISION_DEADLINE_MS = 3_500;

/** Live Context.dev search + extract wall-clock budget for the whole enrich stage. */
export const LIVE_EXTRACT_DEADLINE_MS = 4_000;

/** Per Context.dev SDK HTTP call (search / extract / brand). */
export const LIVE_REQUEST_TIMEOUT_MS = 3_500;

/** Extract crawl budget inside one page. */
export const LIVE_EXTRACT_BUDGET_MS = 3_000;

/**
 * Combines an outer AbortSignal with a hard timeout. Aborting either side
 * aborts the returned signal. Caller should clear via the returned handle when
 * the work finishes early.
 */
export function raceTimeout(
  ms: number,
  outer?: AbortSignal,
): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  const onOuter = () => controller.abort();
  if (outer) {
    if (outer.aborted) {
      controller.abort();
    } else {
      outer.addEventListener("abort", onOuter, { once: true });
    }
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}
