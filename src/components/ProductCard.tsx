"use client";

import { ArrowUpRight, BadgeCheck, Store, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildAffiliateUrl, formatPrice, savingsPercent } from "@/utils/affiliate";
import type { ProductMatch } from "@/types";

interface ProductCardProps {
  product: ProductMatch;
  /** Price of the exact match, used to show "save X%" on alternatives. */
  referencePrice?: number;
  /** Compact layout for the alternatives row. */
  variant?: "hero" | "compact";
  /** Detected-item id, forwarded as the affiliate sub-id for attribution. */
  detectionId: string;
}

export function ProductCard({
  product,
  referencePrice,
  variant = "compact",
  detectionId,
}: ProductCardProps) {
  const href = buildAffiliateUrl(product.productUrl, product.merchant, {
    subId: `${detectionId}:${product.id}`,
  });

  const savings =
    referencePrice && product.matchType === "alternative"
      ? savingsPercent(referencePrice, product.price)
      : 0;

  const isHero = variant === "hero";

  return (
    <Card
      className={cn(
        "group flex overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg",
        isHero
          ? "flex-row items-stretch border-primary/30 bg-gradient-to-br from-primary/[0.04] to-accent/[0.04]"
          : "flex-col",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden bg-muted",
          isHero ? "w-32 sm:w-36" : "aspect-square w-full",
        )}
      >
        {/* Catalogue thumbnails are inline SVG data URLs — nothing for
            next/image to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {product.tag ? (
          <Badge
            variant={isHero ? "default" : "secondary"}
            className="absolute left-2 top-2 shadow-sm"
          >
            {isHero ? <BadgeCheck className="h-3 w-3" /> : null}
            {product.tag}
          </Badge>
        ) : null}

        {!product.inStock ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
            <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
              Out of stock
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="min-w-0 space-y-1">
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Store className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {product.brand}
              {product.brand !== product.merchant ? ` · ${product.merchant}` : ""}
            </span>
          </p>
          <h4
            className={cn(
              "font-semibold leading-snug",
              isHero ? "text-base" : "line-clamp-2 text-sm",
            )}
          >
            {product.title}
          </h4>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn("font-bold", isHero ? "text-xl" : "text-lg")}>
            {formatPrice(product.price, product.currency)}
          </span>
          {savings > 0 ? (
            <Badge variant="success" className="gap-1">
              <TrendingDown className="h-3 w-3" />
              {savings}% less
            </Badge>
          ) : null}
        </div>

        <div className="mt-auto space-y-2 pt-1">
          <div
            className="flex items-center gap-2"
            title={`${Math.round(product.similarity * 100)}% visual similarity`}
          >
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${Math.round(product.similarity * 100)}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
              {Math.round(product.similarity * 100)}% match
            </span>
          </div>

          <Button
            asChild
            variant={isHero ? "gradient" : "outline"}
            size={isHero ? "default" : "sm"}
            className="w-full"
          >
            {/* `rel` is required: affiliate links are third-party and must not
                leak the referrer's opener. */}
            <a href={href} target="_blank" rel="noopener noreferrer sponsored nofollow">
              Get this item
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
