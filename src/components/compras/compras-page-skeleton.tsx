import { Skeleton } from "@/components/ui/skeleton";

export function ComprasPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-56 rounded-xl" />
        ))}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="ml-auto h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
