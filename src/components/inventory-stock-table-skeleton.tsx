import { Skeleton } from "@/components/ui/skeleton";

export function InventoryStockTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="ml-auto h-4 w-14" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
