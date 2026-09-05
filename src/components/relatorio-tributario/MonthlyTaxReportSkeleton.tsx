import { Skeleton } from "@/components/ui/skeleton";

export function MonthlyTaxReportSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
