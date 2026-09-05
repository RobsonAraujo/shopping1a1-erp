import { Skeleton } from "@/components/ui/skeleton";

export function ComprasPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="flex gap-3 overflow-x-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-[85vw] shrink-0 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/15 p-2 sm:w-72"
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
