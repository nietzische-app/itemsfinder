"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Cpu,
  ImageOff,
  RotateCcw,
  Timer,
  Wand2,
} from "lucide-react";

import { BoundingBoxOverlay } from "@/components/BoundingBoxOverlay";
import { DetectionResults } from "@/components/DetectionResults";
import { ResultsSkeleton } from "@/components/ResultsSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clearUploadedImage, readUploadedImage } from "@/lib/imageSession";
import type { DetectResponse, DetectionResult, UploadedImage } from "@/types";

/** Captions cycled while scanning, before we know what is actually in frame. */
const TEASER_LABELS = ["Jacket", "Top", "Jeans", "Sneakers", "Lipstick", "Earrings"];

type Status = "loading-image" | "no-image" | "scanning" | "done" | "error";

export default function AnalyzePage() {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [status, setStatus] = useState<Status>("loading-image");
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

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
      setError("We couldn't reach the detection service. Check your connection.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!image || scannedDataUrl.current === image.dataUrl) return;

    scannedDataUrl.current = image.dataUrl;
    void runDetection(image);
  }, [image, runDetection]);

  /** Selecting a box on the image scrolls its matches into view. */
  const handleSelect = useCallback((itemId: string | null) => {
    setActiveItemId(itemId);

    if (!itemId) return;

    // Wait a frame so the filtered list is in the DOM before scrolling.
    requestAnimationFrame(() => {
      document
        .getElementById(`item-${itemId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  function handleStartOver() {
    clearUploadedImage();
  }

  if (status === "no-image") {
    return (
      <div className="container flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
          <ImageOff className="h-6 w-6 text-muted-foreground" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">No screenshot yet</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Upload a look — or try one of our examples — and we&apos;ll break down every
          item in it.
        </p>
        <Button asChild variant="gradient" size="lg" className="mt-6">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to upload
          </Link>
        </Button>
      </div>
    );
  }

  const isScanning = status === "scanning" || status === "loading-image";

  return (
    <div className="container py-8 lg:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            {isScanning ? "Analysing your look" : "Here's the look, broken down"}
          </h1>
          {image ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {image.fileName}
            </p>
          ) : null}
        </div>

        <Button asChild variant="outline" onClick={handleStartOver}>
          <Link href="/">
            <RotateCcw className="h-4 w-4" />
            New screenshot
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        {/* Left: the screenshot with interactive hotspots */}
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {image ? (
            <BoundingBoxOverlay
              imageUrl={image.dataUrl}
              items={result?.items ?? []}
              activeItemId={activeItemId}
              onSelect={handleSelect}
              isScanning={isScanning}
              scanningLabels={
                result?.items.map((item) => item.itemType) ?? TEASER_LABELS
              }
            />
          ) : (
            <div className="aspect-[3/4] animate-pulse rounded-[1.75rem] bg-muted" />
          )}

          {result ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1.5">
                <Cpu className="h-3 w-3" />
                {result.source === "google-vision"
                  ? "Google Cloud Vision"
                  : "Demo engine (mock data)"}
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <Timer className="h-3 w-3" />
                {(result.durationMs / 1000).toFixed(1)}s
              </Badge>
            </div>
          ) : null}
        </div>

        {/* Right: matched products */}
        <div className="min-w-0">
          {isScanning ? <ResultsSkeleton /> : null}

          {status === "error" ? (
            <div className="rounded-[1.5rem] border border-destructive/30 bg-destructive/5 p-6">
              <p className="flex items-center gap-2 font-semibold text-destructive">
                <AlertCircle className="h-5 w-5" />
                Something went wrong
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => image && runDetection(image)}
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          ) : null}

          {status === "done" && result ? (
            result.items.length === 0 ? (
              <div className="rounded-[1.5rem] border bg-card p-6 text-center">
                <Wand2 className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 font-semibold">
                  We couldn&apos;t find anything shoppable here
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a clearer, closer shot of the outfit or face.
                </p>
                <Button asChild variant="gradient" className="mt-5">
                  <Link href="/">Upload another screenshot</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Found <strong className="text-foreground">{result.items.length}</strong>{" "}
                    items.
                  </p>
                  {activeItemId ? (
                    <button
                      type="button"
                      onClick={() => setActiveItemId(null)}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Showing 1 of {result.items.length} — show all
                    </button>
                  ) : null}
                </div>

                <DetectionResults
                  result={result}
                  activeItemId={activeItemId}
                  onSelect={handleSelect}
                />
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
