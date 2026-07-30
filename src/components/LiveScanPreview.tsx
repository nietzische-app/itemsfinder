"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Loader2,
  Pause,
  Play,
  ScanLine,
  Search,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { exampleToDataUrl } from "@/lib/imageSession";
import { cn } from "@/lib/utils";
import {
  SHOWCASE_FALLBACK,
  SHOWCASE_INTERVAL_MS,
  SHOWCASE_LOOKS,
  type ShowcaseItem,
} from "@/lib/showcase";
import { merchantColor, merchantInitials } from "@/services/merchantSearch";
import type { UploadedImage } from "@/types";
import { buildAffiliateUrl, formatPrice } from "@/utils/affiliate";

/**
 * The landing page's centrepiece: a real look being scanned, with a coral beam
 * sweeping the frame, pulsing hotspots on each detected garment, and an
 * adjacent card that follows the focus.
 *
 * The point is that a visitor should understand the product before reading a
 * word of copy: something is being looked at, several things were found in it,
 * and each one resolves to a buyable row at a named store.
 *
 * Focus cycles on its own every few seconds. Hovering, focusing or clicking a
 * hotspot takes over immediately, and there is an explicit pause control —
 * motion that cannot be stopped is an accessibility problem, and a visitor
 * reading the card should not have it swapped out from under them.
 */
