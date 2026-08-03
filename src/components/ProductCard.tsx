"use client";

import { useState } from "react";
import { ArrowUpRight, BadgeCheck, Bookmark, Star, TrendingDown } from "lucide-react";

import { ProductImage } from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSavedProducts } from "@/lib/savedItems";
import {
  merchantColor,
  merchantInitials,
  merchantLabel,
  merchantTextColor,
} from "@/services/merchantSearch";
import { cn } from "@/lib/utils";
import {
  buildAffiliateUrl,
  formatPrice,
  priceIsShowable,
  savingsPercent,
} from "@/utils/affiliate";
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

  const href = buildAffiliateUrl(product.productUrl, product.merchant, {
    subId: `${detectionId}:${product.id}`,
  });

  /*
   * Fiyat ve ondan türeyen indirim iddiası, aynı kapıdan geçiyor.
   *
   * «%X daha uygun» bir gösterim değil, dünya hakkında bir iddia — ve gizlenmiş
   * bir referans fiyata karşı hesaplanırsa dayanağı görünmeyen bir iddia olur.
   * Fiyat gösterilemiyorsa rozet de düşüyor.
   */
  const showPrice = priceIsShowable(product);
  const savings =
    showPrice && referencePrice && product.matchType === "alternative"
      ? savingsPercent(referencePrice, product.price)
      : 0;

  const isHero = variant === "hero";
  /*
   * Rozette yazan ad, bağlantının gerçekten açtığı yer.
   *
   * Eskiden `product.merchant` yazıyordu ve o katalogdaki elle girilmiş değerdi;
   * doğrulanmış bağlantılar gelince on dört üründen on biri Zara rozetiyle
   * Boyner'e gitmeye başladı. Tanınmayan mağazalarda marka adı uydurmak yerine
   * alan adı gösteriliyor — kullanıcının tıkladığında göreceği şeyin aynısı.
   */
  const retailer =
    product.brandMetadata?.name ?? merchantLabel(product.merchant, product.merchantDomain);

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
                  className="flex h-4 shrink-0 items-center justify-center rounded-[4px] px-1 text-[9px] font-bold leading-none"
                  style={{
                    backgroundColor: merchantColor(product.merchant),
                    color: merchantTextColor(product.merchant),
                  }}
                >
                  {merchantInitials(product.merchant, product.merchantDomain)}
                </span>
              )}
              <span className="truncate">{retailer}</span>
            </span>

            {isHero ? (
              <span
                className="shrink-0 text-secondary-deep"
                title="Birebir eşleşme"
                aria-label="Birebir eşleşme"
              >
                <BadgeCheck className="h-4 w-4" strokeWidth={2} />
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

          {/*
            Still "eşleşme puanı" rather than "görsel benzerlik", because the two
            kinds of row mean different things by it and one label has to cover
            both. A live row's score is measured: attribute agreement against the
            detection, blended with a pixel comparison between the scanned region
            and the retailer's photo when one could be fetched (attributeMatch.ts,
            visualDescriptor.ts). A catalogue row's is an authored constant — the
            catalogue ships generated SVG thumbnails, so there is no photograph to
            compare and nothing to measure. Calling the pair "visual similarity"
            would be true of one and false of the other.
          */}
          <p className="mt-1 text-[12px] text-on-surface-variant">
            %{Math.round(product.similarity * 100)} eşleşme puanı
            {product.isLive ? (
              <span className="ml-1.5 text-secondary-deep">· canlı fiyat</span>
            ) : null}
          </p>

          {/*
            Mağazanın kendi puanı — bizimki değil.

            `rating` yalnızca canlı satırlarda dolduruluyor ve katalogda karşılığı
            yok, yani demo modunda hiç görünmüyor: uydurma bir puan, gerçek bir
            mağaza bağlantısının yanında uydurma bir fiyat kadar yanıltıcı olurdu.

            Yorum **metni** gösterilmiyor, bilerek. Metin kullanıcının yazdığı,
            mağazanın barındırdığı içerik; puan ve adet ise sayfada yazan bir olgu.
            Yorumları okumak isteyen «Ürüne git» ile mağazaya gidiyor — kaynağı da
            burada yazıyor, sayı bizim ölçtüğümüz bir şey sanılmasın diye.
          */}
          {typeof product.rating === "number" ? (
            <p className="mt-1 flex items-center gap-1 text-[12px] text-on-surface-variant">
              <Star className="h-3.5 w-3.5 fill-current text-secondary-deep" strokeWidth={0} />
              <span className="font-semibold text-on-surface">
                {product.rating.toLocaleString("tr-TR", { minimumFractionDigits: 1 })}
              </span>
              {typeof product.reviewCount === "number" ? (
                <span>· {product.reviewCount.toLocaleString("tr-TR")} değerlendirme</span>
              ) : null}
              <span className="text-outline">· {retailer}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display font-bold tracking-tight text-primary",
                isHero ? "text-[22px]" : "text-[17px]",
              )}
            >
              {/* Puan fiyatın hemen üstünde: ikisi de mağazanın söylediği şey. */}
              {showPrice ? (
                formatPrice(product.price, product.currency)
              ) : (
                <span className="text-[13px] font-semibold text-outline">Fiyat mağazada</span>
              )}
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

            {product.productUrl ? (
              <Button asChild size="sm">
                {/* Affiliate links are third-party: never leak the opener. */}
                {/* Every link that reaches here is a verified product detail
                    page, so the label can promise exactly that. */}
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
              // No verified product page for this row. Better an inert card than
              // a CTA that lands on a search-results page.
              <span
                className="rounded-full bg-surface-container px-3 py-1.5 text-label-sm uppercase text-outline"
                title="Bu ürün için doğrulanmış ürün sayfası bağlantısı yok"
              >
                Bağlantı doğrulanmadı
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
