import { Skeleton } from "@/components/ui/skeleton";

export function FornecedoresPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-8 w-40 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-md" />
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3"
          >
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-4 w-10 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
