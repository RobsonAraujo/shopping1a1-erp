import { Skeleton as Bar } from "@/components/ui/skeleton";

export function CatalogCompetitionReportSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar className="size-11 shrink-0 rounded-md" />
          <Bar className="h-4 w-1/3" />
          <Bar className="ml-auto h-4 w-16" />
          <Bar className="h-4 w-16" />
          <Bar className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
