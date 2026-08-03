"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  /**
   * `src` yüklenmezse denenecek ikinci adres.
   *
   * Canlı satırlar mağaza CDN'ine bağlanıyor ve o adresler bayatlıyor, hız
   * sınırına takılıyor ya da hotlink'i engelliyor. Yedeksiz hâlde kart nötr bir
   * "görsel yok" ikonuna düşüyordu — dürüst ama tanınmaz. Katalogun çizdiği
   * siluet, hiç değilse neyin satıldığını gösteriyor ve veri URL'i olduğu için
   * kendisi hiç başarısız olamıyor.
   */
  fallbackSrc?: string;
}

/**
 * Product thumbnail with a graceful failure state.
 *
 * Catalogue images are inline SVG data URLs and always load, but live listings
 * point at retailer CDNs that go stale, rate-limit or block hotlinking. A
 * broken <img> would leave the alt text spilling across the card, so a failed
 * load collapses to a neutral placeholder instead.
 */
export function ProductImage({ src, alt, className, fallbackSrc }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  /** Yedeğe geçildi mi — ikinci bir başarısızlıkta sonsuz döngü olmasın diye. */
  const [usingFallback, setUsingFallback] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset when the row is reused for a different product.
  useEffect(() => {
    setFailed(false);
    setUsingFallback(false);
  }, [src]);

  const current = usingFallback && fallbackSrc ? fallbackSrc : src;

  /** Yedek varsa ve henüz denenmediyse ona geç; yoksa ikona düş. */
  const handleFailure = () => {
    if (fallbackSrc && !usingFallback) setUsingFallback(true);
    else setFailed(true);
  };

  /*
   * Catch a load that already failed before this effect ran. `onError` only
   * fires for failures after React attached the handler, so a cached 404 or a
   * server-rendered tag can leave a permanently broken image with the handler
   * never running.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) handleFailure();
    // `handleFailure` her render'da yeniden kuruluyor; bağımlılık `current`,
    // çünkü asıl izlenen şey hangi adresin denendiği.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (failed) {
    return (
      <span
        className={cn(
          "flex h-full w-full items-center justify-center bg-surface-container",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-5 w-5 text-outline-variant" strokeWidth={1.5} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      src={current}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      decoding="async"
      /*
       * Retailer CDNs commonly reject requests whose Referer is not their own
       * site, which is the usual reason a live listing's thumbnail arrives
       * broken. Sending no referrer at all gets served; it also stops us leaking
       * which Markas page the shopper was on.
       */
      referrerPolicy="no-referrer"
      onError={handleFailure}
    />
  );
}