export function LiveScanPreview({
  onOpenScan,
}: {
  /**
   * Runs the selected look through the real pipeline, so the demo is the
   * product rather than a second mock of it.
   */
  onOpenScan: (image: UploadedImage) => void;
}) {
  const [lookIndex, setLookIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  /** Hover or keyboard focus anywhere in the frame suspends the cycle. */
  const [engaged, setEngaged] = useState(false);
  /** Manual hotspot selection resets the autoplay tick so the card isn't swapped mid-read. */
  const [cycleKey, setCycleKey] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const engageTimeoutRef = useRef<number | null>(null);

  const look = SHOWCASE_LOOKS[lookIndex]!;
  const active = look.items[itemIndex] ?? look.items[0]!;
  const imageSrc = imageFailed ? SHOWCASE_FALLBACK.src : look.src;

  // Someone who asked their OS for less motion should not be handed a carousel
  // that advances by itself; the hotspots still work.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAutoPlay(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (engageTimeoutRef.current !== null) {
        window.clearTimeout(engageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoPlay || engaged) return;

    const id = window.setInterval(
      () => setItemIndex((index) => (index + 1) % look.items.length),
      SHOWCASE_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [autoPlay, engaged, look.items.length, cycleKey]);

  function selectItem(index: number) {
    setItemIndex(index);
    // Pause autoplay while the visitor inspects a hotspot (critical on touch,
    // where hover never fires `engaged`).
    setEngaged(true);
    setCycleKey((key) => key + 1);
    if (engageTimeoutRef.current !== null) {
      window.clearTimeout(engageTimeoutRef.current);
    }
    engageTimeoutRef.current = window.setTimeout(() => {
      setEngaged(false);
      engageTimeoutRef.current = null;
    }, SHOWCASE_INTERVAL_MS);
  }

  /**
   * The `<img>` is server-rendered, so the browser starts fetching before React
   * hydrates. A missing file therefore fails *before* `onError` is attached and
   * the handler never runs — the frame just sits there broken. Checking the
   * element's own state catches that case; `onError` still covers a failure that
   * lands after hydration.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setImageFailed(true);
  }, [imageSrc]);

  function selectLook(index: number) {
    setLookIndex(index);
    setItemIndex(0);
    setImageFailed(false);
    setOpenError(null);
  }

  /** Hands the active look to the normal upload path, tagged with its scenario. */
  async function openScan() {
    setOpening(true);
    setOpenError(null);

    try {
      const dataUrl = await exampleToDataUrl(imageSrc);
      onOpenScan({
        dataUrl,
        fileName: imageSrc.split("/").pop() ?? "ornek-kombin.jpg",
        exampleId: look.exampleId,
      });
      // Parent navigates on success; clear busy state if navigation is blocked
      // (e.g. sessionStorage quota) so the CTA is not stuck on "Açılıyor…".
      setOpening(false);
    } catch {
      setOpenError("Örnek taramayı açamadık. Tekrar dene.");
      setOpening(false);
    }
  }

  return (
    <div className="relative min-w-0">
      {/*
        Ambient coral glow behind the frame.

        The glow bleeds vertically but is clipped horizontally: an unclipped
        decorative layer wider than its column pushes the document's scrollWidth
        past the viewport and hands the whole page a horizontal scrollbar. Blobs
        this diffuse read the same either way.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-y-10 left-0 right-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-16 top-[6%] h-56 w-56 rounded-full bg-[#E05638]/10 blur-3xl" />
        <div className="absolute -right-12 bottom-[4%] h-64 w-64 rounded-full bg-[#E05638]/10 blur-3xl" />
        <div className="absolute left-1/4 top-1/3 h-48 w-48 rounded-full bg-[#D8C3A5]/30 blur-3xl" />
      </div>

      <div
        className="grid min-w-0 gap-4 sm:grid-cols-[1.05fr_1fr] sm:items-center sm:gap-5"
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => setEngaged(false)}
        onFocusCapture={() => setEngaged(true)}
        onBlurCapture={() => setEngaged(false)}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Scan frame                                                       */}
        {/* ---------------------------------------------------------------- */}
        <div className="min-w-0">
          <div
            className="relative min-w-0 overflow-hidden rounded-3xl bg-surface-container shadow-ambient-lg ring-1 ring-inset ring-black/[0.06]"
            /*
             * Exact intrinsic ratio of this look's asset, not a rounded "2 / 3":
             * the boxes are normalised against the whole image, so any crop from
             * a ratio mismatch would slide every hotspot off its garment.
             */
            style={{ aspectRatio: `${look.width} / ${look.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              // Re-keyed per look so React swaps the element instead of
              // reusing one that has already decoded a different photo.
              key={look.id}
              src={imageSrc}
              alt={imageFailed ? SHOWCASE_FALLBACK.alt : look.alt}
              width={look.width}
              height={look.height}
              decoding="async"
              fetchPriority={lookIndex === 0 ? "high" : "auto"}
              // Frame aspectRatio matches intrinsic size — cover fills without
              // cropping, so hotspots stay locked to garments.
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setImageFailed(true)}
            />

            {/* Scanning beam. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 animate-scan-move"
            >
              <div className="scanner-line" />
              <div className="h-16 bg-gradient-to-b from-[#E05638]/25 to-transparent" />
            </div>

            {/* Spotlight on the focused item: a coral frame plus a vignette
                that dims everything outside it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-xl border-2 border-secondary/85 shadow-[0_0_0_9999px_rgba(17,17,17,0.28)] transition-all duration-500 ease-out"
              style={boxStyle(active)}
            />

            {look.items.map((item, index) => {
              const isActive = index === itemIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  // A 32px target: the dot is 12px, far too small on a phone.
                  className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    left: `${(item.box.x + item.box.width / 2) * 100}%`,
                    top: `${(item.box.y + item.box.height / 2) * 100}%`,
                  }}
                  aria-pressed={isActive}
                  aria-label={`${item.label} — eşleşmeyi göster`}
                  onClick={() => selectItem(index)}
                  onMouseEnter={() => setItemIndex(index)}
                  onFocus={() => setItemIndex(index)}
                >
                  {isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute h-3 w-3 animate-pulse-ring rounded-full bg-secondary"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative rounded-full bg-secondary shadow-hotspot ring-2 ring-white transition-all duration-300",
                      isActive ? "h-3.5 w-3.5" : "h-2.5 w-2.5 opacity-80",
                    )}
                  />
                </button>
              );
            })}

            {/* Status pill. `pointer-events-none` is load-bearing: a glass panel
                over the image swallows hotspot clicks underneath it. */}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full px-3 py-2 glassmorphism">
              <ScanLine className="h-4 w-4 shrink-0 text-secondary" strokeWidth={2} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-primary">
                {look.items.length} parça tespit edildi
              </span>
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-outline">
                Örnek tarama
              </span>
            </div>
          </div>

          {/* Look switcher. Only the active look's photo is mounted, so the
              other three cost nothing until they are picked. */}
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
            {SHOWCASE_LOOKS.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectLook(index)}
                aria-pressed={index === lookIndex}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] transition-all",
                  index === lookIndex
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[11px] text-outline">Fotoğraf: {look.credit}</p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Detected product card                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-3">
          <article className="flex min-w-0 flex-col gap-3 rounded-3xl border border-outline-variant/60 bg-surface-container-lowest p-4 shadow-ambient sm:p-5">
            {/* Re-keying on the item id restarts the fade, so the swap reads as
                a new result rather than text mutating in place. */}
            <div
              key={`${look.id}-${active.id}`}
              className="flex min-w-0 animate-fade-up flex-col gap-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-secondary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-secondary-deep">
                  <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2} />
                  <span className="truncate">{active.itemType}</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-outline">
                  %{Math.round(active.confidence * 100)} güven
                </span>
              </div>

              <div className="min-w-0">
                <h3 className="font-display text-[17px] font-semibold leading-snug text-primary">
                  {active.label}
                </h3>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-on-surface-variant">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: active.colorHex }}
                  />
                  <span className="line-clamp-2">{active.attributes}</span>
                </p>
              </div>

              <div className="border-t border-outline-variant/60 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  {/* Merchant tag in the retailer's own brand colour. */}
                  <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-outline-variant/70 px-2 py-0.5 text-[11px] font-semibold uppercase text-on-surface-variant">
                    <span
                      aria-hidden="true"
                      className="flex h-4 shrink-0 items-center justify-center rounded-[4px] px-1 text-[9px] font-bold leading-none text-white"
                      style={{ backgroundColor: merchantColor(active.match.merchant) }}
                    >
                      {merchantInitials(active.match.merchant)}
                    </span>
                    <span className="truncate">{active.match.merchant}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-secondary-deep">
                    <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />%
                    {Math.round(active.match.similarity * 100)}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-[14px] font-medium text-primary">
                  {active.match.title}
                </p>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display text-[20px] font-bold tracking-tight text-primary">
                    {formatPrice(active.match.price, active.match.currency)}
                  </span>
                  {active.match.url ? (
                    <Button asChild size="sm">
                      <a
                        href={buildAffiliateUrl(active.match.url, active.match.merchant, {
                          subId: active.id,
                        })}
                        target="_blank"
                        rel="noopener noreferrer sponsored nofollow"
                      >
                        <Search strokeWidth={1.75} />
                        Mağazada bul
                      </a>
                    </Button>
                  ) : null}
                </div>

                <p className="mt-2 text-[12px] text-outline">
                  + {active.match.alternativeCount} uygun fiyatlı muadil bulundu
                </p>
              </div>
            </div>
          </article>

          {/* Cycle controls: progress bars double as manual selection. */}
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {look.items.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(index)}
                  aria-pressed={index === itemIndex}
                  aria-label={item.label}
                  className={cn(
                    "h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-300",
                    index === itemIndex
                      ? "bg-secondary"
                      : "bg-outline-variant hover:bg-outline",
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAutoPlay((value) => !value)}
              aria-pressed={!autoPlay}
              aria-label={autoPlay ? "Otomatik geçişi durdur" : "Otomatik geçişi başlat"}
              className="shrink-0 rounded-full p-1.5 text-outline transition-colors hover:bg-surface-container hover:text-primary"
            >
              {autoPlay ? (
                <Pause className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <Play className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
          </div>

          <Button
            variant="outline"
            size="block"
            onClick={openScan}
            disabled={opening}
            className="mt-1"
          >
            {opening ? (
              <>
                <Loader2 className="animate-spin" strokeWidth={1.75} />
                Açılıyor…
              </>
            ) : (
              <>
                Bu taramayı aç
                <ArrowRight strokeWidth={1.5} />
              </>
            )}
          </Button>

          {openError ? (
            <p role="alert" className="text-[13px] text-error">
              {openError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Normalised box -> percentage offsets for the spotlight frame. */
function boxStyle(item: ShowcaseItem) {
  return {
    left: `${item.box.x * 100}%`,
    top: `${item.box.y * 100}%`,
    width: `${item.box.width * 100}%`,
    height: `${item.box.height * 100}%`,
  };
}
