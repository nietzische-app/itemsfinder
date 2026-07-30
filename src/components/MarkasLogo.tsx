import { cn } from "@/lib/utils";

interface MarkasMarkProps {
  className?: string;
  /** Overrides the coral dot, e.g. when the mark sits on a coral surface. */
  dotColor?: string;
  /**
   * `full` is the complete mark — including the tag's hole and string, which
   * are only a pixel or two wide below ~24px and there just muddy the
   * silhouette. `compact` drops them and thickens the strokes so the shape
   * still reads; use it for favicons and tight chrome.
   */
  variant?: "full" | "compact";
}

/**
 * The Markas mark, traced from the official artwork.
 *
 * A visual-search focus frame of four corner brackets, an angled clothing tag
 * sitting inside it with its hole and string breaking the top-right corner, and
 * the signature coral dot low on the tag face.
 *
 * The geometry was matched against the source PNG side by side at 300px: 1.6
 * stroke units, a 1.8-unit bracket radius, ~9.5-unit bracket arms, the tag at
 * roughly 60% of the frame width and rotated -23°. An earlier pass had the
 * strokes at 3.4 with a 6.5 bracket radius and a glow behind the dot, none of
 * which are in the original — it read as a heavier, blunter cousin of the logo.
 *
 * Strokes use `currentColor`, so the mark inherits the surrounding text colour
 * and works on any surface; only the dot is fixed to the brand coral. Being
 * vector, it stays crisp at every size and DPI — which is exactly why the
 * raster logo file is not used for the header, footer or favicon.
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
        strokeWidth={isCompact ? 2.6 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 24.5v-7.7A1.8 1.8 0 0 1 16.8 15H24.5" />
        <path d="M39.5 15h7.7A1.8 1.8 0 0 1 49 16.8v7.7" />
        <path d="M49 39.5v7.7a1.8 1.8 0 0 1-1.8 1.8h-7.7" />
        <path d="M24.5 49h-7.7A1.8 1.8 0 0 1 15 47.2v-7.7" />
      </g>

      {/* Tag */}
      <g transform="rotate(-23 32 32)">
        <path
          d="M26 22.5h8.6l4 4v13.6a2.4 2.4 0 0 1-2.4 2.4H26a2.4 2.4 0 0 1-2.4-2.4V24.9a2.4 2.4 0 0 1 2.4-2.4Z"
          stroke="currentColor"
          strokeWidth={isCompact ? 2.4 : 1.6}
          strokeLinejoin="round"
        />

        {!isCompact ? (
          <>
            <circle cx="35.3" cy="27" r="1.45" stroke="currentColor" strokeWidth={1.3} />
            <path
              d="M36.4 25.7c1.1-3.2 3.9-4.9 5.2-3.6 1.3 1.3-.2 3.9-2.5 4.8"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </>
        ) : null}

        <circle cx="29.9" cy="36.5" r={isCompact ? 2.6 : 2} fill={dotColor} />
      </g>
    </svg>
  );
}

interface MarkasLogoProps {
  className?: string;
  /** Size of the mark; the wordmark scales alongside it. */
  size?: "sm" | "header" | "md";
}

/**
 * Mark + wordmark lockup. The wordmark is Plus Jakarta Sans (the display
 * face, `font-display`) at extra-bold with tightened tracking, matching the
 * geometric weight of the mark.
 */
export function MarkasLogo({ className, size = "md" }: MarkasLogoProps) {
  const mark = MARK_SIZE[size];

  return (
    <span className={cn("flex items-center", mark.gap, className)}>
      {/* Every lockup size is under the ~48px threshold, so the mark uses the
          compact variant: the tag's hole and string are sub-pixel here and only
          smudge the silhouette. */}
      <MarkasMark variant="compact" className={mark.icon} />
      <span
        className={cn(
          "font-display font-extrabold leading-none tracking-tight",
          mark.text,
        )}
      >
        MARKAS
      </span>
    </span>
  );
}

/**
 * Lockup scales.
 *
 * `header` is `sm` scaled up ~27% — 28px mark to 36px, 20px wordmark to 25px —
 * which reads as the primary brand placement without crowding the 64px (mobile)
 * / 72px (desktop) bar: 36px leaves 14px of breathing room above and below.
 * The footer stays on `sm`, where the logo is a sign-off rather than the
 * headline.
 */
const MARK_SIZE: Record<
  NonNullable<MarkasLogoProps["size"]>,
  { icon: string; text: string; gap: string }
> = {
  sm: { icon: "h-7 w-7", text: "text-[20px]", gap: "gap-2.5" },
  header: { icon: "h-9 w-9", text: "text-[25px]", gap: "gap-3" },
  md: { icon: "h-9 w-9", text: "text-[26px] sm:text-[30px]", gap: "gap-2.5" },
};
