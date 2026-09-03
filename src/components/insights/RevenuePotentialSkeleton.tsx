import { Skeleton as Bar } from "@/components/ui/skeleton";

export function RevenuePotentialSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-4 py-3"
          >
            <Bar className="h-3 w-28" />
            <Bar className="mt-2 h-7 w-24" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Bar className="h-9 w-full sm:max-w-sm" />
        <Bar className="h-9 w-44" />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 shadow-sm sm:px-5">
        <Bar className="mb-4 h-3 w-2/3" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar className="size-8 shrink-0 rounded-md" />
              <Bar className="h-4 w-1/4" />
              <Bar className="h-4 w-16" />
              <Bar className="ml-auto h-4 w-20" />
              <Bar className="h-4 w-20" />
              <Bar className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
