"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ImageOff, RotateCcw } from "lucide-react";

import { BoundingBoxOverlay } from "@/components/BoundingBoxOverlay";
import { DetectedItemsPanel } from "@/components/DetectedItemsPanel";
import { ResultsSkeleton } from "@/components/ResultsSkeleton";
import { Button } from "@/components/ui/button";
import { readUploadedImage } from "@/lib/imageSession";
import type { DetectResponse, DetectionResult, UploadedImage } from "@/types";

/** Delay between detections appearing in the rail, in milliseconds. */
const REVEAL_INTERVAL_MS = 550;

type Status = "loading-image" | "no-image" | "scanning" | "done" | "error";

export default function AnalyzePage() {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [status, setStatus] = useState<Status>("loading-image");
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  /** How many detections have finished "matching" and are on screen. */
  const [revealedCount, setRevealedCount] = useState(0);

  /** Guards against a duplicate scan from React 18 StrictMode double-effects. */
  const scannedDataUrl = useRef<string | null>(null);

  useEffect(() => {
    const stored = readUploadedImage();
    if (!stored) {
      setStatus("no-image");
      return;
    }
    setImage(stored);
  }, []);

  const runDetection = useCallback(async (target: UploadedImage) => {
    setStatus("scanning");
    setError(null);
    setActiveItemId(null);
    setResult(null);
    setRevealedCount(0);

    try {
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: target.dataUrl, exampleId: target.exampleId }),
      });

      const payload = (await response.json()) as DetectResponse;

      if (!payload.ok) {
        setError(payload.error);
        setStatus("error");
        return;
      }

      setResult(payload.result);
      setStatus("done");
    } catch {
      setError("Analiz servisine ulaşamadık. Bağlantını kontrol et.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!image || scannedDataUrl.current === image.dataUrl) return;
    scannedDataUrl.current = image.dataUrl;
    void runDetection(image);
  }, [image, runDetection]);

  /**
   * Detections land in one response, but the engine genuinely resolves them
   * one at a time — so the rail reveals them in sequence rather than snapping
   * a full list into place.
   */
  useEffect(() => {
    if (status !== "done" || !result) return;
    if (revealedCount >= result.items.length) return;

    const timer = setTimeout(
      () => setRevealedCount((count) => count + 1),
      REVEAL_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [status, result, revealedCount]);

  const handleSelect = useCallback((itemId: string | null) => {
    setActiveItemId(itemId);
    if (!itemId) return;

    requestAnimationFrame(() => {
      document
        .getElementById(`item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  if (status === "no-image") {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-shell flex-col items-center justify-center px-margin-mobile py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
          <ImageOff className="h-7 w-7 text-outline" strokeWidth={1.5} />
        </span>
        <h1 className="mt-6 font-display text-headline-md text-primary">
          Henüz bir görsel yok
        </h1>
        <p className="mt-2 max-w-sm text-on-surface-variant">
          Bir kombin yükle ya da hazır tarzlardan birini seç; içindeki her parçayı
          tek tek çıkaralım.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">Yüklemeye dön</Link>
        </Button>
      </div>
    );
  }

  const items = result?.items ?? [];
  const isStreaming = status === "done" && revealedCount < items.length;
  const isScanning = status === "scanning" || status === "loading-image" || isStreaming;
  const identified = items.slice(0, revealedCount);
  const pending = isStreaming ? (items[revealedCount] ?? null) : null;

  return (
    <div className="mx-auto flex max-w-shell flex-col lg:h-[calc(100dvh-5rem)] lg:flex-row">
      {/* Scanning workspace */}
      <section className="flex min-h-0 flex-1 items-center justify-center bg-surface-container-low p-gutter">
        {image ? (
          <BoundingBoxOverlay
            imageUrl={image.dataUrl}
            items={identified}
            activeItemId={activeItemId}
            onSelect={handleSelect}
            isScanning={isScanning}
          />
        ) : (
          <div className="h-[60vh] w-full max-w-md animate-pulse rounded-xl bg-surface-container" />
        )}
      </section>

      {/* Detected items rail */}
      <aside className="flex w-full shrink-0 flex-col border-outline-variant bg-surface-container-lowest lg:h-full lg:w-[420px] lg:border-l">
        {status === "error" ? (
          <div className="p-gutter">
            <p className="flex items-center gap-2 font-display text-[18px] font-semibold text-error">
              <AlertCircle className="h-5 w-5" strokeWidth={1.5} />
              Bir şeyler ters gitti
            </p>
            <p className="mt-2 text-on-surface-variant">{error}</p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => image && runDetection(image)}
            >
              <RotateCcw strokeWidth={1.5} />
              Tekrar dene
            </Button>
          </div>
        ) : result && (status === "done" || revealedCount > 0) ? (
          <DetectedItemsPanel
            result={result}
            identified={identified}
            pending={pending}
            activeItemId={activeItemId}
            onSelect={handleSelect}
          />
        ) : (
          <>
            <header className="border-b border-outline-variant p-gutter">
              <h2 className="font-display text-headline-md text-primary">
                Tespit Edilen Parçalar
              </h2>
              <p className="mt-1 text-[14px] text-on-surface-variant">
                Görsel analiz ediliyor…
              </p>
            </header>
            <ResultsSkeleton />
          </>
        )}
      </aside>
    </div>
  );
}
