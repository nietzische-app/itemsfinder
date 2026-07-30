"use client";

import { useState } from "react";
import { ArrowUpRight, BadgeCheck, Bookmark, TrendingDown } from "lucide-react";

import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSavedProducts } from "@/lib/savedItems";
import { merchantColor, merchantInitials } from "@/services/merchantSearch";
import { isDirectProductUrl } from "@/services/productUrls";
import { cn } from "@/lib/utils";
import { buildAffiliateUrl, formatPrice, savingsPercent } from "@/utils/affiliate";
import type { ProductMatch } from "@/types";

interface ProductCardProps {
  product: ProductMatch;
  /** Price of the exact match, used to show "% daha uygun" on alternatives. */
  referencePrice?: number;
  /** `hero` is the exact match; `row` is a compact alternative. */
  variant?: "hero" | "row";
  /** Detected-item id, forwarded as the affiliate sub-id for attribution. */
  detectionId: string;
}

/**
 * Product surface: rounded image container, retailer badge, bold price and a
 * matte-black pill CTA. The exact match additionally carries a coral verified
 * ring, so "birebir eşleşme" reads at a glance without extra copy.
 */
export function ProductCard({
  product,
  referencePrice,
  variant = "row",
  detectionId,
}: ProductCardProps) {
  const [logoFailed, setLogoFailed] = useState(false);
  const { toast } = useToast();
  const { isSaved, toggle } = useSavedProducts();
  const saved = isSaved(product.id);

  const savings =
    referencePrice && product.matchType === "alternative"
      ? savingsPercent(referencePrice, product.price)
      : 0;

  const isHero = variant === "hero";
  const retailer = product.brandMetadata?.name ?? product.merchant;
  // Absolute ban: never render a storefront search URL on the CTA.
  const pdpUrl =
    product.productUrl && isDirectProductUrl(product.productUrl)
      ? product.productUrl
      : "";
  const href = pdpUrl
    ? buildAffiliateUrl(pdpUrl, product.merchant, {
        subId: `${detectionId}:${product.id}`,
      })
    : "";

  return (
    <article
      className={cn(
        "flex min-w-0 gap-4 rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:shadow-xl",
        isHero
          ? // Verified ring: coral hairline plus a soft halo.
            "border-secondary/35 bg-surface-container-lowest shadow-[0_0_0_3px_rgba(224,86,56,0.06),0_4px_20px_rgba(0,0,0,0.05)]"
          : "border-outline-variant/70 bg-surface hover:border-primary hover:shadow-ambient",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-2xl bg-surface-container",
          isHero ? "h-32 w-24" : "h-[84px] w-16",
        )}
      >
        <ProductImage src={product.imageUrl} alt={product.title} />
        {!product.inStock ? (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/85 text-center text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Tükendi
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            {/* Retailer badge — the Brand API supplies the logo and its colour
                in live mode; otherwise the merchant name stands alone. */}
            <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-outline-variant/70 bg-surface-container-lowest px-2 py-0.5 text-[11px] font-semibold uppercase text-on-surface-variant">
              {product.brandMetadata?.logoUrl && !logoFailed ? (
                <span
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px]"
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
                    // A dead CDN URL would otherwise leave a broken-image glyph
                    // sitting inside the badge.
                    onError={() => setLogoFailed(true)}
                  />
                </span>
              ) : (
                // No live logo: a chip in the retailer's own brand colour still
                // makes the store recognisable at a glance.
                <span
                  aria-hidden="true"
                  className="flex h-4 shrink-0 items-center justify-center rounded-[4px] px-1 text-[9px] font-bold leading-none text-white"
                  style={{ backgroundColor: merchantColor(product.merchant) }}
                >
                  {merchantInitials(product.merchant)}
                </span>
              )}
              <span className="truncate">{retailer}</span>
            </span>

            {isHero ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-deep"
                title="Birebir Eşleşme"
                aria-label="Birebir Eşleşme"
              >
                <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />
                Birebir Eşleşme
              </span>
            ) : product.tag ? (
              <Badge variant="muted" className="shrink-0 text-[10px]">
                {product.tag}
              </Badge>
            ) : null}
          </div>

          <h4
            className={cn(
              "mt-1.5 font-display font-semibold leading-tight text-primary",
              isHero ? "text-[18px]" : "text-[15px]",
            )}
          >
            {product.title}
          </h4>

          <p className="mt-1 text-[12px] text-on-surface-variant">
            %{Math.round(product.similarity * 100)} görsel benzerlik
            {product.isLive ? (
              <span className="ml-1.5 text-secondary-deep">· canlı fiyat</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display font-bold tracking-tight text-primary",
                isHero ? "text-[22px]" : "text-[17px]",
              )}
            >
              {formatPrice(product.price, product.currency)}
            </span>
            {savings > 0 ? (
              <Badge variant="success" className="whitespace-nowrap text-[10px]">
                <TrendingDown className="h-3 w-3" strokeWidth={2} />%{savings} daha uygun
              </Badge>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const state = toggle(product);
                toast(
                  state === "saved" ? "Kaydedilenlere eklendi" : "Kayıtlılardan çıkarıldı",
                );
              }}
              aria-pressed={saved}
              aria-label={saved ? "Kayıtlılardan çıkar" : "Kaydet"}
              title={saved ? "Kayıtlılardan çıkar" : "Kaydet"}
              className={cn(
                "rounded-full p-2 transition-colors",
                saved
                  ? "bg-primary/[0.06] text-primary"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-primary",
              )}
            >
              <Bookmark
                className="h-4 w-4"
                strokeWidth={1.75}
                fill={saved ? "currentColor" : "none"}
              />
            </button>

            {pdpUrl ? (
              <Button asChild size="sm">
                {/* Affiliate links are third-party: never leak the opener. */}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer sponsored nofollow"
                >
                  {isHero ? "Ürüne git" : "İncele"}
                  <ArrowUpRight strokeWidth={1.5} />
                </a>
              </Button>
            ) : (
              <span className="rounded-full bg-surface-container px-3 py-1.5 text-label-sm uppercase text-outline">
                Bağlantı yok
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
