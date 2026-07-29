import { cn } from "@/lib/utils";

/** Tonal placeholder block, matching the design system's container greys. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded bg-surface-container-high", className)}
      {...props}
    />
  );
}

export { Skeleton };
