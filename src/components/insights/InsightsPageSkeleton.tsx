import { Skeleton } from "@/components/ui/skeleton";

export function InsightsPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-5 sm:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-7 w-14" />
              <Skeleton className="mt-1 h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-3 w-40" />
          {Array.from({ length: 2 }).map((_, card) => (
            <Skeleton key={card} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
