"use client";

import { useState } from "react";
import { Maximize2, Minus, Plus, Sparkles } from "lucide-react";

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
  /**
   * The scan did not produce a result.
   *
   * Without this the strip read "Analiz tamamlandı — 0 parça bulundu" over a
   * failed scan, which claims two untrue things at once: that the analysis
   * finished, and that it looked and found nothing. A rate-limited request never
   * looked at all. The panel beside it was already telling the truth; this made it
   * argue with itself.
   */
  hasFailed?: boolean;
}

const ZOOM_STEPS = [1, 1.5, 2, 3] as const;

/** Minimum gap between two hotspots, in percent of the image. */
const MIN_HOTSPOT_GAP = 7;

/**
 * Places one hotspot per detection, nudging any that would land on top of
 * each other.
 *
 * Boxes nest all the time — a crop top sits inside the jacket's box, and both
 * centres can land on the exact same pixel, leaving the item underneath
 * impossible to click. Smaller boxes are placed first and keep their true
 * centre; larger ones move, because a large box has room to spare and its dot
 * still lands on the garment.
 */
function placeHotspots(items: DetectedItem[]): Map<string, { x: number; y: number }> {
  const area = (item: DetectedItem) =>
    item.boundingBox.width * item.boundingBox.height;

  const placed: Array<{ x: number; y: number }> = [];
  const positions = new Map<string, { x: number; y: number }>();

  for (const item of [...items].sort((a, b) => area(a) - area(b))) {
    const box = item.boundingBox;
    let x = (box.x + box.width / 2) * 100;
    let y = (box.y + box.height / 2) * 100;

    // A handful of passes is plenty; the loop is bounded either way.
    for (let pass = 0; pass < 8; pass += 1) {
      const clash = placed.find(
        (other) => Math.hypot(other.x - x, other.y - y) < MIN_HOTSPOT_GAP,
      );
      if (!clash) break;

      let dx = x - clash.x;
      let dy = y - clash.y;
      const distance = Math.hypot(dx, dy);

      // Exactly coincident centres have no direction to push along; send the
      // larger box's dot upward, towards the part of it that is still visible.
      if (distance < 0.001) {
        dx = 0;
        dy = -1;
      } else {
        dx /= distance;
        dy /= distance;
      }

      x += dx * MIN_HOTSPOT_GAP;
      y += dy * MIN_HOTSPOT_GAP;

      // Never let a dot leave the item it belongs to.
      const insetX = Math.min(3, (box.width * 100) / 3);
      const insetY = Math.min(3, (box.height * 100) / 3);
      x = Math.min(
        Math.max(x, box.x * 100 + insetX),
        (box.x + box.width) * 100 - insetX,
      );
      y = Math.min(
        Math.max(y, box.y * 100 + insetY),
        (box.y + box.height) * 100 - insetY,
      );
    }

    placed.push({ x, y });
    positions.set(item.id, { x, y });
  }

  return positions;
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
  hasFailed = false,
}: BoundingBoxOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const hotspots = placeHotspots(items);
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  /**
   * When zoomed, the canvas centres on the selected detection so the item the
   * user is inspecting stays in frame — the spotlight behaviour an editor
   * canvas is expected to have.
   */
  const focus = activeItemId ? hotspots.get(activeItemId) : undefined;
  const originX = focus ? focus.x : 50;
  const originY = focus ? focus.y : 50;

  return (
    <div className="relative inline-block max-w-full overflow-hidden rounded-2xl shadow-ambient-lg">
      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-40 flex flex-col overflow-hidden rounded-full border border-white/40 bg-surface-container-lowest/80 shadow-ambient backdrop-blur-md">
        <button
          type="button"
          onClick={() => setZoomIndex((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
          disabled={zoomIndex >= ZOOM_STEPS.length - 1}
          className="p-2 text-primary transition-colors hover:bg-surface-container disabled:opacity-35"
          aria-label="Yakınlaştır"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setZoomIndex((i) => Math.max(i - 1, 0))}
          disabled={zoomIndex === 0}
          className="border-t border-outline-variant/50 p-2 text-primary transition-colors hover:bg-surface-container disabled:opacity-35"
          aria-label="Uzaklaştır"
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </button>
        {zoomIndex > 0 ? (
          <button
            type="button"
            onClick={() => setZoomIndex(0)}
            className="border-t border-outline-variant/50 p-2 text-primary transition-colors hover:bg-surface-container"
            aria-label="Görüntüyü sığdır"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {zoom > 1 ? (
        <span className="absolute left-3 top-3 z-40 rounded-full bg-primary/85 px-2.5 py-1 text-[11px] font-bold tabular-nums text-on-primary backdrop-blur-sm">
          {zoom}x
        </span>
      ) : null}

      <div
        className="transition-transform duration-500 ease-out"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: `${originX}% ${originY}%`,
        }}
      >
      {/* Client-side data URL — nothing for next/image to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Yüklediğin görsel, tespit edilen parçalar işaretli"
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
        const spot = hotspots.get(item.id);
        const centerX = spot?.x ?? (item.boundingBox.x + item.boundingBox.width / 2) * 100;
        const centerY = spot?.y ?? (item.boundingBox.y + item.boundingBox.height / 2) * 100;

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
              aria-label={`${item.label} — %${Math.round(item.confidence * 100)} güven`}
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
                <p className="mt-2 text-label-sm font-bold text-secondary-deep">
                  {formatPrice(item.exactMatch.price, item.exactMatch.currency)}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}

      </div>

      {/* Floating status indicator.
          `pointer-events-none` is load-bearing: this pill sits over the
          bottom-centre of the image, which is exactly where footwear lands in
          a full-body shot. Without it the pill swallows those clicks and the
          hotspot underneath can never be selected. It also shrinks once the
          scan is done, so it stops competing with the result it announces. */}
      <div
        className={cn(
          "glassmorphism pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center rounded-full shadow-ambient-lg transition-all duration-500",
          isScanning
            ? "bottom-6 gap-4 px-6 py-3 sm:gap-6 sm:px-8 sm:py-4"
            : "bottom-3 gap-3 px-5 py-2 opacity-80 sm:gap-4 sm:px-6",
        )}
      >
        <span className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {isScanning ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
            ) : null}
            <span
              className={cn(
                "relative inline-flex h-3 w-3 rounded-full",
                isScanning ? "bg-secondary" : hasFailed ? "bg-error" : "bg-success",
              )}
            />
          </span>
          <span className="label whitespace-nowrap text-primary">
            {isScanning
              ? "Görsel analiz ediliyor…"
              : hasFailed
                ? "Analiz tamamlanamadı"
                : "Analiz tamamlandı"}
          </span>
        </span>

        {/*
          The count is dropped on a failure rather than shown as zero. "0 parça
          bulundu" is a finding — it says the image was examined and held nothing —
          and a scan that was refused never examined it.
        */}
        {hasFailed ? null : (
          <>
            <span aria-hidden="true" className="h-4 w-px bg-outline-variant" />

            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
              </span>
              <span className="label whitespace-nowrap text-on-surface-variant">
                {items.length} parça bulundu
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
