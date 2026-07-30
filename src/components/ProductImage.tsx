"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Product thumbnail with a graceful failure state.
 *
 * Catalogue images are inline SVG data URLs and always load, but live listings
 * point at retailer CDNs that go stale, rate-limit or block hotlinking. A
 * broken <img> would leave the alt text spilling across the card, so a failed
 * load collapses to a neutral placeholder instead.
 */
export function ProductImage({ src, alt, className }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset when the row is reused for a different product.
  useEffect(() => setFailed(false), [src]);

  /*
   * Catch a load that already failed before this effect ran. `onError` only
   * fires for failures after React attached the handler, so a cached 404 or a
   * server-rendered tag can leave a permanently broken image with the handler
   * never running.
   */
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, [src]);

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
      src={src}
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
      onError={() => setFailed(true)}
    />
  );
}
