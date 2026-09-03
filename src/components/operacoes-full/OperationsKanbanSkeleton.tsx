import { Skeleton } from "@/components/ui/skeleton";

export function OperationsKanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} className="space-y-3">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 3 }).map((_, card) => (
            <Skeleton key={card} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}
