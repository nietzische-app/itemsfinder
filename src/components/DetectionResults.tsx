"use client";

import { LayoutGrid, Shirt, Sparkles, Target } from "lucide-react";

import { ProductCard } from "@/components/ProductCard";
import { Badge } from "@/components/ui/badge";
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
import type { DetectedItem, DetectionResult, ItemCategory } from "@/types";

interface DetectionResultsProps {
  result: DetectionResult;
  /** When set, only this item is shown — driven by the bounding box overlay. */
  activeItemId: string | null;
  onSelect: (itemId: string | null) => void;
}

const SECTIONS: Array<{
  category: ItemCategory;
  title: string;
  icon: typeof Shirt;
}> = [
  { category: "clothing", title: "Clothing & Accessories", icon: Shirt },
  { category: "beauty", title: "Beauty & Cosmetics", icon: Sparkles },
];

export function DetectionResults({
  result,
  activeItemId,
  onSelect,
}: DetectionResultsProps) {
  const visibleItems = activeItemId
    ? result.items.filter((item) => item.id === activeItemId)
    : result.items;

  /** Ordinal shared with the numbered pins on the image overlay. */
  const ordinals = new Map(result.items.map((item, index) => [item.id, index + 1]));

  return (
    <div className="space-y-10">
      {SECTIONS.map((section) => {
        const items = visibleItems.filter((item) => item.category === section.category);
        if (items.length === 0) return null;

        return (
          <section key={section.category} className="space-y-5">
            <header className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary">
                <section.icon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{section.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} item{items.length === 1 ? "" : "s"} detected
                </p>
              </div>
            </header>

            <div className="space-y-6">
              {items.map((item) => (
                <DetectedItemPanel
                  key={item.id}
                  item={item}
                  ordinal={ordinals.get(item.id) ?? 0}
                  isActive={activeItemId === item.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface DetectedItemPanelProps {
  item: DetectedItem;
  /** Matches the pin number drawn on the image overlay. */
  ordinal: number;
  isActive: boolean;
  onSelect: (itemId: string | null) => void;
}

function DetectedItemPanel({
  item,
  ordinal,
  isActive,
  onSelect,
}: DetectedItemPanelProps) {
  const allMatches = item.exactMatch ? [item.exactMatch, ...item.alternatives] : item.alternatives;

  return (
    <article
      id={`item-${item.id}`}
      className={cn(
        "scroll-mt-24 rounded-[1.5rem] border bg-card p-4 shadow-sm transition-all sm:p-5",
        isActive && "border-primary/50 ring-2 ring-primary/20",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelect(isActive ? null : item.id)}
          className="group min-w-0 flex-1 text-left"
          title="Highlight this item on the screenshot"
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {ordinal}
            </span>
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 rounded-full border shadow-inner"
              style={{ backgroundColor: item.colorHex }}
            />
            <h3 className="truncate font-semibold leading-tight group-hover:text-primary">
              {item.label}
            </h3>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border">
              {item.itemType}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </p>
        </button>

        {allMatches.length > 0 ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="shrink-0">
                <LayoutGrid className="h-4 w-4" />
                All {allMatches.length}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{item.label}</DialogTitle>
                <DialogDescription>{item.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-3">
                {allMatches.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    detectionId={item.id}
                    referencePrice={item.exactMatch?.price}
                  />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {item.description}
      </p>

      {item.exactMatch ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Exact match / closest look
          </p>
          <ProductCard
            product={item.exactMatch}
            detectionId={item.id}
            variant="hero"
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          No confident exact match yet — here are the closest things we found.
        </p>
      )}

      {item.alternatives.length > 0 ? (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Budget-friendly alternatives
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
    </article>
  );
}
