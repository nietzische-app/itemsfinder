"use client";

import { CheckCircle2, ChevronDown, Loader2, ShoppingBasket } from "lucide-react";

import { EngineBadge } from "@/components/EngineBadge";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/utils/affiliate";
import type { DetectedItem, DetectionResult, ItemCategory } from "@/types";

interface DetectedItemsPanelProps {
  /** Provenance of the scan, surfaced as the engine badge. */
  result: DetectionResult;
  /** Detections that have finished matching. */
  identified: DetectedItem[];
  /** The detection currently being matched, if a scan is still running. */
  pending: DetectedItem | null;
  activeItemId: string | null;
  onSelect: (itemId: string | null) => void;
}

const SECTION_TITLES: Record<ItemCategory, string> = {
  clothing: "Clothing & Accessories",
  beauty: "Beauty & Cosmetics",
};

/**
 * The "AI Detected Items" rail. Each detection is a compact card; selecting
 * one expands it in place to reveal the exact match and the cheaper
 * alternatives, and highlights the matching hotspot on the image.
 */
export function DetectedItemsPanel({
  result,
  identified,
  pending,
  activeItemId,
  onSelect,
}: DetectedItemsPanelProps) {
  const categories: ItemCategory[] = ["clothing", "beauty"];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant p-gutter">
        <h2 className="font-display text-headline-md text-primary">AI Detected Items</h2>
        <p className="mt-1 text-[14px] text-on-surface-variant">
          {pending
            ? "Refining visual matches across our retailer index."
            : `${identified.length} item${identified.length === 1 ? "" : "s"} matched — tap one to see alternatives.`}
        </p>
        <EngineBadge result={result} className="mt-3" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-gutter pb-8">
        {categories.map((category) => {
          const items = identified.filter((item) => item.category === category);
          if (items.length === 0) return null;

          return (
            <section key={category} className="mb-8 last:mb-0">
              <h3 className="label mb-3 text-outline">{SECTION_TITLES[category]}</h3>
              <div className="space-y-3">
                {items.map((item) => (
                  <DetectedItemCard
                    key={item.id}
                    item={item}
                    isActive={activeItemId === item.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {pending ? <PendingItemCard item={pending} /> : null}

        {identified.length === 0 && !pending ? (
          <p className="py-12 text-center text-on-surface-variant">
            No shoppable items found in this image. Try a clearer, closer shot.
          </p>
        ) : null}
      </div>

      {identified.length > 0 ? (
        <footer className="space-y-3 border-t border-outline-variant bg-surface p-gutter">
          <CuratedLookDialog items={identified} />
          <p className="label text-center text-[10px] text-outline">
            Matches refreshed from our retailer index
          </p>
        </footer>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface DetectedItemCardProps {
  item: DetectedItem;
  isActive: boolean;
  onSelect: (itemId: string | null) => void;
}

function DetectedItemCard({ item, isActive, onSelect }: DetectedItemCardProps) {
  return (
    <article
      id={`item-${item.id}`}
      className={cn(
        "scroll-mt-4 overflow-hidden rounded-lg border bg-surface-container-lowest transition-all",
        isActive
          ? "border-primary shadow-ambient"
          : "border-outline-variant hover:border-primary",
      )}
    >
      <button
        type="button"
        aria-expanded={isActive}
        onClick={() => onSelect(isActive ? null : item.id)}
        className="flex w-full min-w-0 gap-4 p-4 text-left"
      >
        <span className="h-24 w-20 shrink-0 overflow-hidden rounded bg-surface-container">
          {item.exactMatch ? (
            <ProductImage src={item.exactMatch.imageUrl} alt="" />
          ) : (
            <span
              aria-hidden="true"
              className="block h-full w-full"
              style={{ backgroundColor: item.colorHex }}
            />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col justify-between">
          <span className="min-w-0">
            <span className="mb-1 flex items-center justify-between gap-2">
              <span className="label text-[10px] text-secondary">Identified</span>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2} />
            </span>
            <span className="block font-display text-[16px] font-semibold leading-tight text-primary">
              {item.label}
            </span>
            <span className="mt-0.5 block text-[12px] text-on-surface-variant">
              {item.attributes}
            </span>
          </span>

          <span className="mt-2 flex items-center justify-between gap-2">
            <span className="shrink-0 font-bold text-primary">
              {item.exactMatch
                ? formatPrice(item.exactMatch.price, item.exactMatch.currency)
                : "—"}
            </span>
            <span
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary px-4 text-label-sm uppercase tracking-[0.05em] text-on-primary transition-opacity",
                isActive && "bg-surface-container text-on-surface",
              )}
            >
              {isActive ? (
                "Hide"
              ) : (
                <>
                  {/* The rail is ~340px on phones — drop the verb so the price
                      beside it never has to truncate. */}
                  <span className="hidden sm:inline">Find&nbsp;</span>Matches
                </>
              )}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", isActive && "rotate-180")}
                strokeWidth={1.5}
              />
            </span>
          </span>
        </span>
      </button>

      {isActive ? (
        <div className="animate-fade-up space-y-4 border-t border-outline-variant p-4">
          <p className="text-[14px] leading-relaxed text-on-surface-variant">
            {item.description}
          </p>

          {item.exactMatch ? (
            <div className="space-y-2">
              <h4 className="label text-outline">Exact match / closest look</h4>
              <ProductCard
                product={item.exactMatch}
                detectionId={item.id}
                variant="hero"
              />
            </div>
          ) : (
            <p className="rounded bg-surface-container p-3 text-[14px] text-on-surface-variant">
              No confident exact match yet — here are the closest things we found.
            </p>
          )}

          {item.alternatives.length > 0 ? (
            <div className="space-y-2">
              <h4 className="label text-outline">Budget-friendly alternatives</h4>
              <div className="space-y-2">
                {item.alternatives.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    detectionId={item.id}
                    referencePrice={item.exactMatch?.price}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/** The detection currently being matched — greyed out with a spinner. */
function PendingItemCard({ item }: { item: DetectedItem }) {
  return (
    <article className="flex gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 opacity-60">
      <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded bg-surface-container">
        {item.exactMatch ? (
          <ProductImage src={item.exactMatch.imageUrl} alt="" className="grayscale" />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" strokeWidth={1.5} />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <p className="label mb-1 text-[10px] text-outline">Matching…</p>
          <p className="font-display text-[16px] font-semibold leading-tight text-primary">
            {item.label}
          </p>
          <p className="mt-0.5 text-[12px] text-on-surface-variant">{item.attributes}</p>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="h-4 w-16 animate-pulse rounded bg-surface-container-high" />
          <span className="inline-flex h-8 cursor-not-allowed items-center rounded-full bg-outline px-4 text-label-sm uppercase tracking-[0.05em] text-on-primary">
            Wait…
          </span>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/** Every exact match in one place, with the total cost of recreating the look. */
function CuratedLookDialog({ items }: { items: DetectedItem[] }) {
  const matches = items.flatMap((item) =>
    item.exactMatch ? [{ item, product: item.exactMatch }] : [],
  );

  const currency = matches[0]?.product.currency ?? "USD";
  const exactTotal = matches.reduce((sum, entry) => sum + entry.product.price, 0);

  // Cheapest route through the look: the lowest-priced option per item.
  const budgetTotal = items.reduce((sum, item) => {
    const prices = [
      ...(item.exactMatch ? [item.exactMatch.price] : []),
      ...item.alternatives.map((alternative) => alternative.price),
    ];
    return prices.length > 0 ? sum + Math.min(...prices) : sum;
  }, 0);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="coral" size="block">
          <ShoppingBasket strokeWidth={1.5} />
          View curated look
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>The full look</DialogTitle>
          <DialogDescription>
            {matches.length} exact match{matches.length === 1 ? "" : "es"} —{" "}
            {formatPrice(exactTotal, currency)} to buy as-is, or{" "}
            {formatPrice(budgetTotal, currency)} taking the cheapest option for each
            item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {matches.map(({ item, product }) => (
            <ProductCard
              key={product.id}
              product={product}
              detectionId={item.id}
              variant="hero"
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
