import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ResultsSkeletonProps {
  /** How many detected-item groups to fake. */
  groups?: number;
}

/** Placeholder for the results pane while the vision engine is running. */
export function ResultsSkeleton({ groups = 2 }: ResultsSkeletonProps) {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Analysing your look…</span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      {Array.from({ length: groups }).map((_, groupIndex) => (
        <section key={groupIndex} className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>

          <Card className="flex flex-row overflow-hidden">
            <Skeleton className="h-40 w-32 rounded-none sm:w-36" />
            <div className="flex-1 space-y-3 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <Card key={cardIndex} className="overflow-hidden">
                <Skeleton className="aspect-[4/5] w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-8 w-full rounded-full" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
