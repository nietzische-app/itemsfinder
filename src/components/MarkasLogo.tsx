import { cn } from "@/lib/utils";

interface MarkasMarkProps {
  className?: string;
  /** Overrides the coral dot, e.g. on a coral surface. */
  dotColor?: string;
  /**
   * `full` is the complete mark — tag with its hole and string — for large
   * display. `compact` drops those two details, which fall below a pixel or
   * two at UI sizes and only muddy the silhouette, and opens the tag up in
   * their place. Use it anywhere under ~48px.
   */
  variant?: "full" | "compact";
}

/**
 * The Markas mark: a camera focus frame around a tag, with the signature
 * coral dot. Detection (the frame) and the thing detected (the tag) in one
 * glyph.
 *
 * Strokes use `currentColor` so the mark inherits the surrounding text colour
 * and works on any surface; only the dot is fixed to the brand coral.
 */
export function MarkasMark({
  className,
  dotColor = "#E05638",
  variant = "full",
}: MarkasMarkProps) {
  const isCompact = variant === "compact";

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8", className)}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Focus frame */}
      <g
        stroke="currentColor"
        strokeWidth={isCompact ? 4.2 : 3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 23v-6a7 7 0 0 1 7-7h6" />
        <path d="M41 10h6a7 7 0 0 1 7 7v6" />
        <path d="M54 41v6a7 7 0 0 1-7 7h-6" />
        <path d="M23 54h-6a7 7 0 0 1-7-7v-6" />
      </g>

      {/* Tag */}
      <g transform="rotate(-19 32 34)">
        {isCompact ? (
          <>
            <path
              d="M24.5 21h9l8 8v15a3.5 3.5 0 0 1-3.5 3.5H24.5A3.5 3.5 0 0 1 21 44V24.5A3.5 3.5 0 0 1 24.5 21Z"
              stroke="currentColor"
              strokeWidth={3.8}
              strokeLinejoin="round"
            />
            <circle cx="31" cy="38.5" r="4.4" fill={dotColor} />
          </>
        ) : (
          <>
            <path
              d="M25.5 21.5h8.2l7.3 7.3V43a3.5 3.5 0 0 1-3.5 3.5H25.5A3.5 3.5 0 0 1 22 43V25a3.5 3.5 0 0 1 3.5-3.5Z"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinejoin="round"
            />
            <circle
              cx="35.8"
              cy="28.4"
              r="2.4"
              stroke="currentColor"
              strokeWidth={2.6}
            />
            <path
              d="M37.6 26.4c1.6-4.6 5.6-7 7.5-5.2 1.9 1.8-.3 5.6-3.9 7"
              stroke="currentColor"
              strokeWidth={2.8}
              strokeLinecap="round"
            />
            <circle cx="30.6" cy="39" r="3.8" fill={dotColor} />
          </>
        )}
      </g>
    </svg>
  );
}

interface MarkasLogoProps {
  className?: string;
  /** Size of the mark; the wordmark scales alongside it. */
  size?: "sm" | "md";
}

/** Mark + wordmark lockup, used in the app header. */
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
