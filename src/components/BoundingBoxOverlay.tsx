"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/affiliate";
import type { DetectedItem } from "@/types";

interface BoundingBoxOverlayProps {
  imageUrl: string;
  /** Items to draw. During a scan this grows as detections stream in. */
  items: DetectedItem[];
  activeItemId: string | null;
  onSelect: (itemId: string | null) => void;
  isScanning: boolean;
}

/**
 * The uploaded screenshot with interactive hotspots.
 *
 * Resting state is a pulsing coral dot at the centre of each detection; the
 * bounding box itself is revealed on hover or selection, together with a
 * frosted "quick look" card. Everything is positioned from the normalised
 * `boundingBox`, so the overlay tracks the image at any size — the wrapper
 * shrink-wraps the image, which keeps `inset-0` exactly on the pixels.
 */
export function BoundingBoxOverlay({
  imageUrl,
  items,
  activeItemId,
  onSelect,
  isScanning,
}: BoundingBoxOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="relative inline-block max-w-full overflow-hidden rounded-xl shadow-ambient-lg">
      {/* Client-side data URL — nothing for next/image to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Your uploaded look, with detected items marked"
        className="block max-h-[62vh] w-auto max-w-full select-none lg:max-h-[74vh]"
        draggable={false}
      />

      {isScanning ? (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="scanner-line absolute left-0 w-full animate-scan-move" />
        </div>
      ) : null}

      {items.map((item) => {
        const isActive = activeItemId === item.id;
        const isOpen = isActive || hoveredId === item.id;
        const centerX = (item.boundingBox.x + item.boundingBox.width / 2) * 100;
        const centerY = (item.boundingBox.y + item.boundingBox.height / 2) * 100;

        return (
          <div key={item.id}>
            {/* Bounding box — revealed on hover / selection. */}
            <div
              aria-hidden="true"
              style={{
                left: `${item.boundingBox.x * 100}%`,
                top: `${item.boundingBox.y * 100}%`,
                width: `${item.boundingBox.width * 100}%`,
                height: `${item.boundingBox.height * 100}%`,
              }}
              className={cn(
                "pointer-events-none absolute rounded border-2 transition-all duration-200",
                isOpen
                  ? "border-secondary opacity-100"
                  : "border-transparent opacity-0",
                isActive && "bg-secondary/10",
              )}
            />

            <button
              type="button"
              aria-pressed={isActive}
              aria-label={`${item.label} — ${Math.round(item.confidence * 100)}% confidence`}
              onClick={() => onSelect(isActive ? null : item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(item.id)}
              onBlur={() => setHoveredId(null)}
              style={{ left: `${centerX}%`, top: `${centerY}%` }}
              className="absolute z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 animate-pop-in items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute h-5 w-5 rounded-full bg-secondary",
                  isActive ? "opacity-40" : "animate-pulse-ring",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  // A thin white ring keeps the coral dot legible on dark
                  // garments as well as light backgrounds.
                  "relative rounded-full bg-secondary shadow-hotspot ring-white/70 transition-all",
                  isOpen ? "h-4 w-4 ring-2" : "h-3 w-3 ring-1",
                )}
              />
            </button>

            {/* Quick look card */}
            <div
              aria-hidden="true"
              style={{ left: `${centerX}%`, top: `${centerY}%` }}
              className={cn(
                "glassmorphism pointer-events-none absolute z-30 w-48 -translate-x-1/2 -translate-y-[calc(100%+28px)] rounded-md p-3 shadow-ambient-lg transition-opacity duration-200",
                isOpen ? "opacity-100" : "opacity-0",
              )}
            >
              <p className="label text-[10px] text-primary">{item.itemType}</p>
              <p className="mt-1 font-display text-[14px] font-semibold leading-tight text-primary">
                {item.label}
              </p>
              {item.exactMatch ? (
                <p className="mt-2 text-label-sm font-bold text-secondary">
                  {formatPrice(item.exactMatch.price, item.exactMatch.currency)}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* Floating status indicator */}
      <div className="glassmorphism absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full px-6 py-3 shadow-ambient-lg sm:gap-6 sm:px-8 sm:py-4">
        <span className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {isScanning ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex h-3 w-3 rounded-full",
                isScanning ? "bg-secondary" : "bg-success",
              )}
            />
          </span>
          <span className="label whitespace-nowrap text-primary">
            {isScanning ? "AI scanning…" : "Scan complete"}
          </span>
        </span>

        <span aria-hidden="true" className="h-4 w-px bg-outline-variant" />

        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
          </span>
          <span className="label whitespace-nowrap text-on-surface-variant">
            {items.length} item{items.length === 1 ? "" : "s"} found
          </span>
        </span>
      </div>
    </div>
  );
}
