import { Skeleton } from "@/components/ui/skeleton";

export function CalculatorSkeleton() {
  return (
    <div
      className="lg:grid lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)] lg:items-start lg:gap-5"
      aria-busy="true"
      aria-label="Carregando a Calculadora"
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="space-y-2.5 border-b border-[var(--border)] p-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="divide-y divide-[var(--border)]">
          {[0, 1, 2, 3, 4, 5, 6].map((key) => (
            <div key={key} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-10 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden min-h-[22rem] rounded-xl border border-dashed border-[var(--border)] lg:block" />
    </div>
  );
}
