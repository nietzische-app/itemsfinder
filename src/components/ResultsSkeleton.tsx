import { Skeleton } from "@/components/ui/skeleton";

interface ResultsSkeletonProps {
  /** How many placeholder detection cards to show. */
  count?: number;
}

/** Placeholder rail shown before the first detection streams in. */
export function ResultsSkeleton({ count = 3 }: ResultsSkeletonProps) {
  return (
    <div className="space-y-3 p-gutter" aria-busy="true" aria-live="polite">
      <span className="sr-only">Görsel analiz ediliyor…</span>

      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
        >
          <Skeleton className="h-24 w-20 shrink-0" />
          <div className="flex flex-1 flex-col justify-between gap-2">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
