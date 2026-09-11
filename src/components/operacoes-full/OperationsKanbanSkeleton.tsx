import { Skeleton } from "@/components/ui/skeleton";

export function OperationsKanbanSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-hidden sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div
          key={col}
          className="w-[calc(100vw-2.75rem)] shrink-0 space-y-3 sm:w-auto"
        >
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 3 }).map((_, card) => (
            <Skeleton key={card} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
