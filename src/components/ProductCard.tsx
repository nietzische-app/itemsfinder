"use client";

import { useState } from "react";
import { ArrowUpRight, TrendingDown } from "lucide-react";

import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildAffiliateUrl, formatPrice, savingsPercent } from "@/utils/affiliate";
import type { ProductMatch } from "@/types";

interface ProductCardProps {
  product: ProductMatch;
  /** Price of the exact match, used to show "% less" on alternatives. */
  referencePrice?: number;
  /** `hero` is the exact match; `row` is a compact alternative. */
  variant?: "hero" | "row";
  /** Detected-item id, forwarded as the affiliate sub-id for attribution. */
  detectionId: string;
}

/**
 * Product surface: portrait imagery (3:4, industry standard), left-aligned
 * type, bold price. The coral CTA is reserved for the exact match — the
 * design system keeps coral for conversion moments only.
 */
export function ProductCard({
  product,
  referencePrice,
  variant = "row",
  detectionId,
}: ProductCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const href = buildAffiliateUrl(product.productUrl, product.merchant, {
    subId: `${detectionId}:${product.id}`,
  });

  const savings =
    referencePrice && product.matchType === "alternative"
      ? savingsPercent(referencePrice, product.price)
      : 0;

  const isHero = variant === "hero";

  return (
    <article
      className={cn(
        "flex min-w-0 gap-4 rounded-lg border p-4 transition-all",
        isHero
          ? "border-primary/15 bg-surface-container-lowest shadow-ambient"
          : "border-outline-variant bg-surface hover:border-primary",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded bg-surface-container",
          isHero ? "h-32 w-24" : "h-[84px] w-16",
        )}
      >
        <ProductImage src={product.imageUrl} alt={product.title} />
        {!product.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/80 text-center text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Sold out
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="label flex min-w-0 items-center gap-1.5 text-outline">
              {/* Retailer logo comes from the Brand API in live mode; the chip
                  is tinted with the brand's own colour. */}
              {product.brandMetadata?.logoUrl && !logoFailed ? (
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm"
                  style={{
                    backgroundColor: product.brandMetadata.colorHex ?? undefined,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.brandMetadata.logoUrl}
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-contain"
                    loading="lazy"
                    // A dead CDN URL would otherwise leave a broken-image
                    // glyph sitting in the retailer line.
                    onError={() => setLogoFailed(true)}
                  />
                </span>
              ) : null}
              <span className="truncate">
                {product.brand === product.merchant
                  ? product.brand
                  : `${product.brand} · ${product.brandMetadata?.name ?? product.merchant}`}
              </span>
            </p>
            {/* The hero card sits under an "Exact match / closest look"
                heading, so repeating the tag there just crowds the brand. */}
            {product.tag && !isHero ? (
              <Badge variant="muted" className="shrink-0 text-[10px]">
                {product.tag}
              </Badge>
            ) : null}
          </div>

          <h4
            className={cn(
              "mt-1 font-display font-semibold leading-tight text-primary",
              isHero ? "text-[18px]" : "text-[15px]",
            )}
          >
            {product.title}
          </h4>

          <p className="mt-1 text-[12px] text-on-surface-variant">
            {Math.round(product.similarity * 100)}% visual match
            {product.isLive ? (
              <span className="ml-1.5 text-secondary-deep">· live price</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn("font-bold text-primary", isHero ? "text-[20px]" : "text-body-md")}
            >
              {formatPrice(product.price, product.currency)}
            </span>
            {savings > 0 ? (
              <Badge variant="success" className="text-[10px]">
                <TrendingDown className="h-3 w-3" strokeWidth={2} />
                {savings}% less
              </Badge>
            ) : null}
          </div>

          <Button
            asChild
            variant={isHero ? "coral" : "outline"}
            size="sm"
            className="shrink-0"
          >
            {/* Affiliate links are third-party: never leak the opener. */}
            <a href={href} target="_blank" rel="noopener noreferrer sponsored nofollow">
              {isHero ? "Get this item" : "Shop"}
              <ArrowUpRight strokeWidth={1.5} />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
