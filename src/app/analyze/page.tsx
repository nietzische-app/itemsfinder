"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ImageOff, RotateCcw } from "lucide-react";

import { AnalyzeSidebar, type AnalyzeFilters } from "@/components/AnalyzeSidebar";
import { BoundingBoxOverlay } from "@/components/BoundingBoxOverlay";
import { DetectedItemsPanel } from "@/components/DetectedItemsPanel";
import { ResultsSkeleton } from "@/components/ResultsSkeleton";
import { Button } from "@/components/ui/button";
import { parseUiCategory, uiCategoryOf, type UiCategory } from "@/lib/categories";
import { readUploadedImage } from "@/lib/imageSession";
import { useSavedProducts } from "@/lib/savedItems";
import type { ShopperGender } from "@/lib/shopperGender";
import type { DetectResponse, DetectionResult, UploadedImage } from "@/types";

/** Delay between detections appearing in the rail, in milliseconds. */
const REVEAL_INTERVAL_MS = 550;

type Status = "loading-image" | "no-image" | "scanning" | "done" | "error";

function AnalyzeWorkspace() {
  const searchParams = useSearchParams();
  const { count: savedCount } = useSavedProducts();

  const [image, setImage] = useState<UploadedImage | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [status, setStatus] = useState<Status>("loading-image");
  const [error, setError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  /** How many detections have finished "matching" and are on screen. */
  const [revealedCount, setRevealedCount] = useState(0);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  /** Guards against a duplicate scan from React 18 StrictMode double-effects. */
  const scannedDataUrl = useRef<string | null>(null);

  // The category filter lives in the URL so the header switcher drives it too.
  const urlCategory = parseUiCategory(searchParams.get("kategori"));
  const [localCategory, setLocalCategory] = useState<UiCategory | null>(null);
  const category = localCategory ?? urlCategory;

  useEffect(() => setLocalCategory(urlCategory), [urlCategory]);

  /**
   * Kimin için arandığı — kullanıcının seçimi, varsayılan «fark etmez».
   *
   * Fotoğraftan çıkarılmıyor: görünüşten cinsiyet tahmin etmek hem güvenilmez
   * hem de yapılmaması gereken bir şey. Seçim tarayıcıda saklanıyor, çünkü aynı
   * kişi genelde aynı bölümde alışveriş yapıyor ve her taramada yeniden seçmek
   * işkence olurdu.
   */
  const [gender, setGender] = useState<ShopperGender | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(GENDER_KEY);
    if (stored === "kadın" || stored === "erkek") setGender(stored);
  }, []);

  useEffect(() => {
    const stored = readUploadedImage();
    if (!stored) {
      setStatus("no-image");
      return;
    }
    setImage(stored);
  }, []);

  const runDetection = useCallback(async (target: UploadedImage & { gender?: ShopperGender | null }) => {
    setStatus("scanning");
    setError(null);
    setActiveItemId(null);
    setResult(null);
    setRevealedCount(0);

    try {
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: target.dataUrl,
          exampleId: target.exampleId,
          gender: target.gender ?? undefined,
        }),
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
    void runDetection({ ...image, gender });
  }, [image, gender, runDetection]);

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

  // Memoised so the derived useMemo hooks below keep a stable dependency.
  const items = useMemo(() => result?.items ?? [], [result]);
  const isStreaming = status === "done" && revealedCount < items.length;
  const isScanning = status === "scanning" || status === "loading-image" || isStreaming;
  const revealed = items.slice(0, revealedCount);

  const priceCeiling = useMemo(() => {
    const prices = items.map((item) => item.exactMatch?.price ?? 0);
    // Round up to a clean step so the slider's maximum reads sensibly.
    return prices.length > 0 ? Math.ceil(Math.max(...prices) / 100) * 100 : 1000;
  }, [items]);

  const categoryCounts = useMemo(() => {
    const counts: Record<UiCategory, number> = { moda: 0, guzellik: 0, aksesuar: 0 };
    for (const item of items) counts[uiCategoryOf(item)] += 1;
    return counts;
  }, [items]);

  /** Filters apply to the rail and the hotspots alike, so the two never disagree. */
  const visible = useMemo(
    () =>
      revealed.filter((item) => {
        if (category && uiCategoryOf(item) !== category) return false;
        if (maxPrice !== null && (item.exactMatch?.price ?? 0) > maxPrice) return false;
        return true;
      }),
    [revealed, category, maxPrice],
  );

  const pending = isStreaming ? (items[revealedCount] ?? null) : null;
  const isFiltered = category !== null || maxPrice !== null;

  const resetFilters = useCallback(() => {
    setLocalCategory(null);
    setMaxPrice(null);
  }, []);

  // A filter can hide the item that is currently selected; drop the selection
  // rather than leaving a highlight pointing at nothing.
  useEffect(() => {
    if (activeItemId && !visible.some((item) => item.id === activeItemId)) {
      setActiveItemId(null);
    }
  }, [activeItemId, visible]);

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
          Bir kombin yükle ya da hazır tarzlardan birini seç; içindeki her parçayı tek
          tek çıkaralım.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">Yüklemeye dön</Link>
        </Button>
      </div>
    );
  }

  const filters: AnalyzeFilters = { category, maxPrice };
  const currency = items[0]?.exactMatch?.currency ?? "TRY";

  return (
    <div className="mx-auto flex max-w-shell flex-col lg:h-[calc(100dvh-72px)] lg:flex-row">
      {/* Tool rail */}
      {result && revealedCount > 0 ? (
        <AnalyzeSidebar
          result={result}
          filters={filters}
          onFiltersChange={(next) => {
            setLocalCategory(next.category);
            setMaxPrice(next.maxPrice);
          }}
          categoryCounts={categoryCounts}
          priceCeiling={priceCeiling}
          currency={currency}
          savedCount={savedCount}
          visibleCount={visible.length}
          onReset={resetFilters}
        />
      ) : null}

      {/* Canvas */}
      <section className="flex min-h-0 flex-1 items-center justify-center bg-surface-container-low p-gutter">
        {image ? (
          <BoundingBoxOverlay
            imageUrl={image.dataUrl}
            items={visible}
            activeItemId={activeItemId}
            onSelect={handleSelect}
            isScanning={isScanning}
            hasFailed={status === "error"}
          />
        ) : (
          <div className="h-[60vh] w-full max-w-md animate-pulse rounded-2xl bg-surface-container" />
        )}
      </section>

      {/* Detections rail */}
      <aside className="flex w-full shrink-0 flex-col border-outline-variant bg-surface-container-lowest lg:h-full lg:w-[400px] lg:border-l">
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
              onClick={() => image && runDetection({ ...image, gender })}
            >
              <RotateCcw strokeWidth={1.5} />
              Tekrar dene
            </Button>
          </div>
        ) : result && (status === "done" || revealedCount > 0) ? (
          <>
            <ShopperGenderPicker value={gender} onChange={setGender} />
            <DetectedItemsPanel
              result={result}
              identified={visible}
              pending={pending}
              activeItemId={activeItemId}
              onSelect={handleSelect}
              isFiltered={isFiltered}
              onResetFilters={resetFilters}
            />
          </>
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

const GENDER_KEY = "markas:kime";

/**
 * Kimin için arandığını soran seçici.
 *
 * Neden fotoğraftan çıkarılmıyor: görünüşten cinsiyet tahmin etmek hem
 * güvenilmez hem de yapılmaması gereken bir şey. Varsayılan «fark etmez» ve
 * seçim yapılmadığı sürece hiçbir ürün bu yüzden elenmiyor.
 *
 * Seçim değişince tarama yeniden çalışıyor — sonucu değiştiren bir girdi, ve
 * sunucu önbelleğinin anahtarı da bunu içeriyor.
 */
function ShopperGenderPicker({
  value,
  onChange,
}: {
  value: ShopperGender | null;
  onChange: (next: ShopperGender | null) => void;
}) {
  const options: Array<{ label: string; value: ShopperGender | null }> = [
    { label: "Fark etmez", value: null },
    { label: "Kadın", value: "kadın" },
    { label: "Erkek", value: "erkek" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-gutter py-3">
      <span className="text-[13px] text-on-surface-variant">Kimin için:</span>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (option.value === null) window.localStorage.removeItem(GENDER_KEY);
              else window.localStorage.setItem(GENDER_KEY, option.value);
              onChange(option.value);
            }}
            className={
              active
                ? "rounded-full bg-primary px-3 py-1 text-[13px] font-medium text-on-primary"
                : "rounded-full border border-outline-variant px-3 py-1 text-[13px] text-on-surface-variant hover:bg-surface-container"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Static shell; the workspace itself reads `?kategori=` from the URL. */
export default function AnalyzePage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" />}>
      <AnalyzeWorkspace />
    </Suspense>
  );
}
