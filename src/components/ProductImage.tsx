"use client";

import { useEffect, useState } from "react";
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

  // Reset when the row is reused for a different product.
  useEffect(() => setFailed(false), [src]);

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
      src={src}
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
