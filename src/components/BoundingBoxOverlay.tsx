"use client";

import { useEffect, useState } from "react";
import { ScanLine, Shirt, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DetectedItem } from "@/types";

interface BoundingBoxOverlayProps {
  imageUrl: string;
  items: DetectedItem[];
  activeItemId: string | null;
  onSelect: (itemId: string | null) => void;
  isScanning: boolean;
  /** Labels cycled through in the scanning caption, e.g. ["Jacket", "Jeans"]. */
  scanningLabels?: string[];
}

/**
 * The uploaded screenshot with clickable hotspots over every detected item.
 *
 * Boxes are positioned with percentages taken straight from the normalised
 * `boundingBox`, so the overlay tracks the image at any container width with
 * no resize observer or pixel maths.
 */
export function BoundingBoxOverlay({
  imageUrl,
  items,
  activeItemId,
  onSelect,
  isScanning,
  scanningLabels = [],
}: BoundingBoxOverlayProps) {
  const [captionIndex, setCaptionIndex] = useState(0);

  useEffect(() => {
    if (!isScanning || scanningLabels.length === 0) return;

    const timer = setInterval(() => {
      setCaptionIndex((index) => (index + 1) % scanningLabels.length);
    }, 900);

    return () => clearInterval(timer);
  }, [isScanning, scanningLabels.length]);

  return (
    <figure className="relative overflow-hidden rounded-[1.75rem] border bg-card shadow-sm">
      <div className="relative">
        {/* Plain <img>: the source is a client-side data URL, which next/image
            cannot optimise anyway. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Your uploaded look, with detected items highlighted"
          className="block h-auto w-full select-none"
          draggable={false}
        />

        {isScanning ? (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-transparent to-background/30" />
            <div className="absolute left-0 h-1 w-full animate-scan-sweep bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_24px_6px_hsl(var(--primary)/0.55)]" />
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-2xl bg-background/85 px-3.5 py-2.5 backdrop-blur">
              <ScanLine className="h-4 w-4 shrink-0 animate-pulse text-primary" />
              <p className="truncate text-sm font-medium">
                Detecting items
                {scanningLabels.length > 0 ? (
                  <span className="text-muted-foreground">
                    {": "}
                    <span key={captionIndex} className="animate-fade-up text-foreground">
                      {scanningLabels[captionIndex]}
                    </span>
                  </span>
                ) : null}
                <span className="text-muted-foreground">…</span>
              </p>
            </div>
          </div>
        ) : null}

        {!isScanning &&
          items.map((item, index) => {
            const isActive = activeItemId === item.id;
            const isDimmed = activeItemId !== null && !isActive;

            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                aria-label={`${item.label}, ${Math.round(item.confidence * 100)}% confidence`}
                onClick={() => onSelect(isActive ? null : item.id)}
                style={{
                  left: `${item.boundingBox.x * 100}%`,
                  top: `${item.boundingBox.y * 100}%`,
                  width: `${item.boundingBox.width * 100}%`,
                  height: `${item.boundingBox.height * 100}%`,
                  animationDelay: `${index * 70}ms`,
                }}
                className={cn(
                  "group absolute animate-pop-in rounded-xl border-2 transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40",
                  isActive
                    ? "z-20 border-primary bg-primary/15 shadow-[0_0_0_9999px_hsl(var(--background)/0.55)]"
                    : "z-10 border-white/85 bg-white/5 hover:z-20 hover:border-primary hover:bg-primary/10",
                  isDimmed && "opacity-40",
                )}
              >
                {/* Corner ticks give the box a "camera focus" feel. */}
                <span className="pointer-events-none absolute -left-[3px] -top-[3px] h-3 w-3 rounded-tl-lg border-l-[3px] border-t-[3px] border-primary opacity-0 transition-opacity group-hover:opacity-100 group-aria-pressed:opacity-100" />
                <span className="pointer-events-none absolute -bottom-[3px] -right-[3px] h-3 w-3 rounded-br-lg border-b-[3px] border-r-[3px] border-primary opacity-0 transition-opacity group-hover:opacity-100 group-aria-pressed:opacity-100" />

                {/* Boxes cluster tightly on close-up shots (a face has five
                    hotspots in a small area), so the resting state is a numbered
                    pin — matching the number on the item's result card — and the
                    full label only appears for the hovered or selected box. */}
                <span
                  className={cn(
                    "pointer-events-none absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow-md transition-all group-hover:scale-0 group-hover:opacity-0",
                    isActive
                      ? "scale-0 opacity-0"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {index + 1}
                </span>

                <span
                  className={cn(
                    "pointer-events-none absolute -top-3 left-1/2 flex min-w-max -translate-x-1/2 scale-90 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold opacity-0 shadow-md transition-all group-hover:scale-100 group-hover:opacity-100",
                    isActive
                      ? "scale-100 bg-primary text-primary-foreground opacity-100"
                      : "bg-background text-foreground",
                  )}
                >
                  {item.category === "beauty" ? (
                    <Sparkles className="h-3 w-3 shrink-0" />
                  ) : (
                    <Shirt className="h-3 w-3 shrink-0" />
                  )}
                  {item.itemType}
                </span>
              </button>
            );
          })}
      </div>

      {!isScanning ? (
        <figcaption className="flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            {items.length} item{items.length === 1 ? "" : "s"} detected — tap a
            numbered box to filter the matches
          </span>
          {activeItemId ? (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="shrink-0 font-semibold text-primary hover:underline"
            >
              Clear filter
            </button>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
