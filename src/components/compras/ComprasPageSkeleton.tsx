import { Skeleton } from "@/components/ui/skeleton";

export function ComprasPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Skeleton className="h-11 w-full rounded-lg sm:h-10 sm:w-64" />
        <Skeleton className="size-9 rounded-md sm:h-8 sm:w-28" />
      </div>
      <div className="flex gap-3 overflow-x-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-[calc(100vw-2.75rem)] shrink-0 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-2 sm:w-72"
          >
            <Skeleton className="h-9 w-full rounded-lg" />
            {Array.from({ length: 2 }).map((_, j) => (
              <Skeleton key={j} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
