import { Skeleton } from "@/components/ui/skeleton";

export function ConfiguracoesSkeleton({ cards = 1 }: { cards?: number }) {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Carregando configurações"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <Skeleton className="size-10 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
