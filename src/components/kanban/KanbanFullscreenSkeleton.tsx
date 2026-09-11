import { Skeleton } from "@/components/ui/skeleton";

export function KanbanFullscreenSkeleton({
  title,
  background,
}: {
  title: string;
  background?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-[var(--background)] max-sm:pb-[env(safe-area-inset-bottom)] sm:h-screen sm:pb-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={background ? { background } : undefined}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/15 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6 sm:py-3 sm:pt-3">
          <Skeleton className="size-8 rounded-md bg-white/20" />
          <Skeleton className="size-8 rounded-md bg-white/20" />
          <h2 className="min-w-0 truncate text-base font-semibold text-white sm:text-lg">{title}</h2>
          <Skeleton className="ml-auto size-8 rounded-md bg-white/20 sm:h-8 sm:w-36" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pt-3 sm:gap-5 sm:overflow-visible sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <Skeleton className="h-11 w-full rounded-lg bg-white/25 sm:h-10 sm:w-64" />
            <div className="flex gap-1.5">
              <Skeleton className="size-9 rounded-md bg-white/25 sm:h-8 sm:w-28" />
              <Skeleton className="size-9 rounded-md bg-white/25 sm:hidden" />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="w-[calc(100vw-2.75rem)] shrink-0 space-y-2 rounded-xl border border-white/15 bg-white/10 p-2 sm:w-72"
              >
                <Skeleton className="h-9 w-full rounded-lg bg-white/25" />
                {Array.from({ length: 2 }).map((_, j) => (
                  <Skeleton key={j} className="h-32 w-full rounded-lg bg-white/20" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
