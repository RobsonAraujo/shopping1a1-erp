import { Skeleton } from "@/components/ui/skeleton";

export function RotinaSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando a Central de anúncios">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <div className="px-5 pb-5 pt-5 sm:px-8 sm:pt-6">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div>
              <Skeleton className="h-8 w-56" />
              <Skeleton className="mt-2 h-4 w-44" />
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-10">
            <div className="flex gap-8">
              {[0, 1, 2].map((key) => (
                <div key={key}>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-6 w-10" />
                </div>
              ))}
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-3 sm:px-8">
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:justify-between">
        <Skeleton className="h-11 w-full rounded-lg md:w-72" />
        <Skeleton className="h-11 w-full rounded-lg md:w-80" />
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-32" />
        {[0, 1, 2, 3, 4].map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-8 w-24 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
