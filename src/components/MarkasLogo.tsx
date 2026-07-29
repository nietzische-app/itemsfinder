import { useId } from "react";

import { cn } from "@/lib/utils";

interface MarkasMarkProps {
  className?: string;
  /** Overrides the coral dot, e.g. when the mark sits on a coral surface. */
  dotColor?: string;
  /**
   * `full` is the complete mark — the tag's hole, string and the glow around
   * the dot. `compact` drops those, which fall below a pixel or two at UI
   * sizes and only muddy the silhouette. Use it anywhere under ~48px.
   */
  variant?: "full" | "compact";
}

/**
 * The Markas mark.
 *
 * Geometry follows the official logo: a visual-search focus frame of four
 * corner brackets, an angled clothing tag filling most of that frame, and the
 * signature coral dot low on the tag face with a soft glow behind it.
 *
 * Strokes use `currentColor`, so the mark inherits the surrounding text colour
 * and works on any surface; only the dot is fixed to the brand coral.
 *
 * Note the stroke weights are heavier than the source artwork's. The original
 * is drawn for large display; at 32–40px in the header those hairlines
 * disappear, so they are scaled up to hold their shape in the UI.
 */
export function MarkasMark({
  className,
  dotColor = "#E05638",
  variant = "full",
}: MarkasMarkProps) {
  // Unique per instance: several marks can share a page (header, footer, OG).
  const glowId = useId();
  const isCompact = variant === "compact";

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8", className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {!isCompact ? (
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={dotColor} stopOpacity={0.4} />
            <stop offset="100%" stopColor={dotColor} stopOpacity={0} />
          </radialGradient>
        </defs>
      ) : null}

      {/* Focus frame */}
      <g
        stroke="currentColor"
        strokeWidth={isCompact ? 4 : 3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22v-3.5A6.5 6.5 0 0 1 18.5 12H22" />
        <path d="M42 12h3.5a6.5 6.5 0 0 1 6.5 6.5V22" />
        <path d="M52 42v3.5a6.5 6.5 0 0 1-6.5 6.5H42" />
        <path d="M22 52h-3.5A6.5 6.5 0 0 1 12 45.5V42" />
      </g>

      {/* Tag */}
      <g transform="translate(-1 0.6) rotate(-20 32 33)">
        <path
          d="M24.4 18.4H37l6.6 6.6v18.6a4 4 0 0 1-4 4H24.4a4 4 0 0 1-4-4V22.4a4 4 0 0 1 4-4Z"
          stroke="currentColor"
          strokeWidth={isCompact ? 3.8 : 3}
          strokeLinejoin="round"
        />

        {!isCompact ? (
          <>
            <circle
              cx="38"
              cy="26.4"
              r="2.2"
              stroke="currentColor"
              strokeWidth={2.6}
            />
            <path
              d="M40.1 24.4c1.4-3.7 4.8-5.6 6.4-4.1 1.6 1.5-.1 4.6-3 5.8"
              stroke="currentColor"
              strokeWidth={2.8}
              strokeLinecap="round"
            />
            <circle cx="32" cy="41" r="6.6" fill={`url(#${glowId})`} />
          </>
        ) : null}

        <circle cx="32" cy="41" r={isCompact ? 4 : 3.5} fill={dotColor} />
      </g>
    </svg>
  );
}

interface MarkasLogoProps {
  className?: string;
  /** Size of the mark; the wordmark scales alongside it. */
  size?: "sm" | "md";
}

/**
 * Mark + wordmark lockup. The wordmark is Plus Jakarta Sans (the display
 * face, `font-display`) at extra-bold with tightened tracking, matching the
 * geometric weight of the mark.
 */
export function MarkasLogo({ className, size = "md" }: MarkasLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* Header sizes sit well under the 48px threshold for the full mark. */}
      <MarkasMark
        variant="compact"
        className={size === "sm" ? "h-7 w-7" : "h-9 w-9"}
      />
      <span
        className={cn(
          "font-display font-extrabold leading-none tracking-tight",
          size === "sm" ? "text-[20px]" : "text-[26px] sm:text-[30px]",
        )}
      >
        MARKAS
      </span>
    </span>
  );
}
