import { Cpu, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DetectionResult } from "@/types";

interface EngineBadgeProps {
  result: Pick<DetectionResult, "source" | "productSource" | "liveItemCount" | "items">;
  className?: string;
}

/**
 * States which engines produced what the user is looking at.
 *
 * Detection and product data are separate engines, so the label names both.
 * Anything short of fully live says so explicitly — a scan running on demo
 * prices must never look like real inventory.
 */
export function EngineBadge({ result, className }: EngineBadgeProps) {
  const isLiveDetection = result.source === "google-vision";
  const isLiveProducts = result.productSource === "context-dev";

  const label = isLiveProducts
    ? isLiveDetection
      ? "Live Engine (Vision + Context.dev)"
      : "Live Engine (Context.dev products)"
    : isLiveDetection
      ? "Vision detection · demo products"
      : "Demo Engine (Mock Data)";

  // When only some detections resolved live, say which — the rest are demo
  // rows sitting in the same list.
  const isPartial =
    isLiveProducts && result.liveItemCount > 0 && result.liveItemCount < result.items.length;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm uppercase tracking-[0.05em]",
        isLiveProducts
          ? "border-secondary/30 bg-secondary/5 text-secondary-deep"
          : "border-outline-variant bg-surface-container text-on-surface-variant",
        className,
      )}
    >
      {isLiveProducts ? (
        <Radio className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      ) : (
        <Cpu className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <span>{label}</span>
      {isPartial ? (
        <span className="font-normal normal-case tracking-normal opacity-80">
          · {result.liveItemCount} of {result.items.length} live
        </span>
      ) : null}
    </span>
  );
}
