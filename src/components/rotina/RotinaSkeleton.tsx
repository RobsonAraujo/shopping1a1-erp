import { Skeleton } from "@/components/ui/skeleton";

export function RotinaSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando a Central de anúncios">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 sm:px-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
        <Skeleton className="mt-6 h-4 w-72" />
        <Skeleton className="mt-2 h-1.5 w-full max-w-md" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}
