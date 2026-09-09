import { Skeleton as Bar } from "@/components/ui/skeleton";

export function ProductsTableSkeletonRows() {
  return (
    <div className="space-y-3 px-4 py-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bar className="size-9 shrink-0 rounded-md" />
          <Bar className="h-4 w-1/3" />
          <Bar className="ml-auto h-4 w-14" />
          <Bar className="h-4 w-14" />
          <Bar className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}
