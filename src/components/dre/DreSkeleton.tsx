import { Skeleton } from "@/components/ui/skeleton";

export function DreSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-32 rounded-md" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
            <Skeleton className="h-4 w-36 shrink-0 rounded-md" />
            <div className="flex flex-1 gap-2 overflow-hidden">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-16 shrink-0 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
