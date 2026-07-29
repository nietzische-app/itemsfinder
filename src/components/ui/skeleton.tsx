import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder block. Uses an overlay sweep rather than a plain
 * pulse so long loading states read as "working" instead of "stuck".
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/10" />
    </div>
  );
}

export { Skeleton };
